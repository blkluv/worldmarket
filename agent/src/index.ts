import "dotenv/config";
import { agentFetch } from "./x402Client";
import { walletAddress } from "./wallet";
import { shouldBet } from "./strategy";
import { broadcastBet, broadcastCapHit } from "./xmtpBroadcast";

import { startCommandListener } from "./xmtpListener";

const API_URL = process.env.API_URL ?? "http://localhost:3001";
const BET_AMOUNT = "1000000"; // $1 USDC (6 decimals)
const LOOP_DELAY_MS = 5000;
const RETRY_DELAY_MS = 2000;

function ts(): string {
  return new Date().toISOString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface Market {
  id: number;
  question: string;
  status: string;
  price: { yes: number; no: number };
}

export interface BetResponse {
  data?: {
    txHash: string;
    marketId: number;
    outcome: boolean;
    amount: string;
    humanExposureAfter: string;
    humanCap: string;
    remainingCap: string;
  };
  error?: string;
  humanExposure?: string;
  humanCap?: string;
}

interface PriceResponse {
  data?: {
    marketId: number;
    price: { yes: number; no: number };
    yesPool: string;
    noPool: string;
  };
}

interface SimulateResponse {
  data?: {
    marketId: number;
    outcome: boolean;
    amountIn: string;
    sharesOut: string;
    priceImpact: number;
    priceBefore: { yes: number; no: number };
    priceAfter: { yes: number; no: number };
  };
}

interface MarketsResponse {
  data?: Market[];
}

export async function getMarkets(): Promise<Market[]> {
  const res = await agentFetch(`${API_URL}/markets`);
  if (!res.ok) throw new Error(`GET /markets failed: ${res.status}`);
  const json = (await res.json()) as MarketsResponse;
  return json.data ?? [];
}

async function getPrice(marketId: number): Promise<{ yes: number; no: number }> {
  const res = await agentFetch(`${API_URL}/markets/${marketId}/price`);
  if (!res.ok) throw new Error(`GET /markets/${marketId}/price failed: ${res.status}`);
  const json = (await res.json()) as PriceResponse;
  return json.data?.price ?? { yes: 0.5, no: 0.5 };
}

async function simulate(marketId: number, outcome: boolean, amount: string = BET_AMOUNT): Promise<SimulateResponse["data"] | null> {
  const res = await agentFetch(`${API_URL}/markets/${marketId}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outcome, amount }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as SimulateResponse;
  return json.data ?? null;
}

const AGENT_NAME = process.env.AGENT_STRATEGY ?? "contrarian";

export async function placeBet(marketId: number, outcome: boolean, amount: string = BET_AMOUNT): Promise<BetResponse> {
  const res = await agentFetch(`${API_URL}/markets/${marketId}/bet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ marketId, outcome, amount, wallet: walletAddress, agentName: AGENT_NAME }),
  });
  const json = (await res.json()) as BetResponse;
  return json;
}

async function run(): Promise<void> {
  console.log(`[${ts()}] 🤖 Agent starting — wallet: ${walletAddress}`);
  console.log(`[${ts()}] 📡 API: ${API_URL}`);

  if (process.env.XMTP_ENABLED === "true") {
    startCommandListener().catch((err) => {
      console.error(`[${ts()}] ❌ XMTP Listener failed:`, err);
    });
  }

  // Discover markets
  let markets: Market[];
  try {
    markets = await getMarkets();
  } catch (err) {
    console.error(`[${ts()}] ❌ Failed to fetch markets:`, err);
    process.exit(1);
  }

  if (markets.length === 0) {
    console.error(`[${ts()}] ❌ No markets available`);
    process.exit(1);
  }

  let marketIdx = 0;
  console.log(`[${ts()}] 📊 Trading ${markets.length} market(s) in rotation`);

  while (true) {
    const market = markets[marketIdx % markets.length];
    marketIdx++;
    const marketId = market.id ?? 0;
    try {
      // 1. Check price
      const price = await getPrice(marketId);
      console.log(`[${ts()}] 💰 Price — YES: ${price.yes.toFixed(4)}, NO: ${price.no.toFixed(4)}`);

      const decision = shouldBet(price);
      if (!decision.shouldBet) {
        console.log(`[${ts()}] ⏸  Market balanced — skipping bet`);
        await delay(LOOP_DELAY_MS);
        continue;
      }

      const outcomeName = decision.outcome ? "YES" : "NO";
      console.log(`[${ts()}] 🎯 Strategy: BET ${outcomeName} (confidence: ${decision.confidence.toFixed(4)})`);

      // 2. Simulate
      const sim = await simulate(marketId, decision.outcome);
      if (sim) {
        console.log(
          `[${ts()}] 🔮 Simulate: sharesOut=${sim.sharesOut}, priceImpact=${(sim.priceImpact * 100).toFixed(2)}%`
        );
      }

      // 3. Place bet (with retry on "Payment already attempted")
      let betResult: BetResponse;
      let attempts = 0;
      while (true) {
        attempts++;
        betResult = await placeBet(marketId, decision.outcome);

        if (betResult.error === "Payment already attempted") {
          console.log(`[${ts()}] ⏳ Payment already attempted — retrying in ${RETRY_DELAY_MS}ms...`);
          await delay(RETRY_DELAY_MS);
          continue;
        }
        break;
      }

      // 4. Handle cap hit
      if (betResult.error === "human cap exceeded") {
        console.log(`[${ts()}] 🛑 Human cap hit on market ${marketId} — skipping to next`);
        console.log(
          `[${ts()}]    exposure: ${betResult.humanExposure}, cap: ${betResult.humanCap}`
        );
        if (process.env.XMTP_ENABLED === "true") {
          await broadcastCapHit({
            marketId,
            wallet: walletAddress,
            humanExposure: betResult.humanExposure ?? "0",
            humanCap: betResult.humanCap ?? "0",
          }).catch((err: unknown) => {
            console.error(`[${ts()}] ⚠️  XMTP broadcastCapHit failed:`, err);
          });
        }
        await delay(LOOP_DELAY_MS);
        continue;
      }

      // 5. Handle insufficient balance
      if (betResult.error?.includes("insufficient")) {
        console.error(`[${ts()}] ❌ Insufficient USDC balance — stopping`);
        process.exit(1);
      }

      if (betResult.error) {
        console.error(`[${ts()}] ❌ Bet failed: ${betResult.error}`);
        await delay(LOOP_DELAY_MS);
        continue;
      }

      if (betResult.data) {
        const d = betResult.data;
        console.log(`[${ts()}] ✅ Bet placed!`);
        console.log(`[${ts()}]    tx: ${d.txHash}`);
        console.log(`[${ts()}]    outcome: ${d.outcome ? "YES" : "NO"}, amount: ${d.amount}`);
        console.log(
          `[${ts()}]    humanExposure: ${d.humanExposureAfter} / ${d.humanCap} (remaining: ${d.remainingCap})`
        );
        if (process.env.XMTP_ENABLED === "true") {
          await broadcastBet({
            marketId,
            outcome: d.outcome,
            amount: d.amount,
            wallet: walletAddress,
            txHash: d.txHash,
            humanExposureAfter: d.humanExposureAfter,
            humanCap: d.humanCap,
            remainingCap: d.remainingCap,
          }).catch((err: unknown) => {
            console.error(`[${ts()}] ⚠️  XMTP broadcastBet failed:`, err);
          });
        }
      }
    } catch (err) {
      console.error(`[${ts()}] ❌ Error in trading loop:`, err);
    }

    await delay(LOOP_DELAY_MS);
  }
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

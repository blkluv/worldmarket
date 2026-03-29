import "dotenv/config";
import { agentFetch } from "./x402Client.js";
import { walletAddress } from "./wallet.js";
import { shouldBet, sizeBet, betDelay } from "./strategy.js";
import { broadcastBet, broadcastCapHit } from "./xmtpBroadcast.js";

import { startCommandListener, startRelay, isAgentStopped } from "./xmtpListener.js";

const API_URL = process.env.API_URL ?? "http://localhost:3001";
const RETRY_DELAY_MS = 2000;
const BET_AMOUNT = "1000000"; // $1 base (actual size computed by sizeBet)

/** Score a market for this strategy — higher = more attractive to trade. */
function scoreMarket(price: { yes: number; no: number }, strategy: string): number {
  const imbalance = Math.abs(price.yes - 0.5);
  switch (strategy) {
    case "contrarian": return imbalance;          // biggest mispricing → best value
    case "momentum":   return imbalance;          // biggest trend to follow
    case "random":     return Math.random();      // no preference
    case "yes-only":   return 1 - price.yes;     // lowest YES price → most YES shares
    case "no-only":    return 1 - price.no;      // lowest NO price → most NO shares
    default:           return Math.random();
  }
}

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

  // Always start the HTTP relay so the Railway healthcheck at /messages succeeds
  startRelay();

  if (process.env.XMTP_ENABLED === "true") {
    startCommandListener().catch((err) => {
      console.error(`[${ts()}] ❌ XMTP Listener failed:`, err);
    });
  }

  // Discover markets — retry until API is available
  let markets: Market[] = [];
  while (markets.length === 0) {
    try {
      markets = await getMarkets();
    } catch (err) {
      console.error(`[${ts()}] ❌ Failed to fetch markets (retrying in 5s):`, (err as any)?.cause?.code ?? err);
      await delay(5000);
    }
  }

  if (markets.length === 0) {
    console.error(`[${ts()}] ❌ No markets available`);
    process.exit(1);
  }

  console.log(`[${ts()}] 📊 Evaluating all ${markets.length} market(s) per cycle (strategy: ${AGENT_NAME})`);

  let lastBetMarketId: number | null = null;
  let lastBetOutcome: boolean | null = null;

  while (true) {
    if (isAgentStopped()) {
      await delay(5000);
      continue;
    }
    // ── Pick the best market for this strategy via parallel price fetch ──────
    const priceResults = await Promise.allSettled(
      markets.map(async (m) => ({ market: m, price: await getPrice(m.id ?? 0) }))
    );

    let bestMarket: Market | null = null;
    let bestPrice: { yes: number; no: number } = { yes: 0.5, no: 0.5 };
    let bestScore = -Infinity;

    for (const r of priceResults) {
      if (r.status === "fulfilled") {
        const score = scoreMarket(r.value.price, AGENT_NAME);
        if (score > bestScore) {
          bestScore = score;
          bestMarket = r.value.market;
          bestPrice = r.value.price;
        }
      }
    }

    if (!bestMarket) {
      await delay(betDelay(AGENT_NAME));
      continue;
    }

    const marketId = bestMarket.id ?? 0;
    const price = bestPrice;

    try {
      console.log(
        `[${ts()}] 💰 Market ${marketId} — YES: ${price.yes.toFixed(4)}, NO: ${price.no.toFixed(4)} (score: ${bestScore.toFixed(4)})`
      );

      const decision = shouldBet(price);
      if (!decision.shouldBet) {
        console.log(`[${ts()}] ⏸  Market balanced — skipping bet`);
        await delay(betDelay(AGENT_NAME));
        continue;
      }

      const betAmount = sizeBet(decision.confidence, AGENT_NAME).toString();
      const outcomeName = decision.outcome ? "YES" : "NO";

      // Prevent repetitive trades on the same market/outcome in a row
      if (marketId === lastBetMarketId && decision.outcome === lastBetOutcome) {
        console.log(`[${ts()}] ⏭  Skipping repetitive bet on market ${marketId} (${outcomeName})`);
        await delay(betDelay(AGENT_NAME));
        continue;
      }

      console.log(
        `[${ts()}] 🎯 BET ${outcomeName} $${(Number(betAmount) / 1e6).toFixed(2)} on market ${marketId} (confidence: ${decision.confidence.toFixed(4)})`
      );

      // 2. Simulate with actual bet amount
      const sim = await simulate(marketId, decision.outcome, betAmount);
      if (sim) {
        console.log(
          `[${ts()}] 🔮 Simulate: sharesOut=${sim.sharesOut}, priceImpact=${(sim.priceImpact * 100).toFixed(2)}%`
        );
      }

      // 3. Place bet (with retry on "Payment already attempted")
      let betResult: BetResponse;
      while (true) {
        betResult = await placeBet(marketId, decision.outcome, betAmount);

        if (betResult.error === "Payment already attempted") {
          console.log(`[${ts()}] ⏳ Payment already attempted — retrying in ${RETRY_DELAY_MS}ms...`);
          await delay(RETRY_DELAY_MS);
          continue;
        }
        break;
      }

      // 4. Handle cap hit
      if (betResult!.error === "human cap exceeded") {
        console.log(`[${ts()}] 🛑 Human cap hit on market ${marketId} — skipping to next`);
        console.log(
          `[${ts()}]    exposure: ${betResult!.humanExposure}, cap: ${betResult!.humanCap}`
        );
        if (process.env.XMTP_ENABLED === "true") {
          await broadcastCapHit({
            marketId,
            humanExposure: betResult!.humanExposure ?? "0",
            humanCap: betResult!.humanCap ?? "0",
          }).catch((err: unknown) => {
            console.error(`[${ts()}] ⚠️  XMTP broadcastCapHit failed:`, err);
          });
        }
        await delay(betDelay(AGENT_NAME));
        continue;
      }

      // 5. Handle insufficient balance
      if (betResult!.error?.includes("insufficient")) {
        console.error(`[${ts()}] ❌ Insufficient USDC balance — stopping`);
        process.exit(1);
      }

      if (betResult!.error) {
        console.error(`[${ts()}] ❌ Bet failed: ${betResult!.error}`);
        await delay(betDelay(AGENT_NAME));
        continue;
      }

      if (betResult!.data) {
        const d = betResult!.data;
        lastBetMarketId = marketId;
        lastBetOutcome = decision.outcome;
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

    await delay(betDelay(AGENT_NAME));
  }
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

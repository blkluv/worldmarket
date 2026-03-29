import { Client, IdentifierKind } from "@xmtp/node-sdk";
import { createWalletClient, http, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { placeBet, getMarkets } from "./index.js";
import { walletAddress } from "./wallet.js";
import { shouldBet } from "./strategy.js";

const OWNER_ADDRESS = process.env.OWNER_ADDRESS?.toLowerCase();
const RELAY_PORT = parseInt(process.env.XMTP_RELAY_PORT ?? "3002");

// Single XMTP client — shared with xmtpBroadcast to use only ONE installation slot.
let sharedClient: Client | null = null;

// In-memory message store for the HTTP relay
export interface CachedMessage {
  id: string;
  content: string;
  sentAt: string;
  senderInboxId: string;
  isFromAgent: boolean;
}
const messageCache: CachedMessage[] = [];
const MAX_CACHED = 200;

export function getSharedClient(): Client | null {
  return sharedClient;
}

export function getMessageCache(): CachedMessage[] {
  return messageCache;
}

function addToCache(msg: CachedMessage) {
  if (messageCache.some((m) => m.id === msg.id)) return;
  messageCache.push(msg);
  if (messageCache.length > MAX_CACHED) messageCache.shift();
}

// ─── Command processing (shared between XMTP stream and HTTP relay) ───────────

export async function processCommand(text: string): Promise<string> {
  const lower = text.toLowerCase().trim();

  // ── Natural language trade: "trade $100", "invest $50 on best", etc. ────────
  const naturalTradeMatch = lower.match(
    /(?:trade|invest|bet|buy|put|yolo|use|spend)\s+\$?(\d+(?:\.\d+)?)/i
  );
  if (naturalTradeMatch) {
    const amountUsd = parseFloat(naturalTradeMatch[1]);
    if (amountUsd <= 0) return "❌ Amount must be greater than $0.";

    const amountMicro = Math.round(amountUsd * 1_000_000).toString();

    try {
      // Get all markets and their prices, pick the best opportunity
      const markets = await getMarkets();
      if (markets.length === 0) return "❌ No markets available right now.";

      // Find the market with the highest confidence signal
      let bestMarket = markets[0];
      let bestDecision = { shouldBet: false, outcome: true, confidence: 0 };

      for (const market of markets) {
        const price = (market as any).price ?? { yes: 0.5, no: 0.5 };
        const decision = shouldBet(price);
        if (decision.confidence > bestDecision.confidence) {
          bestMarket = market;
          bestDecision = decision;
        }
      }

      const outcomeName = bestDecision.outcome ? "YES" : "NO";
      console.log(`[xmtpListener] 🧠 Auto-trade: $${amountUsd} on ${outcomeName} for market ${bestMarket.id}`);

      const result = await placeBet(bestMarket.id, bestDecision.outcome, amountMicro);
      if (result.data) {
        const d = result.data;
        const txShort = d.txHash?.slice(0, 10) ?? "n/a";
        const exposureUsdc = (parseInt(d.humanExposureAfter) / 1_000_000).toFixed(2);
        const capUsdc = (parseInt(d.humanCap) / 1_000_000).toFixed(2);
        return `✅ Trade executed!
- Market: ${bestMarket.question}
- Bet: $${amountUsd} on ${outcomeName} (confidence: ${(bestDecision.confidence * 100).toFixed(1)}%)
- Tx: ${txShort}...
- Exposure: $${exposureUsdc} / $${capUsdc} cap`;
      }
      if (result.error === "human cap exceeded") {
        return `🛑 Human exposure cap hit — can't place more trades right now.\n- Exposure: $${(parseInt(result.humanExposure ?? "0") / 1_000_000).toFixed(2)} / $${(parseInt(result.humanCap ?? "0") / 1_000_000).toFixed(2)} cap`;
      }
      return `❌ Trade failed: ${result.error}`;
    } catch (err: any) {
      return `❌ Error executing trade: ${err.message}`;
    }
  }

  // ── Explicit bet: "bet $X on yes/no for market Y" ───────────────────────────
  const betMatch = lower.match(/bet \$?(\d+) on (yes|no) for market (\d+)/i);
  if (betMatch) {
    const [, amountStr, outcomeStr, marketIdStr] = betMatch;
    const amount = (parseInt(amountStr) * 1_000_000).toString();
    const outcome = outcomeStr.toLowerCase() === "yes";
    const marketId = parseInt(marketIdStr);
    console.log(`[xmtpListener] 🎯 Explicit bet: $${amountStr} on ${outcomeStr} for market ${marketId}`);
    try {
      const result = await placeBet(marketId, outcome, amount);
      if (result.data) {
        return `✅ Bet placed! Tx: ${result.data.txHash.slice(0, 10)}...`;
      }
      return `❌ Bet failed: ${result.error}`;
    } catch (err: any) {
      return `❌ Error executing bet: ${err.message}`;
    }
  }

  // ── Status ───────────────────────────────────────────────────────────────────
  if (lower === "status" || lower.includes("how are you") || lower.includes("what's up")) {
    return `🤖 Agent Status:
- Wallet: ${walletAddress}
- API: ${process.env.API_URL || "http://localhost:3001"}
- Owner: ${OWNER_ADDRESS || "Not set"}
- XMTP: ${sharedClient ? `connected (${sharedClient.inboxId?.slice(0, 8)}...)` : "connecting..."}`;
  }

  // ── Markets list ─────────────────────────────────────────────────────────────
  if (lower === "markets" || lower.includes("what markets") || lower.includes("show markets") || lower.includes("list markets")) {
    try {
      const markets = await getMarkets();
      const marketList = markets
        .map((m: any) => {
          const yes = ((m.price?.yes ?? 0.5) * 100).toFixed(0);
          const no = ((m.price?.no ?? 0.5) * 100).toFixed(0);
          return `#${m.id}: ${m.question} (YES ${yes}% / NO ${no}%)`;
        })
        .join("\n");
      return `📊 Active Markets:\n${marketList}`;
    } catch (err: any) {
      return `❌ Error fetching markets: ${err.message}`;
    }
  }

  // ── Help / fallback ──────────────────────────────────────────────────────────
  return `👋 I'm your AI trading agent. Try:
- "trade $100 on what you think is best"
- "invest $50"
- "bet $25 on yes for market 1"
- "markets" — list open markets
- "status" — agent info`;
}

// ─── Tiny HTTP relay server ───────────────────────────────────────────────────

function startRelayServer() {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Content-Type", "application/json");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // GET /messages — return cached messages
    if (req.method === "GET" && req.url === "/messages") {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, messages: messageCache }));
      return;
    }

    // POST /send — process command and add to cache
    if (req.method === "POST" && req.url === "/send") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const { text } = JSON.parse(body);
          if (!text?.trim()) {
            res.writeHead(400);
            res.end(JSON.stringify({ ok: false, error: "Empty message" }));
            return;
          }

          // 1. Add user message to cache immediately
          const userMsgId = `user-${Date.now()}`;
          addToCache({
            id: userMsgId,
            content: text,
            sentAt: new Date().toISOString(),
            senderInboxId: "demo-user",
            isFromAgent: false,
          });

          // 2. Process command and generate response
          const response = await processCommand(text);

          // 3. Cache the agent response
          const agentMsgId = `agent-${Date.now()}`;
          addToCache({
            id: agentMsgId,
            content: response,
            sentAt: new Date().toISOString(),
            senderInboxId: sharedClient?.inboxId ?? "agent",
            isFromAgent: true,
          });

          // 4. Optionally also send via XMTP if a real conversation exists
          const groupId = process.env.XMTP_GROUP_ID;
          if (sharedClient && groupId) {
            try {
              const conversation = await sharedClient.conversations.getConversationById(groupId);
              if (conversation) {
                await conversation.sendText(response);
              }
            } catch (_) {
              // XMTP send is best-effort; the HTTP cache is the source of truth for the demo
            }
          }

          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
        } catch (err: any) {
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ ok: false, error: "Not found" }));
  });

  server.listen(RELAY_PORT, () => {
    console.log(`[xmtpListener] 🌐 XMTP relay server on http://localhost:${RELAY_PORT}`);
  });
}

// ─── XMTP listener ────────────────────────────────────────────────────────────

export async function startCommandListener() {
  const privateKey = process.env.XMTP_WALLET_KEY || process.env.AGENT_PRIVATE_KEY;
  if (!privateKey) {
    console.warn("[xmtpListener] XMTP_WALLET_KEY not set — listener disabled");
    return;
  }

  // Start relay immediately so the frontend can connect even before XMTP is ready
  startRelayServer();

  try {
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      transport: http(),
      chain: baseSepolia,
    });

    const signer: any = {
      type: "EOA",
      getIdentifier: () => ({
        identifier: account.address.toLowerCase(),
        identifierKind: IdentifierKind.Ethereum,
      }),
      signMessage: async (message: string) => {
        const sig = await walletClient.signMessage({ message });
        return toBytes(sig);
      },
    };

    const xmtpEnv = (process.env.XMTP_ENV as any) ?? "dev";
    const client = await Client.create(signer, {
      env: xmtpEnv,
      dbPath: `./xmtp-agent.db`,
    });

    sharedClient = client;

    console.log(`[xmtpListener] 🤖 XMTP Client ready`);
    console.log(`[xmtpListener]    Address : ${account.address}`);
    console.log(`[xmtpListener]    InboxId : ${client.inboxId}`);
    console.log(`[xmtpListener] 🎧 Listening for XMTP messages...`);

    await client.conversations.sync();
    const stream = await client.conversations.streamAllMessages();

    for await (const message of stream) {
      await handleXmtpMessage(client, message);
    }
  } catch (err) {
    console.error("[xmtpListener] Failed to initialize XMTP:", err);
  }
}

async function handleXmtpMessage(client: Client, message: any) {
  if (!message || typeof message.content !== "string") return;

  const isFromAgent = message.senderInboxId === client.inboxId;

  // Cache all messages so the relay can serve them
  addToCache({
    id: message.id ?? `xmtp-${Date.now()}`,
    content: message.content,
    sentAt: message.sentAt instanceof Date
      ? message.sentAt.toISOString()
      : new Date(message.sentAt).toISOString(),
    senderInboxId: message.senderInboxId,
    isFromAgent,
  });

  if (isFromAgent) return;

  // Track active conversation for broadcast
  if (message.conversationId && process.env.XMTP_GROUP_ID !== message.conversationId) {
    console.log(`[xmtpListener] 🎯 Tracking conversation: ${message.conversationId}`);
    process.env.XMTP_GROUP_ID = message.conversationId;
  }

  const text = message.content;
  console.log(`[xmtpListener] 💬 XMTP message: "${text}" from ${message.senderInboxId}`);

  // Process and reply via XMTP
  const response = await processCommand(text);
  try {
    const conversation = await client.conversations.getConversationById(message.conversationId);
    if (conversation) {
      await conversation.sendText(response);
      addToCache({
        id: `reply-${message.id}`,
        content: response,
        sentAt: new Date().toISOString(),
        senderInboxId: client.inboxId,
        isFromAgent: true,
      });
    }
  } catch (e) {
    console.error("[xmtpListener] Failed to send XMTP reply:", e);
  }
}

import "dotenv/config";
import { getSharedClient, getMessageCache, type CachedMessage } from "./xmtpListener.js";
import { walletAddress } from "./wallet.js";

function addBroadcastToCache(content: string) {
  // content is already JSON stringified envelope
  const cache = getMessageCache();
  const msg: CachedMessage = {
    id: `broadcast-${Date.now()}-${Math.random()}`,
    content,
    sentAt: new Date().toISOString(),
    senderInboxId: "agent-broadcast",
    isFromAgent: true,
  };
  cache.push(msg);
  if (cache.length > 200) cache.shift();
}

// Reuses the agent's XMTP client so we never create a second installation.
// All broadcasts go to the conversation that sent the last command
// (tracked via XMTP_GROUP_ID env var, set by xmtpListener).

async function sendToConversation(text: string) {
  const client = getSharedClient();
  if (!client) {
    console.warn("[xmtpBroadcast] Client not ready — skipping broadcast");
    return;
  }

  const groupId = process.env.XMTP_GROUP_ID;
  if (!groupId) {
    console.warn("[xmtpBroadcast] XMTP_GROUP_ID not set — broadcast disabled");
    return;
  }

  try {
    await client.conversations.sync();
    const all = await client.conversations.list();
    const conversation = all.find((c: any) => c.id === groupId);

    if (!conversation) {
      console.warn(`[xmtpBroadcast] Conversation ${groupId} not found — skipping broadcast`);
      return;
    }

    await conversation.sendText(text);
  } catch (err) {
    console.error("[xmtpBroadcast] Failed to send broadcast:", err);
  }
  // Always add to relay cache so frontend sees it even if XMTP send fails
  addBroadcastToCache(text);
}

export async function broadcastBet(data: {
  marketId: number;
  outcome: boolean;
  amount: string;
  txHash: string;
  humanExposureAfter: string;
  humanCap: string;
  remainingCap: string;
}) {
  const outcomeText = data.outcome ? "YES" : "NO";
  const amountUsdc = (parseInt(data.amount) / 1_000_000).toFixed(2);
  const msg = `🎰 Agent placed a bet!
- Market: ${data.marketId}
- Outcome: ${outcomeText}
- Amount: $${amountUsdc}
- Tx: ${data.txHash ? data.txHash.slice(0, 10) + "..." : "N/A"}
- Exposure: $${(parseInt(data.humanExposureAfter) / 1_000_000).toFixed(2)} / $${(parseInt(data.humanCap) / 1_000_000).toFixed(2)}`;
  
  const envelope = {
    type: "bet",
    data: {
      ...data,
      wallet: walletAddress,
      text: msg
    },
    timestamp: new Date().toISOString()
  };
  await sendToConversation(JSON.stringify(envelope));
}

export async function broadcastCapHit(data: {
  marketId: number;
  humanExposure: string;
  humanCap: string;
}) {
  const currentUsdc = (parseInt(data.humanExposure) / 1_000_000).toFixed(2);
  const limitUsdc = (parseInt(data.humanCap) / 1_000_000).toFixed(2);
  const msg = `⚠️ Human Exposure Cap Hit!
- Current: $${currentUsdc}
- Limit: $${limitUsdc}
- Action: Throttling trades until cap reset.`;
  
  const envelope = {
    type: "cap_hit",
    data: {
      ...data,
      wallet: walletAddress,
      text: msg
    },
    timestamp: new Date().toISOString()
  };
  await sendToConversation(JSON.stringify(envelope));
}

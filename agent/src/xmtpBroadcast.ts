import "dotenv/config";
import { createWalletClient, http, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

// @xmtp/node-sdk is ESM-only. Avoid static imports so this CommonJS
// module can still compile. Types are inlined rather than imported.
/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadXmtp(): Promise<any> {
  // Dynamic import is allowed in CommonJS (Node16 target) even for ESM packages
  return import("@xmtp/node-sdk" as string) as Promise<any>;
}

// ─── Broadcast payload types ────────────────────────────────────────────────

export interface BetBroadcastData {
  marketId: number;
  outcome: boolean;
  amount: string;
  wallet: string;
  txHash: string;
  humanExposureAfter: string;
  humanCap: string;
  remainingCap: string;
}

export interface CapHitBroadcastData {
  marketId: number;
  wallet: string;
  humanExposure: string;
  humanCap: string;
}

type XmtpEnvelope =
  | { type: "bet"; data: BetBroadcastData; timestamp: string }
  | { type: "cap_hit"; data: CapHitBroadcastData; timestamp: string };

// ─── XMTP client state (opaque type to avoid static ESM import) ─────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let xmtpClient: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getClient(): Promise<any> {
  if (xmtpClient) return xmtpClient;

  const privateKey = process.env.AGENT_PRIVATE_KEY;
  if (!privateKey) {
    console.warn("[xmtpBroadcast] AGENT_PRIVATE_KEY not set — XMTP disabled");
    return null;
  }

  const groupId = process.env.XMTP_GROUP_ID;
  if (!groupId) {
    console.warn("[xmtpBroadcast] XMTP_GROUP_ID not set — XMTP disabled");
    return null;
  }

  try {
    const { Client: XmtpClient, IdentifierKind } = await loadXmtp();

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      transport: http(),
      chain: baseSepolia,
    });

    const signer = {
      type: "EOA" as const,
      getIdentifier: () => ({
        identifier: account.address,
        identifierKind: IdentifierKind.Ethereum as number,
      }),
      signMessage: async (message: string) => {
        const sig = await walletClient.signMessage({ message });
        return toBytes(sig);
      },
    };

    const xmtpEnv = process.env.XMTP_ENV ?? "dev";
    xmtpClient = await XmtpClient.create(signer, {
      env: xmtpEnv,
      dbPath: `/tmp/xmtp-agent-${account.address}.db`,
    });

    console.log(
      `[xmtpBroadcast] XMTP client ready — inboxId: ${xmtpClient.inboxId}`
    );
    return xmtpClient;
  } catch (err) {
    console.error("[xmtpBroadcast] Failed to initialize XMTP client:", err);
    return null;
  }
}

// ─── Internal send helper ───────────────────────────────────────────────

async function send(envelope: XmtpEnvelope): Promise<void> {
  const client = await getClient();
  if (!client) return;

  const groupId = process.env.XMTP_GROUP_ID;
  if (!groupId) return;

  try {
    await client.conversations.sync();
    const conversation = await client.conversations.getConversationById(groupId);
    if (!conversation) {
      console.warn(
        `[xmtpBroadcast] Group ${groupId} not found — skipping broadcast`
      );
      return;
    }
    await conversation.sendText(JSON.stringify(envelope));
  } catch (err) {
    console.error("[xmtpBroadcast] Failed to broadcast message:", err);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Broadcast a successful bet placement to the XMTP agent-chat group.
 * Called by Track E (agent/src/index.ts) after each confirmed bet.
 */
export async function broadcastBet(data: BetBroadcastData): Promise<void> {
  await send({ type: "bet", data, timestamp: new Date().toISOString() });
}

/**
 * Broadcast a human-cap-hit event to the XMTP agent-chat group.
 * Called by Track E (agent/src/index.ts) when the cap is exceeded.
 */
export async function broadcastCapHit(data: CapHitBroadcastData): Promise<void> {
  await send({ type: "cap_hit", data, timestamp: new Date().toISOString() });
}

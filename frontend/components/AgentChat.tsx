"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { fromHex } from "viem";
import { Client, type Signer, IdentifierKind } from "@xmtp/browser-sdk";

// ─── Message payload shapes (mirrors xmtpBroadcast.ts) ───────────────────────

interface BetData {
  marketId: number;
  outcome: boolean;
  amount: string;
  wallet: string;
  txHash: string;
  humanExposureAfter: string;
  humanCap: string;
  remainingCap: string;
}

interface CapHitData {
  marketId: number;
  wallet: string;
  humanExposure: string;
  humanCap: string;
}

type AgentEnvelope =
  | { type: "bet"; data: BetData; timestamp: string }
  | { type: "cap_hit"; data: CapHitData; timestamp: string };

function isAgentEnvelope(value: unknown): value is AgentEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return obj["type"] === "bet" || obj["type"] === "cap_hit";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function usdAmount(amount: string): string {
  return `$${(Number(amount) / 1_000_000).toFixed(2)}`;
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface AgentChatProps {
  /** XMTP group ID to subscribe to — set via NEXT_PUBLIC_XMTP_GROUP_ID */
  groupId: string;
  /** Agent XMTP address to send commands to — set via NEXT_PUBLIC_AGENT_XMTP_ADDRESS */
  agentAddress?: string;
}

type ChatStatus =
  | "idle"
  | "connecting"
  | "live"
  | "no_group"
  | "error";

interface ChatEntry {
  id: string;
  receivedAt: string;
  envelope: AgentEnvelope | { type: "user_command"; text: string };
}

export function AgentChat({ groupId, agentAddress }: AgentChatProps) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [status, setStatus] = useState<ChatStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [command, setCommand] = useState("");
  const [isSending, setIsSending] = useState(false);
  
  const clientRef = useRef<Client | null>(null);
  const streamCloserRef = useRef<(() => void) | null>(null);

  // Tear down the previous stream whenever the wallet changes
  useEffect(() => {
    return () => {
      streamCloserRef.current?.();
      streamCloserRef.current = null;
      clientRef.current = null;
    };
  }, [address]);

  useEffect(() => {
    if (!isConnected || !address || !groupId) {
      setStatus("idle");
      return;
    }

    let cancelled = false;

    async function connect(): Promise<void> {
      setStatus("connecting");
      setErrorMsg("");

      try {
        const signer: Signer = {
          type: "EOA",
          getIdentifier: () => ({
            identifier: address as string,
            identifierKind: IdentifierKind.Ethereum,
          }),
          signMessage: async (message: string) => {
            const hex = await signMessageAsync({ message });
            return fromHex(hex, "bytes");
          },
        };

        const xmtpEnv = (process.env.NEXT_PUBLIC_XMTP_ENV ?? "dev") as "dev" | "production";
        // Cast needed: TypeScript struggles with the union in ClientOptions
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = await Client.create(signer, { env: xmtpEnv } as any);
        clientRef.current = client;

        if (cancelled) return;

        await client.conversations.sync();

        const conversation = await client.conversations.getConversationById(groupId);

        if (!conversation) {
          setStatus("no_group");
          return;
        }

        setStatus("live");

        // Replay existing messages in this conversation
        const existing = await conversation.messages();
        if (!cancelled) {
          const parsed: ChatEntry[] = [];
          for (const msg of existing) {
            if (typeof msg.content !== "string") continue;
            try {
              const raw = JSON.parse(msg.content) as unknown;
              if (isAgentEnvelope(raw)) {
                parsed.push({
                  id: msg.id,
                  receivedAt: msg.sentAt.toISOString(),
                  envelope: raw,
                });
              } else {
                // Check if it's a user command (plain text not matching agent envelope)
                parsed.push({
                  id: msg.id,
                  receivedAt: msg.sentAt.toISOString(),
                  envelope: { type: "user_command" as const, text: msg.content },
                });
              }
            } catch {
              // If not JSON, it's likely a plain text user command
              parsed.push({
                id: msg.id,
                receivedAt: msg.sentAt.toISOString(),
                envelope: { type: "user_command" as const, text: msg.content },
              });
            }
          }
          setEntries(parsed.reverse().slice(0, 100));
        }

        // Stream new messages
        const stream = await conversation.stream();
        if (cancelled) {
          void stream.return();
          return;
        }

        streamCloserRef.current = () => void stream.return();

        for await (const msg of stream) {
          if (cancelled) break;
          if (typeof msg.content !== "string") continue;
          try {
            const raw = JSON.parse(msg.content) as unknown;
            if (isAgentEnvelope(raw)) {
              const entry: ChatEntry = {
                id: msg.id,
                receivedAt: msg.sentAt.toISOString(),
                envelope: raw,
              };
              setEntries((prev) => [entry, ...prev].slice(0, 100));
            } else {
              setEntries((prev) => [
                {
                  id: msg.id,
                  receivedAt: msg.sentAt.toISOString(),
                  envelope: { type: "user_command" as const, text: msg.content as string },
                },
                ...prev
              ].slice(0, 100));
            }
          } catch {
            setEntries((prev) => [
              {
                id: msg.id,
                receivedAt: msg.sentAt.toISOString(),
                envelope: { type: "user_command" as const, text: msg.content as string },
              },
              ...prev
            ].slice(0, 100));
          }
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Unknown error";
        setStatus("error");
        setErrorMsg(msg);
      }
    }

    void connect();

    return () => {
      cancelled = true;
      streamCloserRef.current?.();
      streamCloserRef.current = null;
    };
  }, [address, isConnected, groupId, signMessageAsync]);

  const handleSendCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || !clientRef.current || !groupId || isSending) return;

    setIsSending(true);
    try {
      const conversation = await clientRef.current.conversations.getConversationById(groupId);
      if (conversation) {
        await conversation.sendText(command);
        setCommand("");
      } else {
        setErrorMsg("Could not find conversation to send command.");
      }
    } catch (err) {
      console.error("Failed to send command:", err);
      setErrorMsg("Failed to send command.");
    } finally {
      setIsSending(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <div className="agent-chat">
        <div className="agent-chat__header">
          <span className="agent-chat__title font-sans">AGENT CHAT</span>
          <span className="agent-chat__badge agent-chat__badge--xmtp font-mono">
            XMTP
          </span>
        </div>
        <div className="agent-chat__connect-prompt font-mono">
          Connect your wallet to join the agent broadcast channel.
        </div>
      </div>
    );
  }

  return (
    <div className="agent-chat">
      <div className="agent-chat__header">
        <span className="agent-chat__title font-sans">AGENT CHAT</span>
        <span
          className={`agent-chat__status agent-chat__status--${status} font-mono`}
        >
          {status === "live"
            ? "● LIVE"
            : status === "connecting"
              ? "○ CONNECTING"
              : status === "no_group"
                ? "✕ NO GROUP"
                : status === "error"
                  ? "✕ ERROR"
                  : "—"}
        </span>
        <span className="agent-chat__badge agent-chat__badge--xmtp font-mono">
          XMTP
        </span>
      </div>

      {status === "error" && (
        <div className="agent-chat__error font-mono">{errorMsg}</div>
      )}

      {status === "no_group" && (
        <div className="agent-chat__error font-mono">
          Group not found. Verify NEXT_PUBLIC_XMTP_GROUP_ID is correct and your
          wallet has been added to the broadcast group.
        </div>
      )}

      <div
        className="agent-chat__list"
        role="log"
        aria-live="polite"
        aria-label="Agent XMTP activity"
      >
        {entries.length === 0 && status === "live" && (
          <div className="agent-chat__empty font-mono">
            Waiting for agent messages…
          </div>
        )}

        {entries.map((entry) => (
          <div
            key={entry.id}
            className={`agent-chat__entry agent-chat__entry--${entry.envelope.type}`}
          >
            <span className="agent-chat__time font-mono">
              {new Date(entry.receivedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>

            {entry.envelope.type === "bet" && (
              <span className="agent-chat__body font-mono">
                <span className="agent-chat__addr">
                  {shortAddr(entry.envelope.data.wallet)}
                </span>
                {" bet "}
                <span className="agent-chat__amount">
                  {usdAmount(entry.envelope.data.amount)}
                </span>
                {" on "}
                <span
                  className={
                    entry.envelope.data.outcome
                      ? "agent-chat__yes"
                      : "agent-chat__no"
                  }
                >
                  {entry.envelope.data.outcome ? "YES" : "NO"}
                </span>
                {" "}
                <a
                  className="agent-chat__tx"
                  href={`https://sepolia.basescan.org/tx/${entry.envelope.data.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View transaction on BaseScan`}
                >
                  {shortHash(entry.envelope.data.txHash)}↗
                </a>
                <span className="agent-chat__cap-hint font-mono">
                  {" "}cap{" "}
                  {usdAmount(entry.envelope.data.humanExposureAfter)}/
                  {usdAmount(entry.envelope.data.humanCap)}
                </span>
              </span>
            )}

            {entry.envelope.type === "cap_hit" && (
              <span className="agent-chat__body agent-chat__body--cap font-mono">
                🛑{" "}
                <span className="agent-chat__addr">
                  {shortAddr(entry.envelope.data.wallet)}
                </span>
                {" hit cap — "}
                {usdAmount(entry.envelope.data.humanExposure)} /{" "}
                {usdAmount(entry.envelope.data.humanCap)}
              </span>
            )}

            {entry.envelope.type === "user_command" && (
              <span className="agent-chat__body agent-chat__body--user font-mono">
                💬 <span className="agent-chat__user-text">{entry.envelope.text}</span>
              </span>
            )}
          </div>
        ))}
      </div>

      {status === "live" && (
        <form className="agent-chat__footer" onSubmit={handleSendCommand}>
          <input
            type="text"
            className="agent-chat__input font-mono"
            placeholder="Type a command (e.g. 'bet $5 on yes for market 0')..."
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            disabled={isSending}
          />
          <button 
            type="submit" 
            className="agent-chat__send-btn font-mono"
            disabled={isSending || !command.trim()}
          >
            {isSending ? "..." : "SEND"}
          </button>
        </form>
      )}
    </div>
  );
}

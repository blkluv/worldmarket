"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAccount } from "wagmi";

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
  groupId: string;
  agentAddress?: string;
}

type ChatStatus = "idle" | "connecting" | "live" | "no_group" | "error";

interface ChatEntry {
  id: string;
  receivedAt: string;
  envelope: AgentEnvelope | { type: "user_command"; text: string };
}

const POLL_INTERVAL_MS = 3000;

export function AgentChat({ groupId, agentAddress }: AgentChatProps) {
  const { isConnected } = useAccount();

  const [status, setStatus] = useState<ChatStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [command, setCommand] = useState("");
  const [isSending, setIsSending] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries]);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch("/api/xmtp");
      const data = await res.json();
      if (!data.ok) {
        if (status !== "error") {
          setStatus("error");
          setErrorMsg(data.error ?? "Failed to connect to XMTP");
        }
        return;
      }

      if (status !== "live") setStatus("live");

      const newEntries: ChatEntry[] = [];
      for (const msg of data.messages as any[]) {
        if (knownIdsRef.current.has(msg.id)) continue;
        knownIdsRef.current.add(msg.id);
        let envelope: ChatEntry["envelope"];
        try {
          const raw = JSON.parse(msg.content) as unknown;
          envelope = isAgentEnvelope(raw) ? raw : { type: "user_command", text: msg.content };
        } catch {
          envelope = { type: "user_command", text: msg.content };
        }
        newEntries.push({ id: msg.id, receivedAt: msg.sentAt, envelope });
      }
      if (newEntries.length > 0) {
        setEntries((prev) => [...prev, ...newEntries].slice(-100));
      }
    } catch (err: any) {
      if (status !== "error") {
        setStatus("error");
        setErrorMsg(err.message ?? "Network error");
      }
    }
  }, [status]);

  // Start polling when connected
  useEffect(() => {
    if (!isConnected) {
      setStatus("idle");
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    setStatus("connecting");
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const handleSendCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || isSending) return;

    setIsSending(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/xmtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: command }),
      });
      const data = await res.json();
      if (data.ok) {
        // Optimistically add the sent message to the chat
        const tempId = `local-${Date.now()}`;
        knownIdsRef.current.add(tempId);
        setEntries((prev) => [...prev, {
          id: tempId,
          receivedAt: new Date().toISOString(),
          envelope: { type: "user_command", text: command },
        }].slice(-100));
        setCommand("");
        // Poll immediately to pick up agent reply
        setTimeout(fetchMessages, 1500);
      } else {
        setErrorMsg(data.error ?? "Failed to send message.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to send command.");
    } finally {
      setIsSending(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="agent-chat">
        <div className="agent-chat__header">
          <span className="agent-chat__title font-sans">AGENT CHAT</span>
          <span className="agent-chat__badge agent-chat__badge--xmtp font-mono">XMTP</span>
        </div>
        <div className="agent-chat__setup-hint font-mono">
          <p>Connect your wallet to join the agent broadcast channel.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-chat">
      <div className="agent-chat__header">
        <span className="agent-chat__title font-sans">AGENT CHAT</span>
        <span className={`agent-chat__status agent-chat__status--${status} font-mono`}>
          {status === "live" ? "● LIVE" :
           status === "connecting" ? "○ CONNECTING" :
           status === "no_group" ? "✕ NO GROUP" :
           status === "error" ? "✕ ERROR" : "—"}
        </span>
        <span className="agent-chat__badge agent-chat__badge--xmtp font-mono">XMTP</span>
      </div>

      <div className="agent-chat__list" ref={listRef}>
        {entries.length === 0 && status === "live" && (
          <div className="agent-chat__setup-hint font-mono">
            <p>● Live connection established.</p>
            <p>Waiting for agent activity or your first command...</p>
          </div>
        )}

        {status === "connecting" && (
          <div className="agent-chat__setup-hint font-mono">
            <p>○ Connecting to XMTP...</p>
          </div>
        )}

        {status === "error" && (
          <div className="agent-chat__error font-mono">{errorMsg}</div>
        )}

        {entries.map((entry) => (
          <div key={entry.id} className={`agent-chat__entry agent-chat__entry--${entry.envelope.type}`}>
            <span className="agent-chat__time font-mono">
              {new Date(entry.receivedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>

            {entry.envelope.type === "bet" && (
              <div className="agent-chat__body font-mono">
                <span className="agent-chat__addr">{shortAddr(entry.envelope.data.wallet)}</span>
                {" bet "}
                <span className="agent-chat__amount">{usdAmount(entry.envelope.data.amount)}</span>
                {" on "}
                <span className={entry.envelope.data.outcome ? "agent-chat__yes" : "agent-chat__no"}>
                  {entry.envelope.data.outcome ? "YES" : "NO"}
                </span>
                {" "}
                <a className="agent-chat__tx" href={`https://sepolia.basescan.org/tx/${entry.envelope.data.txHash}`} target="_blank" rel="noopener noreferrer">
                  {shortHash(entry.envelope.data.txHash)}↗
                </a>
              </div>
            )}

            {entry.envelope.type === "cap_hit" && (
              <div className="agent-chat__body agent-chat__body--cap font-mono">
                🛑 <span className="agent-chat__addr">{shortAddr(entry.envelope.data.wallet)}</span>
                {" hit cap — "}
                {usdAmount(entry.envelope.data.humanExposure)} / {usdAmount(entry.envelope.data.humanCap)}
              </div>
            )}

            {entry.envelope.type === "user_command" && (
              <div className="agent-chat__body font-mono">
                <span className="agent-chat__user-text">{entry.envelope.text}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <form className="agent-chat__footer" onSubmit={handleSendCommand}>
        <input
          type="text"
          className="agent-chat__input font-mono"
          placeholder={status === "live" ? "Type a command (e.g. 'status')..." : "Connecting to XMTP..."}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          disabled={status === "connecting" || isSending}
        />
        <button
          type="submit"
          className="agent-chat__send-btn font-mono"
          disabled={status === "connecting" || isSending || !command.trim()}
        >
          {isSending ? "..." : "SEND"}
        </button>
      </form>
    </div>
  );
}

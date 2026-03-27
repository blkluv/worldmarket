"use client";
import { useEffect, useState } from "react";
import {
  isBetEvent,
  isCapHitEvent,
  type BetEventPayload,
  type CapHitEventPayload,
} from "@/lib/types/events";

type FeedEntry =
  | { type: "bet"; ts: string; payload: BetEventPayload }
  | { type: "cap_hit"; ts: string; payload: CapHitEventPayload };

interface AgentFeedProps {
  apiUrl: string;
  marketId?: number;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function usdAmount(amount: string) {
  return `$${(Number(amount) / 1_000_000).toFixed(2)}`;
}

function shortHash(hash: string) {
  return `${hash.slice(0, 8)}…`;
}

export function AgentFeed({ apiUrl, marketId }: AgentFeedProps) {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "error">("connecting");

  useEffect(() => {
    const es = new EventSource(`${apiUrl}/stream`);

    es.addEventListener("open", () => setStatus("live"));
    es.addEventListener("error", () => setStatus("error"));

    es.addEventListener("bet", (e) => {
      try {
        const raw = JSON.parse((e as MessageEvent).data) as unknown;
        if (!isBetEvent(raw)) return;
        if (marketId !== undefined && raw.marketId !== marketId) return;
        setEntries((prev) =>
          [{ type: "bet" as const, ts: new Date().toISOString(), payload: raw }, ...prev].slice(0, 50)
        );
      } catch {
        // noop
      }
    });

    es.addEventListener("cap_hit", (e) => {
      try {
        const raw = JSON.parse((e as MessageEvent).data) as unknown;
        if (!isCapHitEvent(raw)) return;
        if (marketId !== undefined && raw.marketId !== marketId) return;
        setEntries((prev) =>
          [{ type: "cap_hit" as const, ts: new Date().toISOString(), payload: raw }, ...prev].slice(0, 50)
        );
      } catch {
        // noop
      }
    });

    return () => es.close();
  }, [apiUrl, marketId]);

  return (
    <div className="agent-feed">
      <div className="agent-feed__header">
        <span className="agent-feed__title font-sans">AGENT FEED</span>
        <span className={`agent-feed__status agent-feed__status--${status} font-mono`}>
          {status === "live" ? "● LIVE" : status === "connecting" ? "○ CONNECTING" : "✕ ERROR"}
        </span>
      </div>
      <div
        className="agent-feed__list"
        role="log"
        aria-live="polite"
        aria-label="Agent betting activity"
      >
        {entries.length === 0 && (
          <div className="agent-feed__empty font-mono">Waiting for agent activity…</div>
        )}
        {entries.map((entry, i) => (
          <div
            key={`${entry.ts}-${i}`}
            className={`agent-feed__entry agent-feed__entry--${entry.type}`}
            aria-label={entry.type === "bet" ? "Bet placed" : "Cap hit"}
          >
            <span className="agent-feed__time font-mono">
              {new Date(entry.ts).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
            {entry.type === "bet" && (
              <span className="agent-feed__body font-mono">
                <span className="agent-feed__addr">{shortAddr(entry.payload.wallet)}</span>
                {" bet "}
                <span className="agent-feed__amount">{usdAmount(entry.payload.amount)}</span>
                {" on "}
                <span className={entry.payload.outcome ? "agent-feed__yes" : "agent-feed__no"}>
                  {entry.payload.outcome ? "YES" : "NO"}
                </span>
                {" "}
                <a
                  className="agent-feed__tx"
                  href={`https://sepolia.basescan.org/tx/${entry.payload.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View transaction ${entry.payload.txHash} on BaseScan`}
                >
                  {shortHash(entry.payload.txHash)}↗
                </a>
              </span>
            )}
            {entry.type === "cap_hit" && (
              <span className="agent-feed__body agent-feed__body--cap font-mono">
                🛑{" "}
                <span className="agent-feed__addr">{shortAddr(entry.payload.wallet)}</span>
                {" hit cap — "}
                {usdAmount(entry.payload.humanExposure)} / {usdAmount(entry.payload.humanCap)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

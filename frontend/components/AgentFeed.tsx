"use client";

import { useEffect, useRef, useState } from "react";

interface BetEvent {
  type: "bet" | "cap_hit" | "ping";
  marketId?: number;
  outcome?: boolean;
  amount?: string;
  wallet?: string;
  txHash?: string;
  timestamp: string;
}

interface AgentFeedProps {
  apiUrl: string;
  marketId?: number;
}

function truncateWallet(wallet: string): string {
  if (wallet.length < 10) return wallet;
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

function formatAmount(amount: string): string {
  const n = Number(amount) / 1_000_000;
  return `$${n.toFixed(2)}`;
}

export function AgentFeed({ apiUrl, marketId }: AgentFeedProps) {
  const [events, setEvents] = useState<BetEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(`${apiUrl}/stream`);
    esRef.current = es;

    es.addEventListener("open", () => setConnected(true));

    es.addEventListener("bet", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as Omit<BetEvent, "type" | "timestamp">;
        if (marketId !== undefined && data.marketId !== marketId) return;
        setEvents((prev) =>
          [{ ...data, type: "bet" as const, timestamp: new Date().toISOString() }, ...prev].slice(0, 50)
        );
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener("cap_hit", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as Omit<BetEvent, "type" | "timestamp">;
        if (marketId !== undefined && data.marketId !== marketId) return;
        setEvents((prev) =>
          [{ ...data, type: "cap_hit" as const, timestamp: new Date().toISOString() }, ...prev].slice(0, 50)
        );
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener("error", () => setConnected(false));

    return () => {
      es.close();
    };
  }, [apiUrl, marketId]);

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "0.5rem",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "0.5rem 1rem",
          background: "#f9fafb",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          fontSize: "0.875rem",
        }}
      >
        <span
          style={{
            width: "0.5rem",
            height: "0.5rem",
            borderRadius: "50%",
            background: connected ? "#16a34a" : "#d1d5db",
            display: "inline-block",
          }}
        />
        <span style={{ color: "#6b7280" }}>{connected ? "Live" : "Connecting..."}</span>
      </div>

      {events.length === 0 ? (
        <div style={{ padding: "1.5rem", textAlign: "center", color: "#9ca3af", fontSize: "0.875rem" }}>
          Waiting for agent activity…
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {events.map((ev, i) => (
            <li
              key={i}
              style={{
                padding: "0.75rem 1rem",
                borderBottom: i < events.length - 1 ? "1px solid #f3f4f6" : "none",
                background: ev.type === "cap_hit" ? "#fef2f2" : "white",
              }}
            >
              {ev.type === "cap_hit" ? (
                <div>
                  <span style={{ color: "#dc2626", fontWeight: "600" }}>🛑 Cap Hit!</span>
                  {ev.wallet && (
                    <span style={{ color: "#6b7280", fontSize: "0.8rem", marginLeft: "0.5rem" }}>
                      {truncateWallet(ev.wallet)}
                    </span>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                    <span
                      style={{
                        padding: "0.1rem 0.4rem",
                        borderRadius: "0.25rem",
                        background: ev.outcome ? "#dcfce7" : "#fee2e2",
                        color: ev.outcome ? "#15803d" : "#dc2626",
                        fontWeight: "600",
                        fontSize: "0.75rem",
                      }}
                    >
                      {ev.outcome ? "YES" : "NO"}
                    </span>
                    <span style={{ fontWeight: "500" }}>{ev.amount ? formatAmount(ev.amount) : ""}</span>
                    {ev.wallet && (
                      <span style={{ color: "#9ca3af", fontSize: "0.8rem", fontFamily: "monospace" }}>
                        {truncateWallet(ev.wallet)}
                      </span>
                    )}
                  </div>
                  <span style={{ color: "#9ca3af", fontSize: "0.75rem" }}>
                    {new Date(ev.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

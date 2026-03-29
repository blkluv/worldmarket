"use client";
import { useEffect, useState } from "react";
import { isBetEvent } from "@/lib/types/events";

// ─── Agent cosmetics (mirrors agents/page.tsx) ────────────────────────────────
const AGENT_META: Record<string, { emoji: string; color: string; label: string }> = {
  contrarian: { emoji: "🤖", color: "oklch(74% 0.18 55)",  label: "WM-Alpha"   },
  momentum:   { emoji: "🤖", color: "oklch(65% 0.19 243)", label: "WM-Beta"    },
  random:     { emoji: "🤖", color: "oklch(65% 0.20 295)", label: "WM-Gamma"   },
  "yes-only": { emoji: "🤖", color: "oklch(65% 0.16 155)", label: "WM-Delta"   },
  "no-only":  { emoji: "🤖", color: "oklch(62% 0.20 25)",  label: "WM-Epsilon" },
};

function agentMeta(name: string) {
  return AGENT_META[name] ?? { emoji: "🤖", color: "oklch(60% 0.01 250)", label: name.toUpperCase() };
}

function usd(amount: string) {
  return `$${(Number(amount) / 1_000_000).toFixed(2)}`;
}

function shortHash(hash: string) {
  return `${hash.slice(0, 8)}…`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentPosition {
  yesVol: number;
  noVol: number;
  bets: number;
}

interface TapeEntry {
  id: string;
  ts: number;
  agentName: string;
  outcome: boolean;
  amount: string;
  txHash: string;
}

interface MarketAgentPanelProps {
  apiUrl: string;
  marketId: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MarketAgentPanel({ apiUrl, marketId }: MarketAgentPanelProps) {
  const [positions, setPositions] = useState<Map<string, AgentPosition>>(new Map());
  const [tape, setTape] = useState<TapeEntry[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "error">("connecting");
  const [newId, setNewId] = useState<string | null>(null);

  useEffect(() => {
    const es = new EventSource(`${apiUrl}/stream`);
    es.addEventListener("open", () => setStatus("live"));
    es.addEventListener("error", () => setStatus("error"));

    es.addEventListener("bet", (e) => {
      try {
        const raw = JSON.parse((e as MessageEvent).data) as unknown;
        if (!isBetEvent(raw)) return;
        if (raw.marketId !== marketId) return;

        const agName = (raw.agentName && raw.agentName.trim()) ? raw.agentName : "human";
        const amt = Number(raw.amount);

        // Accumulate per-agent position
        setPositions((prev) => {
          const next = new Map(prev);
          const existing = next.get(agName) ?? { yesVol: 0, noVol: 0, bets: 0 };
          next.set(agName, {
            yesVol: existing.yesVol + (raw.outcome ? amt : 0),
            noVol:  existing.noVol  + (raw.outcome ? 0 : amt),
            bets:   existing.bets + 1,
          });
          return next;
        });

        // Add to tape
        const entry: TapeEntry = {
          id: `${raw.txHash}-${Date.now()}`,
          ts: Date.now(),
          agentName: agName,
          outcome: raw.outcome,
          amount: raw.amount,
          txHash: raw.txHash,
        };
        setNewId(entry.id);
        setTape((prev) => [entry, ...prev].slice(0, 50));
        setTimeout(() => setNewId(null), 600);
      } catch {
        // noop
      }
    });

    return () => es.close();
  }, [apiUrl, marketId]);

  // Sort agents by total volume (most active first)
  const sortedAgents = [...positions.entries()].sort(
    ([, a], [, b]) => (b.yesVol + b.noVol) - (a.yesVol + a.noVol)
  );
  const maxVol = sortedAgents.reduce((m, [, p]) => Math.max(m, p.yesVol + p.noVol), 0) || 1;

  return (
    <div className="agent-panel">
      {/* Header */}
      <div className="agent-panel__header">
        <span className="agent-panel__title font-mono">AGENT ACTIVITY</span>
        <span className={`agent-panel__status agent-panel__status--${status} font-mono`}>
          {status === "live" ? "● LIVE" : status === "connecting" ? "○ CONNECTING" : "✕ ERROR"}
        </span>
      </div>

      {/* Positions */}
      <div className="agent-panel__positions">
        <div className="agent-panel__section-label font-mono">POSITIONS</div>
        {sortedAgents.length === 0 ? (
          <div className="agent-panel__empty font-mono">No agent trades on this market yet…</div>
        ) : (
          sortedAgents.map(([name, pos]) => {
            const meta = agentMeta(name);
            const total = pos.yesVol + pos.noVol;
            const yesFrac = total > 0 ? pos.yesVol / total : 0.5;
            const barWidthPct = (total / maxVol) * 100;
            return (
              <div key={name} className="agent-pos-row">
                <div className="agent-pos-row__identity">
                  <span className="agent-pos-row__emoji">{meta.emoji}</span>
                  <span className="agent-pos-row__name font-mono" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                  <span className="agent-pos-row__bets font-mono">{pos.bets}×</span>
                </div>
                <div
                  className="agent-pos-row__bar-wrap"
                  style={{ "--agent-color": meta.color } as React.CSSProperties}
                >
                  <div className="agent-pos-row__bar-track">
                    <div
                      className="agent-pos-row__bar"
                      style={{ width: `${barWidthPct}%` }}
                    >
                      <div
                        className="agent-pos-row__bar-yes"
                        style={{ width: `${yesFrac * 100}%` }}
                      />
                      <div
                        className="agent-pos-row__bar-no"
                        style={{ width: `${(1 - yesFrac) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="agent-pos-row__bar-labels font-mono">
                    <span className="agent-pos-row__yes-vol">
                      {usd(pos.yesVol.toString())} YES
                    </span>
                    <span className="agent-pos-row__no-vol">
                      {usd(pos.noVol.toString())} NO
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Trade tape */}
      <div className="agent-panel__section-label font-mono">TRADES</div>
      <div className="agent-panel__tape" role="log" aria-live="polite">
        {tape.length === 0 ? (
          <div className="agent-panel__empty font-mono">Waiting for trades…</div>
        ) : (
          tape.map((entry, i) => {
            const meta = agentMeta(entry.agentName);
            return (
              <div
                key={entry.id}
                className={`agent-tape-row${entry.id === newId ? " agent-tape-row--new" : ""}`}
                style={{ opacity: Math.max(0.3, 1 - i * 0.04) }}
              >
                <span className="agent-tape-row__time font-mono">
                  {new Date(entry.ts).toLocaleTimeString("en-US", {
                    hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
                  })}
                </span>
                <span className="agent-tape-row__agent font-mono" style={{ color: meta.color }}>
                  {meta.emoji} {meta.label}
                </span>
                <span
                  className="agent-tape-row__outcome font-mono"
                  data-outcome={entry.outcome ? "yes" : "no"}
                >
                  {entry.outcome ? "YES" : "NO "}
                </span>
                <span className="agent-tape-row__amount font-mono">{usd(entry.amount)}</span>
                <a
                  className="agent-tape-row__tx font-mono"
                  href={`https://sepolia.basescan.org/tx/${entry.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View tx ${entry.txHash}`}
                >
                  {shortHash(entry.txHash)}↗
                </a>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

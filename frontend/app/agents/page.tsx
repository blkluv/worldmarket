"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { isBetEvent, isCapHitEvent, isPriceUpdateEvent } from "@/lib/types/events";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Market {
  id: number;
  question: string;
  price: { yes: number; no: number };
  yesPool?: string;
  noPool?: string;
}

interface AgentStats {
  name: string;
  bets: number;
  volume: number; // raw USDC base units
  lastOutcome: boolean | null;
  lastTs: number | null;
  pulse: boolean;
}

interface FeedEntry {
  id: string;
  ts: number;
  agentName: string;
  marketId: number;
  outcome: boolean;
  amount: string;
  question: string;
}

interface GlobalStats {
  totalBets: number;
  totalVolume: string;
  activeAgents: number;
  marketsOpen: number;
}

// ─── Agent cosmetics ──────────────────────────────────────────────────────────

const AGENT_META: Record<string, { emoji: string; color: string; label: string }> = {
  contrarian: { emoji: "🔄", color: "oklch(74% 0.18 55)",  label: "CONTRARIAN" },
  momentum:   { emoji: "📈", color: "oklch(65% 0.19 243)", label: "MOMENTUM"   },
  random:     { emoji: "🎲", color: "oklch(65% 0.20 295)", label: "RANDOM"     },
  "yes-only": { emoji: "✅", color: "oklch(65% 0.16 155)", label: "YES-ONLY"   },
  "no-only":  { emoji: "❌", color: "oklch(62% 0.20 25)",  label: "NO-ONLY"    },
};

function agentMeta(name: string) {
  return AGENT_META[name] ?? { emoji: "🤖", color: "oklch(60% 0.01 250)", label: name.toUpperCase() };
}

function usd(amount: string | number): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  return `$${(n / 1_000_000).toFixed(2)}`;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function shortQ(q: string, max = 42): string {
  return q.length > max ? q.slice(0, max) + "…" : q;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const [markets, setMarkets]           = useState<Market[]>([]);
  const [agents, setAgents]             = useState<Map<string, AgentStats>>(new Map());
  const [feed, setFeed]                 = useState<FeedEntry[]>([]);
  const [streamStatus, setStreamStatus] = useState<"connecting" | "live" | "error">("connecting");
  const [globalStats, setGlobalStats]   = useState<GlobalStats | null>(null);
  const [tick, setTick]                 = useState(0);
  const esRef = useRef<EventSource | null>(null);
  const marketsRef = useRef<Market[]>([]);

  // Re-render every 15s to keep "X ago" timestamps fresh
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  // Initial data fetch
  useEffect(() => {
    fetch(`${API_URL}/markets/public`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { data?: Market[] }) => {
        const m = j.data ?? [];
        setMarkets(m);
        marketsRef.current = m;
      })
      .catch(() => {});

    fetch(`${API_URL}/stats`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { data?: GlobalStats }) => {
        if (j.data) setGlobalStats(j.data);
      })
      .catch(() => {});
  }, []);

  // SSE stream
  useEffect(() => {
    const es = new EventSource(`${API_URL}/stream`);
    esRef.current = es;

    es.addEventListener("open", () => setStreamStatus("live"));
    es.addEventListener("error", () => setStreamStatus("error"));

    es.addEventListener("bet", (e) => {
      try {
        const raw = JSON.parse((e as MessageEvent).data) as unknown;
        if (!isBetEvent(raw)) return;

        const name = raw.agentName ?? "unknown";
        const question = marketsRef.current.find((m) => m.id === raw.marketId)?.question ?? `Market #${raw.marketId}`;

        // Update agent map
        setAgents((prev) => {
          const next = new Map(prev);
          const existing = next.get(name) ?? {
            name,
            bets: 0,
            volume: 0,
            lastOutcome: null,
            lastTs: null,
            pulse: false,
          };
          next.set(name, {
            ...existing,
            bets: existing.bets + 1,
            volume: existing.volume + Number(raw.amount),
            lastOutcome: raw.outcome,
            lastTs: Date.now(),
            pulse: true,
          });
          // Clear pulse after 1.2s
          setTimeout(() => {
            setAgents((p) => {
              const m2 = new Map(p);
              const a = m2.get(name);
              if (a) m2.set(name, { ...a, pulse: false });
              return m2;
            });
          }, 1200);
          return next;
        });

        // Update global stats
        setGlobalStats((prev) =>
          prev
            ? { ...prev, totalBets: prev.totalBets + 1 }
            : null
        );

        // Add to feed
        const entry: FeedEntry = {
          id: `${Date.now()}-${Math.random()}`,
          ts: Date.now(),
          agentName: name,
          marketId: raw.marketId,
          outcome: raw.outcome,
          amount: raw.amount,
          question,
        };
        setFeed((prev) => [entry, ...prev].slice(0, 60));
      } catch {
        // noop
      }
    });

    es.addEventListener("price_update", (e) => {
      try {
        const raw = JSON.parse((e as MessageEvent).data) as unknown;
        if (!isPriceUpdateEvent(raw)) return;
        setMarkets((prev) =>
          prev.map((m) =>
            m.id === raw.marketId
              ? { ...m, price: raw.price, yesPool: raw.yesPool, noPool: raw.noPool }
              : m
          )
        );
        marketsRef.current = marketsRef.current.map((m) =>
          m.id === raw.marketId
            ? { ...m, price: raw.price, yesPool: raw.yesPool, noPool: raw.noPool }
            : m
        );
      } catch {
        // noop
      }
    });

    return () => es.close();
  }, []);

  const agentList = [...agents.values()].sort((a, b) => b.bets - a.bets);

  // Show known agent slots even before first bet
  const knownAgents = ["contrarian", "momentum", "random"];
  const allAgentNames = Array.from(
    new Set([...knownAgents, ...agentList.map((a) => a.name)])
  );

  return (
    <div className="page-shell">
      <header className="site-header">
        <div className="site-header__brand">
          <span className="site-header__mark">◈</span>
          <span className="site-header__name">WorldMarket</span>
        </div>
        <nav className="site-header__nav">
          <Link href="/" className="nav-link">← Markets</Link>
        </nav>
      </header>

      <main className="battle-page">
        {/* ── Page title row ─────────────────────────────────────────────── */}
        <div className="battle-header">
          <div className="battle-header__left">
            <h1 className="battle-title font-sans">Agent Battle</h1>
            <span
              className="battle-status font-mono"
              data-status={streamStatus}
            >
              {streamStatus === "live"       ? "● LIVE"
               : streamStatus === "connecting" ? "○ CONNECTING"
               : "✕ DISCONNECTED"}
            </span>
          </div>
          {globalStats && (
            <div className="battle-stats-bar font-mono">
              <span>{globalStats.totalBets} bets</span>
              <span className="battle-stats-bar__sep">·</span>
              <span>{usd(globalStats.totalVolume)} vol</span>
              <span className="battle-stats-bar__sep">·</span>
              <span>{globalStats.activeAgents} agents</span>
              <span className="battle-stats-bar__sep">·</span>
              <span>{globalStats.marketsOpen} markets</span>
            </div>
          )}
        </div>

        {/* ── Agent cards ────────────────────────────────────────────────── */}
        <section className="agent-cards" aria-label="Agent summary">
          {allAgentNames.map((name) => {
            const stats = agents.get(name);
            const meta  = agentMeta(name);
            return (
              <div
                key={name}
                className="agent-card"
                data-pulse={stats?.pulse ? "true" : undefined}
                style={{ "--agent-color": meta.color } as React.CSSProperties}
              >
                <div className="agent-card__top">
                  <span className="agent-card__emoji">{meta.emoji}</span>
                  <span className="agent-card__label font-mono">{meta.label}</span>
                </div>
                <div className="agent-card__bets font-mono">
                  {stats?.bets ?? 0}
                  <span className="agent-card__bets-label">bets</span>
                </div>
                <div className="agent-card__vol font-mono">
                  {usd(stats?.volume ?? 0)} vol
                </div>
                {stats?.lastOutcome !== null && stats?.lastTs ? (
                  <div
                    className="agent-card__last font-mono"
                    data-outcome={stats.lastOutcome ? "yes" : "no"}
                  >
                    last: {stats.lastOutcome ? "YES ↑" : "NO ↓"}
                    <span className="agent-card__last-time">
                      {timeAgo(stats.lastTs)}
                    </span>
                  </div>
                ) : (
                  <div className="agent-card__last agent-card__last--idle font-mono">
                    waiting…
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {/* ── Market pools ────────────────────────────────────────────────── */}
        <section className="battle-markets" aria-label="Market pools">
          <h2 className="battle-section-title font-sans">Markets</h2>
          {markets.map((m) => {
            const yesPct = Math.round((m.price?.yes ?? 0.5) * 100);
            const noPct  = 100 - yesPct;
            return (
              <div key={m.id} className="pool-row">
                <div className="pool-row__question font-sans">{m.question}</div>
                <div className="pool-row__bars">
                  <div className="pool-bar pool-bar--yes">
                    <div
                      className="pool-bar__fill"
                      style={{ width: `${yesPct}%` }}
                    />
                    <span className="pool-bar__label font-mono">YES {yesPct}%</span>
                  </div>
                  <div className="pool-bar pool-bar--no">
                    <div
                      className="pool-bar__fill"
                      style={{ width: `${noPct}%` }}
                    />
                    <span className="pool-bar__label font-mono">NO {noPct}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        {/* ── Live feed ───────────────────────────────────────────────────── */}
        <section className="battle-feed" aria-label="Live bet feed" aria-live="polite">
          <h2 className="battle-section-title font-sans">
            Live Feed
            {feed.length > 0 && (
              <span className="battle-feed__count font-mono">{feed.length}</span>
            )}
          </h2>
          {feed.length === 0 ? (
            <p className="battle-feed__empty font-mono">
              Waiting for bets…
            </p>
          ) : (
            <div className="battle-feed__list" role="log">
              {feed.map((entry) => {
                const meta = agentMeta(entry.agentName);
                return (
                  <div key={entry.id} className="feed-row">
                    <span className="feed-row__time font-mono">
                      {new Date(entry.ts).toLocaleTimeString("en-US", {
                        hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
                      })}
                    </span>
                    <span
                      className="feed-row__agent font-mono"
                      style={{ color: meta.color }}
                    >
                      {meta.emoji} {meta.label}
                    </span>
                    <span
                      className="feed-row__outcome font-mono"
                      data-outcome={entry.outcome ? "yes" : "no"}
                    >
                      {entry.outcome ? "YES" : "NO "}
                    </span>
                    <span className="feed-row__amount font-mono">
                      {usd(entry.amount)}
                    </span>
                    <span className="feed-row__question font-sans">
                      {shortQ(entry.question)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

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
  yesBets: number;
  recentBets: boolean[];
  betTimestamps: number[];
  volume: number;
  lastOutcome: boolean | null;
  lastTs: number | null;
  lastMarketId: number | null;
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

interface PricePoint {
  ts: number;
  yes: number;
  no: number;
}

// ─── Agent cosmetics ──────────────────────────────────────────────────────────

const AGENT_META: Record<string, { emoji: string; color: string; label: string; desc: string }> = {
  contrarian: { emoji: "🔄", color: "oklch(74% 0.18 55)",  label: "CONTRARIAN", desc: "Bets the underpriced side"    },
  momentum:   { emoji: "📈", color: "oklch(65% 0.19 243)", label: "MOMENTUM",   desc: "Follows the dominant outcome" },
  random:     { emoji: "🎲", color: "oklch(65% 0.20 295)", label: "RANDOM",     desc: "Coin flip on every market"   },
  "yes-only": { emoji: "✅", color: "oklch(65% 0.16 155)", label: "YES-ONLY",   desc: "Always bets YES"             },
  "no-only":  { emoji: "❌", color: "oklch(62% 0.20 25)",  label: "NO-ONLY",    desc: "Always bets NO"              },
};

function agentMeta(name: string) {
  return AGENT_META[name] ?? { emoji: "🤖", color: "oklch(60% 0.01 250)", label: name.toUpperCase(), desc: "Unknown strategy" };
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

function shortQ(q: string, max = 38): string {
  return q.length > max ? q.slice(0, max) + "…" : q;
}

// ─── Helper components ────────────────────────────────────────────────────────

// YES% price sparkline (polyline SVG)
function PriceSparkline({ history, width = 120, height = 36 }: {
  history: PricePoint[];
  width?: number;
  height?: number;
}) {
  if (history.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <text x={width / 2} y={height / 2 + 4} textAnchor="middle" fontSize="8"
          fill="var(--color-muted)" fontFamily="var(--font-mono)">warming up…</text>
      </svg>
    );
  }
  const pad = 2;
  const yesValues = history.map((p) => p.yes);
  const minV = Math.min(...yesValues);
  const maxV = Math.max(...yesValues);
  const range = maxV - minV || 0.01;
  const points = history.map((p, i) => {
    const x = pad + (i / (history.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (p.yes - minV) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const lastYes = yesValues[yesValues.length - 1];
  const color = lastYes >= 0.5 ? "var(--color-yes)" : "var(--color-danger)";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <polyline points={points.join(" ")} fill="none" stroke={color}
        strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Volume sparkline: bets-per-minute bar chart
function VolumeSparkline({
  timestamps,
  color = "var(--color-accent)",
  width = 60,
  height = 24,
  buckets = 10,
}: {
  timestamps: number[];
  color?: string;
  width?: number;
  height?: number;
  buckets?: number;
}) {
  const now = Date.now();
  const windowMs = buckets * 60_000;
  const bucketMs = 60_000;
  const counts = Array.from({ length: buckets }, (_, i) => {
    const bucketStart = now - windowMs + i * bucketMs;
    const bucketEnd   = bucketStart + bucketMs;
    return timestamps.filter((t) => t >= bucketStart && t < bucketEnd).length;
  });
  const maxCount = Math.max(...counts, 1);
  const barW = (width - (buckets - 1)) / buckets;
  const pad = 1;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {counts.map((c, i) => {
        const barH = Math.max(c / maxCount * (height - pad * 2), c > 0 ? 2 : 0);
        const x = i * (barW + 1);
        const y = height - pad - barH;
        return (
          <rect
            key={i}
            x={x.toFixed(1)}
            y={y.toFixed(1)}
            width={barW.toFixed(1)}
            height={barH.toFixed(1)}
            fill={color}
            opacity={0.5 + 0.5 * (i / (buckets - 1))}
          />
        );
      })}
    </svg>
  );
}

// Fixed hue per market id
const MARKET_COLORS = [
  "oklch(74% 0.18 55)",
  "oklch(65% 0.19 243)",
  "oklch(65% 0.16 155)",
];
function marketColor(id: number) { return MARKET_COLORS[id % MARKET_COLORS.length]; }

// Per-market volume buckets from in-memory feed
function getMarketVolumeBuckets(
  feed: FeedEntry[],
  marketId: number,
  buckets: number = 10
): Array<{ yesVol: number; noVol: number }> {
  const now = Date.now();
  const bucketMs = 60_000;
  const windowMs = buckets * bucketMs;
  const filtered = feed.filter((e) => e.marketId === marketId && now - e.ts < windowMs);
  return Array.from({ length: buckets }, (_, i) => {
    const bucketStart = now - windowMs + i * bucketMs;
    const bucketEnd   = bucketStart + bucketMs;
    const inBucket    = filtered.filter((e) => e.ts >= bucketStart && e.ts < bucketEnd);
    return {
      yesVol: inBucket.filter((e) => e.outcome).reduce((s, e) => s + Number(e.amount), 0),
      noVol:  inBucket.filter((e) => !e.outcome).reduce((s, e) => s + Number(e.amount), 0),
    };
  });
}

// DualChart: price line (top panel) + stacked YES/NO volume bars (bottom panel)
function DualChart({
  history,
  volumeBuckets,
  width = 280,
}: {
  history: PricePoint[];
  volumeBuckets: Array<{ yesVol: number; noVol: number }>;
  width?: number;
}) {
  const HEIGHT   = 80;
  const PRICE_H  = 50;
  const SEP_Y    = PRICE_H + 1;
  const VOL_TOP  = SEP_Y + 2;
  const VOL_H    = HEIGHT - VOL_TOP - 2;
  const PAD      = 2;
  const buckets  = volumeBuckets.length;
  const barW     = (width - (buckets - 1)) / buckets;

  const yesValues   = history.map((p) => p.yes);
  const pricePoints = (() => {
    if (history.length < 2) return null;
    const minV = Math.min(...yesValues);
    const maxV = Math.max(...yesValues);
    const range = maxV - minV || 0.01;
    return history.map((p, i) => {
      const x = PAD + (i / (history.length - 1)) * (width - PAD * 2);
      const y = PAD + (1 - (p.yes - minV) / range) * (PRICE_H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  })();

  const lastYes   = yesValues.length > 0 ? yesValues[yesValues.length - 1] : 0.5;
  const lineColor = lastYes >= 0.5 ? "var(--color-yes)" : "var(--color-danger)";
  const maxVol    = Math.max(...volumeBuckets.map((b) => b.yesVol + b.noVol), 1);

  return (
    <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} style={{ display: "block" }}>
      {pricePoints ? (
        <>
          <polyline
            points={pricePoints}
            fill="none"
            stroke={lineColor}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          <text x={width - 2} y={PAD + 8} textAnchor="end" fontSize="7"
            fill="var(--color-muted)" fontFamily="var(--font-mono)">
            {Math.round(lastYes * 100)}%
          </text>
        </>
      ) : (
        <text x={width / 2} y={PRICE_H / 2 + 4} textAnchor="middle" fontSize="8"
          fill="var(--color-muted)" fontFamily="var(--font-mono)">
          warming up…
        </text>
      )}
      <line x1={0} y1={SEP_Y} x2={width} y2={SEP_Y} stroke="var(--color-border)" strokeWidth="1" />
      {volumeBuckets.map((b, i) => {
        const totalH  = ((b.yesVol + b.noVol) / maxVol) * (VOL_H - 2);
        const yesH    = totalH > 0 ? (b.yesVol / (b.yesVol + b.noVol)) * totalH : 0;
        const noH     = totalH - yesH;
        const x       = i * (barW + 1);
        const baseY   = HEIGHT - 2;
        const opacity = 0.45 + 0.55 * (i / (buckets - 1));
        return (
          <g key={i} opacity={opacity}>
            {yesH > 0 && (
              <rect x={x.toFixed(1)} y={(baseY - yesH).toFixed(1)}
                width={barW.toFixed(1)} height={yesH.toFixed(1)}
                fill="var(--color-yes)" opacity={0.7} />
            )}
            {noH > 0 && (
              <rect x={x.toFixed(1)} y={(baseY - yesH - noH).toFixed(1)}
                width={barW.toFixed(1)} height={noH.toFixed(1)}
                fill="var(--color-danger)" opacity={0.7} />
            )}
          </g>
        );
      })}
      <text x={width - 2} y={HEIGHT - 3} textAnchor="end" fontSize="6"
        fill="var(--color-muted)" fontFamily="var(--font-mono)">
        VOL
      </text>
    </svg>
  );
}

// Median bet amount helper
function getMedianAmount(feed: FeedEntry[]): number {
  const amounts = feed.slice(0, 20).map((e) => Number(e.amount)).filter((n) => n > 0);
  if (amounts.length === 0) return 1_000_000;
  const sorted = [...amounts].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Per-trade size indicator bar
function TradeVolBar({ amount, median, outcome }: {
  amount: string;
  median: number;
  outcome: boolean;
}) {
  const normalized = Math.min(Number(amount) / median, 3);
  const height     = Math.max(Math.round(normalized * 16), 2);
  return (
    <svg width={6} height={20} viewBox="0 0 6 20" style={{ display: "block", alignSelf: "center" }}>
      <rect x={0} y={20 - height} width={6} height={height}
        fill={outcome ? "var(--color-yes)" : "var(--color-danger)"}
        opacity={0.75} />
    </svg>
  );
}

// Animated count-up hook
function useAnimatedNumber(target: number, duration = 300): number {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  useEffect(() => {
    const start = prevRef.current;
    const diff = target - start;
    if (diff === 0) return;
    const startTime = performance.now();
    let raf: number;
    const step = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(start + diff * eased));
      if (t < 1) raf = requestAnimationFrame(step);
      else prevRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return display;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const [markets, setMarkets]                 = useState<Market[]>([]);
  const [agents, setAgents]                   = useState<Map<string, AgentStats>>(new Map());
  const [feed, setFeed]                       = useState<FeedEntry[]>([]);
  const [streamStatus, setStreamStatus]       = useState<"connecting" | "live" | "error">("connecting");
  const [globalStats, setGlobalStats]         = useState<GlobalStats | null>(null);
  const [priceHistories, setPriceHistories]   = useState<Map<number, PricePoint[]>>(new Map());
  const [marketLastAgent, setMarketLastAgent] = useState<Map<number, string>>(new Map());
  const [newFeedId, setNewFeedId]             = useState<string | null>(null);
  const [tick, setTick]                       = useState(0);
  const esRef      = useRef<EventSource | null>(null);
  const marketsRef = useRef<Market[]>([]);

  // Re-render every 15s to keep "X ago" timestamps fresh
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  // Initial data fetch — markets + stats + price histories
  useEffect(() => {
    fetch(`${API_URL}/markets/public`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { data?: Market[] }) => {
        const m = j.data ?? [];
        setMarkets(m);
        marketsRef.current = m;
        m.forEach((market) => {
          fetch(`${API_URL}/markets/${market.id}/price-history`, { cache: "no-store" })
            .then((r) => r.json())
            .then((j2: { data?: PricePoint[] }) => {
              if (j2.data) {
                setPriceHistories((prev) => {
                  const next = new Map(prev);
                  next.set(market.id, j2.data!);
                  return next;
                });
              }
            })
            .catch(() => {});
        });
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

        setAgents((prev) => {
          const next = new Map(prev);
          const existing = next.get(name) ?? {
            name, bets: 0, yesBets: 0, recentBets: [],
            betTimestamps: [],
            volume: 0, lastOutcome: null, lastTs: null, lastMarketId: null, pulse: false,
          };
          const updatedRecent = [...existing.recentBets, raw.outcome].slice(-20);
          const updatedTimestamps = [...existing.betTimestamps, Date.now()].slice(-120);
          next.set(name, {
            ...existing,
            bets: existing.bets + 1,
            yesBets: existing.yesBets + (raw.outcome ? 1 : 0),
            recentBets: updatedRecent,
            betTimestamps: updatedTimestamps,
            volume: existing.volume + Number(raw.amount),
            lastOutcome: raw.outcome,
            lastTs: Date.now(),
            lastMarketId: raw.marketId,
            pulse: true,
          });
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

        setMarketLastAgent((prev) => {
          const next = new Map(prev);
          next.set(raw.marketId, name);
          return next;
        });

        setGlobalStats((prev) =>
          prev ? { ...prev, totalBets: prev.totalBets + 1 } : null
        );

        const entryId = `${Date.now()}-${Math.random()}`;
        const entry: FeedEntry = {
          id: entryId,
          ts: Date.now(),
          agentName: name,
          marketId: raw.marketId,
          outcome: raw.outcome,
          amount: raw.amount,
          question,
        };
        setFeed((prev) => [entry, ...prev].slice(0, 60));
        setNewFeedId(entryId);
        setTimeout(() => setNewFeedId(null), 400);
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
        setPriceHistories((prev) => {
          const next = new Map(prev);
          const existing = next.get(raw.marketId) ?? [];
          next.set(raw.marketId, [...existing, { ts: Date.now(), yes: raw.price.yes, no: raw.price.no }].slice(-200));
          return next;
        });
      } catch {
        // noop
      }
    });

    return () => es.close();
  }, []);

  const agentList = [...agents.values()].sort((a, b) => b.bets - a.bets);

  const knownAgents = ["contrarian", "momentum", "random"];
  const allAgentRows = Array.from(new Set([...knownAgents, ...agentList.map((a) => a.name)]))
    .map((name) => ({ name, stats: agents.get(name), meta: agentMeta(name) }))
    .sort((a, b) => (b.stats?.bets ?? 0) - (a.stats?.bets ?? 0));

  // Bets per minute (last 60s)
  const now = Date.now();
  const betsPerMin = feed.filter((e) => now - e.ts < 60_000).length;

  // Animated total bets
  const displayBets = useAnimatedNumber(globalStats?.totalBets ?? 0);

  // Latest bet for arena ticker
  const latestBet = feed[0] ?? null;

  // Crown: agent with most bets in last 60s
  const recentAgentBets = new Map<string, number>();
  feed.filter((e) => now - e.ts < 60_000).forEach((e) => {
    recentAgentBets.set(e.agentName, (recentAgentBets.get(e.agentName) ?? 0) + 1);
  });
  let leader: string | null = null;
  let leaderCount = 0;
  recentAgentBets.forEach((count, name) => {
    if (count > leaderCount) { leader = name; leaderCount = count; }
  });

  const marqueeText = markets.map((m) => m.question).join("  ·  ");

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
        {/* ── Arena Header ───────────────────────────────────────────────── */}
        <div className="battle-arena-header">
          {marqueeText && (
            <div className="arena-marquee" aria-hidden="true">
              <div className="arena-marquee__track font-mono">
                <span>{marqueeText}</span>
                <span aria-hidden="true">{marqueeText}</span>
              </div>
            </div>
          )}
          <div className="arena-ticker-row">
            <div className="arena-ticker font-mono">
              {latestBet ? (
                <>
                  <span style={{ color: agentMeta(latestBet.agentName).color }}>
                    {agentMeta(latestBet.agentName).emoji} {agentMeta(latestBet.agentName).label}
                  </span>
                  {" just bet "}
                  <span data-outcome={latestBet.outcome ? "yes" : "no"} className="arena-ticker__outcome">
                    {latestBet.outcome ? "YES" : "NO"}
                  </span>
                  {` on ${shortQ(latestBet.question, 28)} — ${usd(latestBet.amount)}`}
                </>
              ) : (
                <span className="arena-ticker__idle">Waiting for first bet…</span>
              )}
            </div>
            {leader && (
              <div className="arena-crown font-mono" style={{ color: agentMeta(leader).color }}>
                👑 {agentMeta(leader).label}
              </div>
            )}
          </div>
          <div className="arena-market-prices font-mono">
            {markets.map((m) => {
              const yes = Math.round((m.price?.yes ?? 0.5) * 100);
              const dir = yes > 50 ? "up" : yes < 50 ? "down" : "flat";
              return (
                <div key={m.id} className="arena-price-item">
                  <span className="arena-price-item__label">#{m.id}</span>
                  <span className={`arena-price-item__val arena-price-item__val--${dir}`}>{yes}% YES</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Page title row ─────────────────────────────────────────────── */}
        <aside className="battle-side">
        <div className="battle-header">
          <div className="battle-header__left">
            <h1 className="battle-title font-sans">Agent Battle</h1>
            <span className="battle-status font-mono" data-status={streamStatus}>
              {streamStatus === "live" ? "● LIVE"
                : streamStatus === "connecting" ? "○ CONNECTING"
                : "✕ DISCONNECTED"}
            </span>
          </div>
          <div className="battle-stats-bar font-mono">
            <span>{displayBets} bets</span>
            <span className="battle-stats-bar__sep">·</span>
            <span>{usd(globalStats?.totalVolume ?? "0")} vol</span>
            <span className="battle-stats-bar__sep">·</span>
            <span>{globalStats?.activeAgents ?? 0} agents</span>
            <span className="battle-stats-bar__sep">·</span>
            <span>{betsPerMin}/min</span>
          </div>
        </div>

        {/* ── Agent Leaderboard ──────────────────────────────────────────── */}
        <section className="agent-leaderboard" aria-label="Agent leaderboard">
          {allAgentRows.map(({ name, stats, meta }, idx) => {
            const rank = idx + 1;
            const winRate = stats && stats.bets > 0
              ? Math.round((stats.yesBets / stats.bets) * 100)
              : null;
            return (
              <div
                key={name}
                className="leaderboard-row"
                data-pulse={stats?.pulse ? "true" : undefined}
                data-rank={rank <= 3 ? rank : undefined}
                style={{ "--agent-color": meta.color } as React.CSSProperties}
              >
                <div className="leaderboard-row__rank font-mono">#{rank}</div>
                <div className="leaderboard-row__identity">
                  <div className="leaderboard-row__name font-mono">
                    <span className="leaderboard-row__emoji">{meta.emoji}</span>
                    <span style={{ color: meta.color }}>{meta.label}</span>
                  </div>
                  <div className="leaderboard-row__desc font-sans">{meta.desc}</div>
                  <div className="leaderboard-row__stats font-mono">
                    <span className="leaderboard-row__bets">
                      {stats?.bets ?? 0}<span className="leaderboard-row__unit"> bets</span>
                    </span>
                    <span className="leaderboard-row__sep">·</span>
                    <span className="leaderboard-row__vol">{usd(stats?.volume ?? 0)}</span>
                    {winRate !== null && (
                      <>
                        <span className="leaderboard-row__sep">·</span>
                        <span className="leaderboard-row__winrate" data-outcome={winRate >= 50 ? "yes" : "no"}>
                          {winRate}% YES
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="leaderboard-row__sparkline">
                  <VolumeSparkline
                    timestamps={stats?.betTimestamps ?? []}
                    color={meta.color}
                    width={60}
                    height={24}
                  />
                </div>
              </div>
            );
          })}
        </section>
        </aside>

        <div className="battle-main">
        {/* ── Market Pressure Panels ─────────────────────────────────────── */}
        <section className="battle-markets" aria-label="Market pools">
          <h2 className="battle-section-title font-sans">Markets</h2>
          {markets.map((m) => {
            const yesPct      = Math.round((m.price?.yes ?? 0.5) * 100);
            const noPct       = 100 - yesPct;
            const history     = priceHistories.get(m.id) ?? [];
            const lastAgent   = marketLastAgent.get(m.id);
            const lastAgMeta  = lastAgent ? agentMeta(lastAgent) : null;
            const yesPoolUsd  = m.yesPool ? `$${(Number(m.yesPool) / 1_000_000).toFixed(0)}` : null;
            const noPoolUsd   = m.noPool  ? `$${(Number(m.noPool)  / 1_000_000).toFixed(0)}` : null;
            return (
              <div key={m.id} className="market-panel">
                <div className="market-panel__header">
                  <div className="market-panel__question font-sans">{m.question}</div>
                  <div className="market-panel__meta">
                    {lastAgMeta && (
                      <span className="market-panel__agent-dot" style={{ color: lastAgMeta.color }}
                        title={`Last bet: ${lastAgMeta.label}`}>
                        {lastAgMeta.emoji}
                      </span>
                    )}
                  </div>
                </div>
                <div className="market-panel__bars">
                  <div className="pool-bar pool-bar--yes">
                    <div className="pool-bar__fill" style={{ width: `${yesPct}%` }} />
                    <span className="pool-bar__label font-mono">
                      YES {yesPct}%{yesPoolUsd ? ` · ${yesPoolUsd}` : ""}
                    </span>
                  </div>
                  <div className="pool-bar pool-bar--no">
                    <div className="pool-bar__fill" style={{ width: `${noPct}%` }} />
                    <span className="pool-bar__label font-mono">
                      NO {noPct}%{noPoolUsd ? ` · ${noPoolUsd}` : ""}
                    </span>
                  </div>
                </div>
                <div className="market-panel__chart">
                  <DualChart
                    history={history}
                    volumeBuckets={getMarketVolumeBuckets(feed, m.id)}
                    width={280}
                  />
                </div>
              </div>
            );
          })}
        </section>

        {/* ── Trade Tape ──────────────────────────────────────────────────── */}
        <section className="battle-feed" aria-label="Live bet feed" aria-live="polite">
          <h2 className="battle-section-title font-mono">
            Trade Tape
            {feed.length > 0 && (
              <span className="battle-feed__count font-mono">{feed.length}</span>
            )}
          </h2>
          {feed.length === 0 ? (
            <p className="battle-feed__empty font-mono">Waiting for bets…</p>
          ) : (
            <div className="battle-feed__list" role="log">
              {(() => {
                const medianAmount = getMedianAmount(feed);
                return feed.map((entry, index) => {
                  const meta   = agentMeta(entry.agentName);
                  const mColor = marketColor(entry.marketId);
                  return (
                    <div
                      key={entry.id}
                      className={`feed-row${entry.id === newFeedId ? " feed-row--new" : ""}`}
                      style={{ opacity: Math.max(0.35, 1 - index * 0.045) }}
                    >
                      <span className="feed-row__time font-mono">
                        {new Date(entry.ts).toLocaleTimeString("en-US", {
                          hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
                        })}
                      </span>
                      <span className="feed-row__agent font-mono" style={{ color: meta.color }}>
                        {meta.emoji} {meta.label}
                      </span>
                      <span className="feed-row__outcome font-mono" data-outcome={entry.outcome ? "yes" : "no"}>
                        {entry.outcome ? "YES" : "NO "}
                      </span>
                      <span className="feed-row__amount font-mono">{usd(entry.amount)}</span>
                      <TradeVolBar amount={entry.amount} median={medianAmount} outcome={entry.outcome} />
                      <span className="feed-row__market-chip font-mono"
                        style={{ borderColor: mColor, color: mColor }}>
                        #{entry.marketId}
                      </span>
                      <span className="feed-row__question font-sans">{shortQ(entry.question)}</span>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </section>
        </div>{/* battle-main */}
      </main>
    </div>
  );
}

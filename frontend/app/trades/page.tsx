"use client";

import { useEffect, useRef, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { isBetEvent, isPriceUpdateEvent } from "@/lib/types/events";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Market {
  id: number;
  question: string;
  price: { yes: number; no: number };
  yesPool?: string;
  noPool?: string;
}

interface PricePoint {
  ts: number;
  yes: number;
  no: number;
}

interface FeedEntry {
  id: string;
  ts: number;
  agentName: string;
  marketId: number;
  outcome: boolean;
  amount: string;
  question: string;
  wallet: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function usd(amount: string | number): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  return `$${(n / 1_000_000).toFixed(2)}`;
}

function shortQ(q: string, max = 50): string {
  return q.length > max ? q.slice(0, max) + "…" : q;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ─── Chart Components (Reused from AgentsPage) ────────────────────────────────

function DualChart({
  history,
  volumeBuckets,
  width = 600,
}: {
  history: PricePoint[];
  volumeBuckets: Array<{ yesVol: number; noVol: number }>;
  width?: number;
}) {
  const HEIGHT   = 160;
  const PRICE_H  = 100;
  const SEP_Y    = PRICE_H + 1;
  const VOL_TOP  = SEP_Y + 4;
  const VOL_H    = HEIGHT - VOL_TOP - 4;
  const PAD      = 4;
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
    <svg width="100%" height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} style={{ display: "block", background: "var(--color-surface)", borderRadius: "4px", border: "1px solid var(--color-border)" }}>
      {pricePoints ? (
        <>
          <polyline
            points={pricePoints}
            fill="none"
            stroke={lineColor}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          <text x={width - 10} y={PAD + 15} textAnchor="end" fontSize="12"
            fill="var(--color-muted)" fontFamily="var(--font-mono)" fontWeight="600">
            {Math.round(lastYes * 100)}% YES
          </text>
        </>
      ) : (
        <text x={width / 2} y={PRICE_H / 2 + 6} textAnchor="middle" fontSize="12"
          fill="var(--color-muted)" fontFamily="var(--font-mono)">
          Waiting for trade data…
        </text>
      )}
      <line x1={0} y1={SEP_Y} x2={width} y2={SEP_Y} stroke="var(--color-border)" strokeWidth="1" />
      {volumeBuckets.map((b, i) => {
        const totalH  = ((b.yesVol + b.noVol) / maxVol) * (VOL_H - 4);
        const yesH    = totalH > 0 ? (b.yesVol / (b.yesVol + b.noVol)) * totalH : 0;
        const noH     = totalH - yesH;
        const x       = i * (barW + 1);
        const baseY   = HEIGHT - 4;
        const opacity = 0.6 + 0.4 * (i / (buckets - 1));
        return (
          <g key={i} opacity={opacity}>
            {yesH > 0 && (
              <rect x={x.toFixed(1)} y={(baseY - yesH).toFixed(1)}
                width={barW.toFixed(1)} height={yesH.toFixed(1)}
                fill="var(--color-yes)" opacity={0.8} />
            )}
            {noH > 0 && (
              <rect x={x.toFixed(1)} y={(baseY - yesH - noH).toFixed(1)}
                width={barW.toFixed(1)} height={noH.toFixed(1)}
                fill="var(--color-danger)" opacity={0.8} />
            )}
          </g>
        );
      })}
    </svg>
  );
}

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

// ─── Main Component ───────────────────────────────────────────────────────────

function TradesContent() {
  const searchParams = useSearchParams();
  const wallet = searchParams.get("wallet");

  const [markets, setMarkets] = useState<Market[]>([]);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [streamStatus, setStreamStatus] = useState<"connecting" | "live" | "error">("connecting");
  const [priceHistories, setPriceHistories] = useState<Map<number, PricePoint[]>>(new Map());
  
  const marketsRef = useRef<Market[]>([]);

  useEffect(() => {
    // Fetch markets
    fetch(`${API_URL}/markets/public`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { data?: Market[] }) => {
        const m = j.data ?? [];
        setMarkets(m);
        marketsRef.current = m;

        // After markets are loaded, fetch initial data
        const initialWallet = wallet;
        
        // 1. Fetch bet history
        const historyUrl = initialWallet 
          ? `${API_URL}/bets/history?wallet=${initialWallet}`
          : `${API_URL}/bets/history`;
          
        fetch(historyUrl, { cache: "no-store" })
          .then(r => r.json())
          .then(j => {
            if (j.data) {
              const entries = j.data.map((b: any) => ({
                id: b.id,
                ts: b.ts,
                agentName: "agent", // Default for history
                marketId: b.marketId,
                outcome: b.outcome,
                amount: b.amount,
                question: m.find((mk: any) => mk.id === b.marketId)?.question ?? `Market #${b.marketId}`,
                wallet: b.wallet,
              }));
              setFeed(entries.reverse()); // Show newest first
            }
          });

        // 2. Fetch price history for all markets
        for (const market of m) {
          fetch(`${API_URL}/markets/${market.id}/price-history`)
            .then(res => res.json())
            .then(json => {
              if (json.data) {
                setPriceHistories(prev => {
                  const next = new Map(prev);
                  next.set(market.id, json.data);
                  return next;
                });
              }
            })
            .catch(err => console.error(`Failed to fetch history for market ${market.id}`, err));
        }
      })
      .catch(() => {});
  }, [wallet]);

  useEffect(() => {
    const es = new EventSource(`${API_URL}/stream`);

    es.addEventListener("open", () => setStreamStatus("live"));
    es.addEventListener("error", () => setStreamStatus("error"));

    es.addEventListener("bet", (e) => {
      try {
        const raw = JSON.parse((e as MessageEvent).data) as any;
        if (!isBetEvent(raw)) return;

        console.log("[Trades] Received bet event:", raw);

        // Filter by wallet if provided
        if (wallet && raw.wallet.toLowerCase() !== wallet.toLowerCase()) {
          console.log("[Trades] Skipping bet for other wallet:", raw.wallet);
          return;
        }

        const question = marketsRef.current.find((m) => m.id === raw.marketId)?.question ?? `Market #${raw.marketId}`;
        
        const entry: FeedEntry = {
          id: `${Date.now()}-${Math.random()}`,
          ts: Date.now(),
          agentName: raw.agentName ?? "unknown",
          marketId: raw.marketId,
          outcome: raw.outcome,
          amount: raw.amount,
          question,
          wallet: raw.wallet,
        };

        setFeed((prev) => {
          // Check if we already have this txHash to avoid duplicates
          if (prev.some(e => (e as any).txHash === raw.txHash)) return prev;
          return [entry, ...prev].slice(0, 100);
        });

        // Update local price history for the graph
        setPriceHistories((prev) => {
          const next = new Map(prev);
          // We don't have the full price update here, but we can use the last known or just track volume
          return next;
        });
      } catch (err) {
        console.error("[Trades] Error processing bet event:", err);
      }
    });

    es.addEventListener("price_update", (e) => {
      try {
        const raw = JSON.parse((e as MessageEvent).data) as any;
        if (!isPriceUpdateEvent(raw)) return;
        
        setPriceHistories((prev) => {
          const next = new Map(prev);
          const existing = next.get(raw.marketId) ?? [];
          next.set(raw.marketId, [...existing, { ts: Date.now(), yes: raw.price.yes, no: raw.price.no }].slice(-100));
          return next;
        });
      } catch {}
    });

    return () => es.close();
  }, [wallet]);

  const userFeed = feed;
  const medianAmount = useMemo(() => {
    const amounts = userFeed.map((e) => Number(e.amount)).filter((n) => n > 0);
    if (amounts.length === 0) return 1_000_000;
    const sorted = [...amounts].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }, [userFeed]);

  // Aggregate data for the graph (all user trades across all markets)
  const volumeBuckets = useMemo(() => {
    const buckets = 20;
    const now = Date.now();
    const bucketMs = 60_000 * 5; // 5 minute buckets
    const windowMs = buckets * bucketMs;
    
    return Array.from({ length: buckets }, (_, i) => {
      const bucketStart = now - windowMs + i * bucketMs;
      const bucketEnd   = bucketStart + bucketMs;
      const inBucket    = userFeed.filter((e) => e.ts >= bucketStart && e.ts < bucketEnd);
      return {
        yesVol: inBucket.filter((e) => e.outcome).reduce((s, e) => s + Number(e.amount), 0),
        noVol:  inBucket.filter((e) => !e.outcome).reduce((s, e) => s + Number(e.amount), 0),
      };
    });
  }, [userFeed]);

  // For the price line, we'll just show the history of the most recent market traded
  const activeMarketId = userFeed[0]?.marketId;
  const activeHistory = activeMarketId ? (priceHistories.get(activeMarketId) ?? []) : [];

  return (
    <div className="page-shell">
      <header className="site-header">
        <div className="site-header__brand">
          <span className="site-header__mark">◈</span>
          <span className="site-header__name">WorldMarket</span>
        </div>
        <nav className="site-header__nav">
          <Link href="/" className="nav-link">Markets</Link>
          <Link href="/agents" className="nav-link">Agent Battle</Link>
          <Link href="/chat" className="nav-link">Agent Chat</Link>
        </nav>
      </header>

      <main className="page-content">
        <div className="section-header">
          <h1 className="hero-heading" style={{ fontSize: "2.5rem", marginBottom: 0 }}>
            {wallet ? `Trades for ${shortAddr(wallet)}` : "Your Trades"}
          </h1>
          <span className={`battle-status font-mono`} data-status={streamStatus} style={{ marginLeft: "auto", padding: "4px 12px", border: "1px solid var(--color-border)", borderRadius: "4px", fontSize: "0.8rem" }}>
            {streamStatus === "live" ? "● LIVE" : "○ CONNECTING"}
          </span>
        </div>

        <section className="trades-graph-section">
          <h2 className="battle-section-title font-sans">Performance Overview</h2>
          <div style={{ marginTop: "1rem" }}>
            <DualChart 
              history={activeHistory} 
              volumeBuckets={volumeBuckets} 
              width={800} 
            />
            <p className="font-mono" style={{ fontSize: "0.7rem", color: "var(--color-muted)", marginTop: "0.5rem", textAlign: "right" }}>
              {activeMarketId ? `Showing price history for Market #${activeMarketId} + your total volume` : "Trade to see activity graph"}
            </p>
          </div>
        </section>

        <section className="trades-list-section">
          <h2 className="battle-section-title font-mono">
            Trade History
            {userFeed.length > 0 && (
              <span className="battle-feed__count font-mono" style={{ marginLeft: "0.5rem" }}>{userFeed.length}</span>
            )}
          </h2>
          
          {userFeed.length === 0 ? (
            <div className="empty-state font-mono">
              <p>No trades found for this wallet yet.</p>
              <p style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}>Trades will appear here in real-time as they occur.</p>
            </div>
          ) : (
            <div className="battle-feed__list" style={{ maxHeight: "none", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "4px" }}>
              {userFeed.map((entry, index) => (
                <div key={entry.id} className="feed-row" style={{ padding: "0.75rem 1rem" }}>
                  <span className="feed-row__time font-mono">
                    {new Date(entry.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                  <span className="feed-row__agent font-mono" style={{ color: "var(--color-accent)" }}>
                    {entry.agentName.toUpperCase()}
                  </span>
                  <span className="feed-row__outcome font-mono" data-outcome={entry.outcome ? "yes" : "no"}>
                    {entry.outcome ? "YES" : "NO"}
                  </span>
                  <span className="feed-row__amount font-mono">{usd(entry.amount)}</span>
                  <TradeVolBar amount={entry.amount} median={medianAmount} outcome={entry.outcome} />
                  <span className="feed-row__market-chip font-mono" style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}>
                    #{entry.marketId}
                  </span>
                  <span className="feed-row__question font-sans" style={{ fontSize: "0.8rem" }}>{shortQ(entry.question)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default function TradesPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TradesContent />
    </Suspense>
  );
}

"use client";
import { useEffect, useState } from "react";

interface Stats {
  totalBets: number;
  totalVolume: string; // USDC base units (6 decimals)
  activeAgents: number;
  humansCapped: number;
}

interface LiveStatsTickerProps {
  apiUrl: string;
  /** Polling interval in ms — defaults to 30 000 */
  pollInterval?: number;
}

async function fetchStats(apiUrl: string): Promise<Stats | null> {
  try {
    const res = await fetch(`${apiUrl}/stats`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Stats };
    return json.data ?? null;
  } catch {
    return null;
  }
}

const USDC_DECIMALS = 1_000_000; // USDC uses 6 decimal places (base units)

function fmtVolume(raw: string): string {
  const n = Number(raw) / USDC_DECIMALS;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

export function LiveStatsTicker({ apiUrl, pollInterval = 30_000 }: LiveStatsTickerProps) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const data = await fetchStats(apiUrl);
      if (!cancelled) setStats(data);
    };
    void load();
    const id = setInterval(load, pollInterval);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [apiUrl, pollInterval]);

  if (!stats) {
    return (
      <div className="stats-ticker stats-ticker--loading" aria-label="Loading stats">
        <span className="stats-ticker__item font-mono">Loading stats…</span>
      </div>
    );
  }

  const items: { label: string; value: string; accent?: boolean }[] = [
    { label: "BETS", value: String(stats.totalBets), accent: true },
    { label: "VOLUME", value: fmtVolume(stats.totalVolume), accent: true },
    { label: "AGENTS", value: String(stats.activeAgents) },
    { label: "CAPPED", value: String(stats.humansCapped) },
  ];

  return (
    <div className="stats-ticker" role="status" aria-label="Live market statistics">
      {items.map(({ label, value, accent }) => (
        <div key={label} className="stats-ticker__item">
          <span className="stats-ticker__label font-sans">{label}</span>
          <span className={`stats-ticker__value font-mono${accent ? " stats-ticker__value--accent" : ""}`}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

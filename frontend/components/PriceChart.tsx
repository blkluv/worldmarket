"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { isBetEvent } from "@/lib/types/events";

// ── D1: Public interface (fixed — Track B depends on this shape) ───────────
export interface PriceChartProps {
  marketId: number;
  apiUrl: string;
}

// ── D1: Internal types ──────────────────────────────────────────────────────
interface PricePoint {
  yes: number; // probability 0–1
  no: number;
  ts: number;
}

interface MarketPrice {
  yes: number;
  no: number;
}

interface MarketPublicResponse {
  data?: {
    price?: MarketPrice;
  };
}

// ── D1: Runtime type guard for API response ─────────────────────────────────
function isMarketPublicResponse(v: unknown): v is MarketPublicResponse {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!("data" in o) || typeof o.data !== "object" || o.data === null) return false;
  const d = o.data as Record<string, unknown>;
  if (!("price" in d) || typeof d.price !== "object" || d.price === null) return false;
  const p = d.price as Record<string, unknown>;
  return typeof p.yes === "number" && typeof p.no === "number";
}

// ── D3: SVG layout constants ────────────────────────────────────────────────
const MAX_POINTS = 50;
const SVG_W = 300;
const SVG_H = 80;
const PAD_X = 4;
const PAD_Y = 6;

/** Convert an array of PricePoints to an SVG `points` attribute string. */
function buildPolylinePoints(pts: PricePoint[], key: "yes" | "no"): string {
  if (pts.length < 2) return "";
  const lastIdx = pts.length - 1;
  return pts
    .map((p, i) => {
      const x = PAD_X + (i / lastIdx) * (SVG_W - PAD_X * 2);
      const y = PAD_Y + (1 - p[key]) * (SVG_H - PAD_Y * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

// ── D2 + D3: Component ──────────────────────────────────────────────────────
export function PriceChart({ marketId, apiUrl }: PriceChartProps) {
  const [points, setPoints] = useState<PricePoint[]>([]);
  const [status, setStatus] = useState<"loading" | "live" | "error">("loading");
  const esRef = useRef<EventSource | null>(null);

  // D2: Keep a stable ref to the latest apiUrl/marketId so the SSE handler
  // never closes over stale values without recreating the EventSource.
  const apiUrlRef = useRef(apiUrl);
  const marketIdRef = useRef(marketId);
  apiUrlRef.current = apiUrl;
  marketIdRef.current = marketId;

  // D2: Fetch current price from the free public endpoint
  const fetchPrice = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrlRef.current}/markets/${marketIdRef.current}/public`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const json: unknown = await res.json();
      if (!isMarketPublicResponse(json)) {
        setStatus("error");
        return;
      }
      const price = json.data?.price;
      if (price === undefined) {
        setStatus("error");
        return;
      }
      setPoints((prev) =>
        [...prev, { yes: price.yes, no: price.no, ts: Date.now() }].slice(-MAX_POINTS),
      );
      setStatus("live");
    } catch {
      setStatus("error");
    }
  }, []); // stable — reads apiUrl/marketId via refs

  useEffect(() => {
    // Reset state when market changes
    setPoints([]);
    setStatus("loading");

    // D2: Fetch on mount
    void fetchPrice();

    // D2: Poll every 15 s as a baseline
    const interval = setInterval(() => {
      void fetchPrice();
    }, 15_000);

    // D2: Subscribe to the free SSE stream; refresh price on each bet for this market
    const es = new EventSource(`${apiUrl}/stream`);
    esRef.current = es;

    es.addEventListener("error", () => {
      // SSE connection failed — keep last known price but show degraded status
      setStatus((prev) => (prev === "live" ? "live" : "error"));
    });

    es.addEventListener("bet", (e) => {
      try {
        const raw = JSON.parse((e as MessageEvent).data) as unknown;
        if (!isBetEvent(raw)) return;
        if (raw.marketId !== marketIdRef.current) return;
        void fetchPrice();
      } catch {
        // noop — malformed event, skip
      }
    });

    return () => {
      clearInterval(interval);
      es.close();
      esRef.current = null;
    };
  }, [apiUrl, marketId, fetchPrice]);

  // D3: Derive SVG polyline point strings from history
  const yesPoints = buildPolylinePoints(points, "yes");
  const noPoints = buildPolylinePoints(points, "no");
  const latest = points.length > 0 ? points[points.length - 1] : undefined;

  return (
    <div className="price-chart" aria-label={`Price sparkline for market ${marketId}`}>
      {/* Header row */}
      <div className="price-chart__header">
        <span className="price-chart__title font-sans">PRICE HISTORY</span>
        <span
          className={`price-chart__status price-chart__status--${status} font-mono`}
          aria-label={status === "live" ? "Live" : status === "loading" ? "Loading" : "Error"}
        >
          <span aria-hidden="true">
            {status === "live" ? "● LIVE" : status === "loading" ? "○ …" : "✕ ERR"}
          </span>
        </span>
      </div>

      {/* D3: Pure SVG sparkline — no chart libraries */}
      <svg
        className="price-chart__svg"
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Price sparkline"
      >
        {points.length >= 2 ? (
          <>
            <polyline
              className="price-chart__line price-chart__line--yes"
              points={yesPoints}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              className="price-chart__line price-chart__line--no"
              points={noPoints}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : (
          <text
            x={SVG_W / 2}
            y={SVG_H / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            className="price-chart__empty-text"
            fontSize="10"
          >
            {status === "error" ? "Unable to load" : "Collecting data…"}
          </text>
        )}
      </svg>

      {/* Current price legend */}
      {latest !== undefined && (
        <div className="price-chart__legend font-mono">
          <span className="price-chart__leg price-chart__leg--yes">
            YES {(latest.yes * 100).toFixed(1)}¢
          </span>
          <span className="price-chart__leg price-chart__leg--no">
            NO {(latest.no * 100).toFixed(1)}¢
          </span>
        </div>
      )}
    </div>
  );
}

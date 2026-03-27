"use client";
import { useEffect, useRef, useState } from "react";

interface CapMeterProps {
  exposure: string;
  cap: string;
  label?: string;
}

export function CapMeter({ exposure, cap, label }: CapMeterProps) {
  const raw = cap === "0" ? 1n : BigInt(cap || "1");
  const pctRaw = Number((BigInt(exposure || "0") * 10000n) / raw) / 100;
  const pct = Math.min(pctRaw, 100);
  const isMaxed = BigInt(exposure || "0") >= BigInt(cap || "1");
  const exposureUSD = (Number(BigInt(exposure || "0")) / 1_000_000).toFixed(2);
  const capUSD = (Number(BigInt(cap || "1")) / 1_000_000).toFixed(2);

  const prevPct = useRef(pct);
  const [slamming, setSlamming] = useState(false);

  useEffect(() => {
    if (isMaxed && prevPct.current < 100) {
      setSlamming(true);
      const t = setTimeout(() => setSlamming(false), 600);
      return () => clearTimeout(t);
    }
    prevPct.current = pct;
  }, [isMaxed, pct]);

  return (
    <div
      className="cap-meter"
      data-maxed={isMaxed || undefined}
      data-slamming={slamming || undefined}
    >
      {label && <div className="cap-meter__label">{label}</div>}
      <div className="cap-meter__header">
        <span className="cap-meter__pct font-mono">{pct.toFixed(1)}%</span>
        <span className="cap-meter__amounts font-mono">
          ${exposureUSD} <span className="cap-meter__sep">/</span> ${capUSD}
        </span>
      </div>
      <div className="cap-meter__track">
        <div className="cap-meter__fill" style={{ width: `${pct}%` }} />
        {isMaxed && <div className="cap-meter__wall" />}
      </div>
      {isMaxed && (
        <div className="cap-meter__maxed-label font-mono">
          🛑 CAP REACHED — BETS REJECTED
        </div>
      )}
    </div>
  );
}

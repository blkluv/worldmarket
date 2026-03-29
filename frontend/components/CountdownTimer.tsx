"use client";
import { useEffect, useState } from "react";

interface CountdownTimerProps {
  /** Unix timestamp in seconds */
  deadline: number;
  className?: string;
}

const SECONDS_PER_DAY = 86400;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;

function calcRemaining(deadline: number): string {
  const diffMs = deadline * 1000 - Date.now();
  if (diffMs <= 0) return "ENDED";

  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / SECONDS_PER_DAY);
  const hours = Math.floor((totalSec % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const mins = Math.floor((totalSec % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const secs = totalSec % SECONDS_PER_MINUTE;

  const pad = (n: number) => String(n).padStart(2, "0");

  if (days > 0) {
    return `${days}d ${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
}

export function CountdownTimer({ deadline, className }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState<string | null>(null);
  const ended = remaining === "ENDED";

  useEffect(() => {
    const tick = () => setRemaining(calcRemaining(deadline));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  if (remaining === null) {
    return <span className={`countdown-timer font-mono ${className ?? ""}`}>--:--:--</span>;
  }

  return (
    <span
      className={`countdown-timer font-mono${ended ? " countdown-timer--ended" : ""}${className ? ` ${className}` : ""}`}
      aria-label={ended ? "Market ended" : `Time remaining: ${remaining}`}
    >
      {remaining}
    </span>
  );
}

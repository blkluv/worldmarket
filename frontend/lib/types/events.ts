export interface BetEventPayload {
  marketId: number;
  outcome: boolean;
  amount: string;   // USDC base units (6 dec)
  wallet: string;
  txHash: string;
}

export interface CapHitEventPayload {
  marketId: number;
  wallet: string;
  humanExposure: string;
  humanCap: string;
  requestedAmount: string;
}

export function isBetEvent(v: unknown): v is BetEventPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.marketId === "number" &&
    typeof o.outcome === "boolean" &&
    typeof o.amount === "string" &&
    typeof o.wallet === "string" &&
    typeof o.txHash === "string"
  );
}

export function isCapHitEvent(v: unknown): v is CapHitEventPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.marketId === "number" &&
    typeof o.wallet === "string" &&
    typeof o.humanExposure === "string" &&
    typeof o.humanCap === "string" &&
    typeof o.requestedAmount === "string"
  );
}

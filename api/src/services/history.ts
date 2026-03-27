interface PricePoint {
  ts: number;
  yes: number;
  no: number;
}

const history: Map<number, PricePoint[]> = new Map();
const MAX_POINTS = 200;

export function recordPrice(marketId: number, yes: number, no: number): void {
  if (!history.has(marketId)) history.set(marketId, []);
  const arr = history.get(marketId)!;
  arr.push({ ts: Date.now(), yes, no });
  if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS);
}

export function getPriceHistory(marketId: number): PricePoint[] {
  return history.get(marketId) ?? [];
}

export interface Price {
  yes: number;
  no: number;
}

export interface BetDecision {
  shouldBet: boolean;
  outcome: boolean;
  confidence: number;
}

/**
 * Simple contrarian strategy: bet YES if YES price < 0.5 (underpriced),
 * bet NO if NO price < 0.5 (underpriced).
 */
export function shouldBet(price: Price): BetDecision {
  if (price.yes < 0.5) {
    return { shouldBet: true, outcome: true, confidence: 0.5 - price.yes };
  }
  if (price.no < 0.5) {
    return { shouldBet: true, outcome: false, confidence: 0.5 - price.no };
  }
  return { shouldBet: false, outcome: true, confidence: 0 };
}

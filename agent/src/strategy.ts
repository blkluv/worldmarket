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
 * contrarian: bet the underpriced side (default)
 * momentum:  bet the side that's already winning (>0.5)
 * random:    flip a coin
 * yes-only:  always bet YES
 * no-only:   always bet NO
 *
 * Set via AGENT_STRATEGY env var.
 */
export function shouldBet(price: Price): BetDecision {
  const strategy = process.env.AGENT_STRATEGY ?? "contrarian";

  switch (strategy) {
    case "momentum":
      if (price.yes > 0.5) return { shouldBet: true, outcome: true, confidence: price.yes - 0.5 };
      if (price.no > 0.5)  return { shouldBet: true, outcome: false, confidence: price.no - 0.5 };
      return { shouldBet: false, outcome: true, confidence: 0 };

    case "random":
      return { shouldBet: true, outcome: Math.random() > 0.5, confidence: 0.1 };

    case "yes-only":
      return { shouldBet: true, outcome: true, confidence: 0.1 };

    case "no-only":
      return { shouldBet: true, outcome: false, confidence: 0.1 };

    case "contrarian":
    default:
      if (price.yes < 0.5) return { shouldBet: true, outcome: true, confidence: 0.5 - price.yes };
      if (price.no < 0.5)  return { shouldBet: true, outcome: false, confidence: 0.5 - price.no };
      return { shouldBet: false, outcome: true, confidence: 0 };
  }
}

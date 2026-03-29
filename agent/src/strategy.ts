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
      return { shouldBet: true, outcome: Math.random() > 0.5, confidence: Math.random() * 0.4 + 0.05 };

    case "yes-only":
      return { shouldBet: true, outcome: true, confidence: Math.max(0.05, 0.5 - price.yes) };

    case "no-only":
      return { shouldBet: true, outcome: false, confidence: Math.max(0.05, 0.5 - price.no) };

    case "contrarian":
    default:
      if (price.yes < 0.5) return { shouldBet: true, outcome: true, confidence: 0.5 - price.yes };
      if (price.no < 0.5)  return { shouldBet: true, outcome: false, confidence: 0.5 - price.no };
      return { shouldBet: false, outcome: true, confidence: 0 };
  }
}

const BASE_AMOUNT = 1_000_000; // $1 USDC (6 decimals)

/**
 * Scale bet size by confidence and strategy personality.
 * Returns amount in USDC base units (6 decimals), minimum $0.50.
 *
 * contrarian: big bets on big mispricings (1x–6x)
 * momentum:   moderate sizing, grows with trend strength (1x–3x)
 * random:     genuinely unpredictable ($0.50–$5.00)
 * yes/no-only: steady conviction with slight variance (1x–2.5x)
 */
export function sizeBet(confidence: number, strategy: string): bigint {
  let mult: number;
  switch (strategy) {
    case "contrarian":
      // Quadratic: insignificant mispricing = small bet, large mispricing = large bet
      mult = 1 + Math.pow(confidence * 2, 2) * 2.5;
      break;
    case "momentum":
      // Linear: stronger trend = bigger follow
      mult = 1 + confidence * 4;
      break;
    case "random":
      // Bimodal: often tiny bets, occasionally large
      mult = Math.random() < 0.3
        ? 0.5 + Math.random() * 0.5           // small: $0.50–$1.00
        : 1.5 + Math.random() * 3.5;          // normal: $1.50–$5.00
      break;
    case "yes-only":
    case "no-only":
      // Steady with slight jitter
      mult = 1 + Math.random() * 1.5;
      break;
    default:
      mult = 1;
  }
  return BigInt(Math.max(500_000, Math.round(BASE_AMOUNT * mult)));
}

/**
 * Return the inter-bet delay (ms) appropriate for each strategy's character.
 *
 * contrarian: patient, waits for value     6s–14s
 * momentum:   aggressive trend follower    1.5s–5s
 * random:     truly unpredictable          2s–18s
 * yes/no-only: steady drumbeat             4s–10s
 */
export function betDelay(strategy: string): number {
  switch (strategy) {
    case "contrarian":
      return 6000 + Math.random() * 8000;
    case "momentum":
      return 10000 + Math.random() * 5000;
    case "random":
      return 10000 + Math.random() * 16000;
    case "yes-only":
    case "no-only":
      return 10000 + Math.random() * 6000;
    default:
      return 10000;
  }
}

/**
 * Constant-product AMM price and simulation utilities.
 *
 * Price formula:
 *   price(yes) = noPool / (yesPool + noPool)
 *   price(no)  = yesPool / (yesPool + noPool)
 *
 * Shares formula:
 *   sharesOut = (outcomePool * amountIn) / (otherPool + amountIn)
 *   Falls back to 1:1 when either pool is zero (bootstrap).
 */

export function getPrice(
  yesPool: bigint,
  noPool: bigint
): { yes: number; no: number } {
  const total = yesPool + noPool;
  if (total === 0n) {
    return { yes: 0.5, no: 0.5 };
  }
  return {
    yes: Number(noPool) / Number(total),
    no: Number(yesPool) / Number(total),
  };
}

export function simulateBet(
  yesPool: bigint,
  noPool: bigint,
  outcome: boolean,
  amount: bigint
): {
  sharesOut: bigint;
  priceImpact: number;
  priceBefore: { yes: number; no: number };
  priceAfter: { yes: number; no: number };
} {
  const priceBefore = getPrice(yesPool, noPool);

  let sharesOut: bigint;
  let yesPoolAfter: bigint;
  let noPoolAfter: bigint;

  if (outcome) {
    sharesOut = calcShares(yesPool, noPool, amount);
    yesPoolAfter = yesPool + amount;
    noPoolAfter = noPool;
  } else {
    sharesOut = calcShares(noPool, yesPool, amount);
    yesPoolAfter = yesPool;
    noPoolAfter = noPool + amount;
  }

  const priceAfter = getPrice(yesPoolAfter, noPoolAfter);

  const refPrice = outcome ? priceBefore.yes : priceBefore.no;
  const newPrice = outcome ? priceAfter.yes : priceAfter.no;
  const priceImpact =
    refPrice === 0 ? 0 : Math.abs(newPrice - refPrice) / refPrice;

  return { sharesOut, priceImpact, priceBefore, priceAfter };
}

function calcShares(
  pool: bigint,
  counterPool: bigint,
  amount: bigint
): bigint {
  if (pool === 0n || counterPool === 0n) {
    return amount;
  }
  return (pool * amount) / (counterPool + amount);
}

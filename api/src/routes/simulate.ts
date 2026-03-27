import { Router, Request, Response } from "express";
import { getMarket } from "../services/contract";
import { simulateBet } from "../services/pricer";

const router = Router();

router.post("/markets/:id/simulate", async (req: Request, res: Response) => {
  const marketId = parseInt(req.params.id, 10);
  if (isNaN(marketId) || marketId < 0) {
    res.status(400).json({ error: "Invalid market id" });
    return;
  }

  const { outcome, amount } = req.body as { outcome: unknown; amount: unknown };

  if (typeof outcome !== "boolean") {
    res.status(400).json({ error: "outcome must be a boolean" });
    return;
  }

  if (typeof amount !== "string" || !/^\d+$/.test(amount) || amount === "0") {
    res.status(400).json({ error: "amount must be a positive integer string" });
    return;
  }

  const amountBig = BigInt(amount);

  try {
    const market = await getMarket(marketId);
    const result = simulateBet(market.yesPool, market.noPool, outcome, amountBig);

    res.json({
      data: {
        marketId,
        outcome,
        amountIn: amount,
        sharesOut: result.sharesOut.toString(),
        priceImpact: result.priceImpact,
        priceBefore: result.priceBefore,
        priceAfter: result.priceAfter,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to simulate bet", details: String(err) });
  }
});

export default router;

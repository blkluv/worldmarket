import { Router, Request, Response } from "express";
import { resolveMarket, getMarket } from "../services/contract";
import { emitEvent } from "./stream";

const router = Router();

router.post("/markets/:id/resolve", async (req: Request, res: Response) => {
  const marketId = parseInt(req.params.id, 10);
  if (isNaN(marketId) || marketId < 0) {
    res.status(400).json({ error: "Invalid market id" });
    return;
  }

  const { outcome, adminKey } = req.body as {
    outcome: unknown;
    adminKey: unknown;
  };

  const expectedKey = process.env.ADMIN_RESOLVE_KEY ?? "demo-admin";
  if (adminKey !== expectedKey) {
    res.status(403).json({ error: "Invalid admin key" });
    return;
  }

  if (typeof outcome !== "boolean") {
    res.status(400).json({ error: "outcome must be a boolean" });
    return;
  }

  try {
    resolveMarket(marketId, outcome);
    const m = await getMarket(marketId);

    emitEvent("market_resolved", {
      marketId,
      winningOutcome: outcome,
    });

    res.json({
      data: {
        marketId,
        winningOutcome: m.winningOutcome,
        status: m.status,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to resolve market", details: String(err) });
  }
});

export default router;

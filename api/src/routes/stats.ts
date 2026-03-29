import { Router, Request, Response } from "express";
import { getDemoStats, getDemoBets } from "../services/contract";

const router = Router();

router.get("/stats", (_req: Request, res: Response) => {
  const stats = getDemoStats();
  res.json({
    data: {
      totalBets: stats.totalBets,
      totalVolume: stats.totalVolume.toString(),
      activeAgents: stats.activeAgents,
      marketsOpen: stats.marketsOpen,
    },
  });
});

router.get("/bets/history", (req: Request, res: Response) => {
  const wallet = req.query.wallet as string;
  const bets = getDemoBets(wallet);
  res.json({
    data: bets.map(b => ({
      id: b.id,
      ts: b.ts,
      marketId: b.marketId,
      outcome: b.outcome,
      amount: b.amount.toString(),
      wallet: b.wallet,
    }))
  });
});

export default router;

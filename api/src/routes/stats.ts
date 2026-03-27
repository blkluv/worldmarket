import { Router, Request, Response } from "express";
import { getDemoStats } from "../services/contract";

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

export default router;

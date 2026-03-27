import { Router, Request, Response } from "express";
import { getMarket } from "../services/contract";
import { getPrice } from "../services/pricer";
import { getPriceHistory, recordPrice } from "../services/history";

const router = Router();

router.get("/markets/:id/price-history", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id < 0) {
    res.status(400).json({ error: "Invalid market id" });
    return;
  }
  try {
    let data = getPriceHistory(id);
    // Seed an initial point if history is empty
    if (data.length === 0) {
      const m = await getMarket(id);
      const price = getPrice(m.yesPool, m.noPool);
      recordPrice(id, price.yes, price.no);
      data = getPriceHistory(id);
    }
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch price history", details: String(err) });
  }
});

export default router;

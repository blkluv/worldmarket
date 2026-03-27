import { Router, Request, Response } from "express";
import { getAllMarkets, getMarket } from "../services/contract";
import { getPrice } from "../services/pricer";

const router = Router();

router.get("/markets", async (_req: Request, res: Response) => {
  try {
    const markets = await getAllMarkets();
    const data = markets.map((m) => ({
      ...m,
      deadline: m.deadline.toString(),
      yesPool: m.yesPool.toString(),
      noPool: m.noPool.toString(),
      price: getPrice(m.yesPool, m.noPool),
    }));
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch markets", details: String(err) });
  }
});

router.get("/markets/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id < 0) {
    res.status(400).json({ error: "Invalid market id" });
    return;
  }
  try {
    const m = await getMarket(id);
    res.json({
      data: {
        ...m,
        deadline: m.deadline.toString(),
        yesPool: m.yesPool.toString(),
        noPool: m.noPool.toString(),
        price: getPrice(m.yesPool, m.noPool),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch market", details: String(err) });
  }
});

router.get("/markets/:id/price", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id < 0) {
    res.status(400).json({ error: "Invalid market id" });
    return;
  }
  try {
    const m = await getMarket(id);
    const price = getPrice(m.yesPool, m.noPool);
    res.json({
      data: {
        marketId: id,
        price,
        yesPool: m.yesPool.toString(),
        noPool: m.noPool.toString(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch price", details: String(err) });
  }
});

export default router;

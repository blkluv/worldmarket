import { Router, Request, Response } from "express";
import { getAllMarkets, getMarket, getPerHumanCap } from "../services/contract";
import { getPrice } from "../services/pricer";

const router = Router();

function statusLabel(status: number): string {
  if (status === 0) return "OPEN";
  if (status === 1) return "RESOLVED";
  return "CLOSED";
}

router.get("/markets", async (_req: Request, res: Response) => {
  try {
    const markets = await getAllMarkets();
    const humanCap = (await getPerHumanCap()).toString();
    const data = markets.map((m) => ({
      ...m,
      deadline: m.deadline.toString(),
      yesPool: m.yesPool.toString(),
      noPool: m.noPool.toString(),
      price: getPrice(m.yesPool, m.noPool),
      humanCap,
      statusLabel: statusLabel(m.status),
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
    const humanCap = (await getPerHumanCap()).toString();
    res.json({
      data: {
        ...m,
        deadline: m.deadline.toString(),
        yesPool: m.yesPool.toString(),
        noPool: m.noPool.toString(),
        price: getPrice(m.yesPool, m.noPool),
        humanCap,
        statusLabel: statusLabel(m.status),
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

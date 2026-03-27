import { Router, Request, Response } from "express";
import { isAddress } from "ethers";
import {
  getMarket,
  humanOf,
  getPerHumanCap,
  getHumanExposure,
  placeBet,
} from "../services/contract";
import { emitEvent } from "./stream";

const router = Router();

router.post("/markets/:id/bet", async (req: Request, res: Response) => {
  const marketId = parseInt(req.params.id, 10);
  if (isNaN(marketId) || marketId < 0) {
    res.status(400).json({ error: "Invalid market id" });
    return;
  }

  const { outcome, amount, wallet } = req.body as {
    outcome: unknown;
    amount: unknown;
    wallet: unknown;
  };

  // Validate outcome
  if (typeof outcome !== "boolean") {
    res.status(400).json({ error: "outcome must be a boolean" });
    return;
  }

  // Validate amount
  if (typeof amount !== "string" || !/^\d+$/.test(amount) || amount === "0") {
    res.status(400).json({ error: "amount must be a positive integer string" });
    return;
  }

  // Validate wallet
  if (typeof wallet !== "string" || !isAddress(wallet)) {
    res.status(400).json({ error: "wallet must be a valid EVM address" });
    return;
  }

  const amountBig = BigInt(amount);

  try {
    // Fetch market
    const market = await getMarket(marketId);

    // Check market exists and is open (status 0 = OPEN)
    if (market.status !== 0) {
      res.status(400).json({ error: "Market is not open" });
      return;
    }

    // Check deadline
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (now >= market.deadline) {
      res.status(400).json({ error: "Market deadline has passed" });
      return;
    }

    // Check wallet is registered
    const human = await humanOf(wallet);
    if (!human || human === "0x0000000000000000000000000000000000000000") {
      res.status(400).json({ error: "Wallet is not registered with HumanRegistry" });
      return;
    }

    // Check human cap
    const [humanCap, humanExposure] = await Promise.all([
      getPerHumanCap(),
      getHumanExposure(marketId, human),
    ]);

    if (humanExposure + amountBig > humanCap) {
      res.json({
        error: "human cap exceeded",
        humanExposure: humanExposure.toString(),
        humanCap: humanCap.toString(),
      });
      return;
    }

    // Place bet on chain
    const tx = await placeBet(marketId, outcome, amountBig, wallet);
    const receipt = await tx.wait();

    const humanExposureAfter = humanExposure + amountBig;
    const remainingCap = humanCap - humanExposureAfter;

    // Emit SSE event
    emitEvent("bet", {
      marketId,
      outcome,
      amount,
      wallet,
      txHash: receipt?.hash ?? tx.hash,
    });

    res.json({
      data: {
        txHash: receipt?.hash ?? tx.hash,
        marketId,
        outcome,
        amount,
        humanExposureAfter: humanExposureAfter.toString(),
        humanCap: humanCap.toString(),
        remainingCap: remainingCap.toString(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to place bet", details: String(err) });
  }
});

export default router;

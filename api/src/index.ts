import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import { paymentMiddleware, x402Routes, resourceServer } from "./middleware/x402";
import marketsPublicRouter from "./routes/marketsPublic";
import marketsRouter from "./routes/markets";
import betsRouter from "./routes/bets";
import simulateRouter from "./routes/simulate";
import streamRouter from "./routes/stream";
import historyRouter from "./routes/history";
import resolveRouter from "./routes/resolve";
import statsRouter from "./routes/stats";

const app = express();
app.use(cors());
app.use(express.json());

// Health check (Railway uses this)
app.get("/health", (_req, res) => res.json({ ok: true }));

// Free public reads — must come before paymentMiddleware
app.use(marketsPublicRouter);
app.use(historyRouter);
app.use(statsRouter);

// x402 payment middleware — must come before gated routes
if (process.env.DEMO_MODE !== "true") {
  app.use(paymentMiddleware(x402Routes, resourceServer));
}

if (process.env.DEMO_MODE === "true") {
  app.get("/markets", async (_req, res) => {
    res.json({
      data: [
        {
          id: 0,
          question: "Will the agent successfully trade in demo mode?",
          deadline: (Date.now() + 86400000).toString(),
          status: 0,
          yesPool: "100000000",
          noPool: "100000000",
          price: { yes: 0.5, no: 0.5 },
        },
      ],
    });
  });

  app.get("/markets/:id/price", async (_req, res) => {
    res.json({
      data: {
        marketId: 0,
        price: { yes: 0.51, no: 0.49 },
        yesPool: "100000000",
        noPool: "100000000",
      },
    });
  });

  app.post("/markets/:id/simulate", async (_req, res) => {
    res.json({
      data: {
        marketId: 0,
        outcome: true,
        amountIn: "1000000",
        sharesOut: "990000",
        priceImpact: 0.01,
        priceBefore: { yes: 0.5, no: 0.5 },
        priceAfter: { yes: 0.51, no: 0.49 },
      },
    });
  });

  app.post("/markets/:id/bet", async (_req, res) => {
    res.json({
      data: {
        txHash: "0x" + "0".repeat(64),
        marketId: 0,
        outcome: true,
        amount: "1000000",
        humanExposureAfter: "1000000",
        humanCap: "10000000",
        remainingCap: "9000000",
      },
    });
  });
}

// Routes
app.use(marketsRouter);
app.use(betsRouter);
app.use(simulateRouter);
app.use(streamRouter);
app.use(resolveRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`WorldMarket API running on port ${PORT}`);
});

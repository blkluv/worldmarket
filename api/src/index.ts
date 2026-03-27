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

const app = express();
app.use(cors());
app.use(express.json());

// Health check (Railway uses this)
app.get("/health", (_req, res) => res.json({ ok: true }));

// Free public reads — must come before paymentMiddleware
app.use(marketsPublicRouter);

// x402 payment middleware — must come before gated routes
if (process.env.DEMO_MODE !== "true") {
  app.use(paymentMiddleware(x402Routes, resourceServer));
}

// Routes
app.use(marketsRouter);
app.use(betsRouter);
app.use(simulateRouter);
app.use(streamRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`WorldMarket API running on port ${PORT}`);
});

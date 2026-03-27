# WorldMarket Demo Status
_Generated March 27, 2026_

---

## Is the Live Feed Real or Fake?

**The feed is real-time but the bets are simulated.**

| Layer | Real? | Details |
|---|---|---|
| SSE connection (`/stream`) | ✅ Real | Genuine Server-Sent Events endpoint, browsers receive push events |
| Agent is actually running | ✅ Real | Railway service calling API every 5 seconds |
| Prices change over time | ✅ Real | Pool sizes update in-memory as agent bets, prices shift |
| Bet events in the feed | ✅ Real | Agent → API → `emitEvent("bet", {...})` → your browser in real-time |
| Transaction hashes | ❌ Fake | Generated as `0x` + hex of `"demo-<timestamp>-<random>"` |
| USDC movement | ❌ Fake | In-memory accounting only, no real tokens move |
| World ID verification | ❌ Bypassed | `DEMO_MODE` skips `humanOf()` check entirely |
| x402 micropayments | ❌ Broken | `PAYMENT_RECIPIENT=0x000...000`, no real payments collected |
| Blockchain | ❌ None | No contracts deployed, no RPC calls happening |

**Bottom line:** The feed is a real SSE stream driven by a real agent process. The activity is genuine — bets fire at real intervals, prices update, events arrive in your browser. The on-chain layer is fully mocked.

---

## What Needs to Happen for an Amazing Demo

### 🔴 Broken / Embarrassing (fix before showing anyone)

**1. Market deadlines are in the past**
- All 3 markets say "end of 2025" / "Q3 2025" / "end of 2025" but today is March 2026
- Every market page shows expired deadlines
- Fix: Update `DEMO_MARKETS` deadlines in `api/src/services/contract.ts` to 2026/2027 dates

**2. No way for users to place bets**
- The market detail page (`/market/[id]`) shows prices and the agent feed but has no bet form
- `CapMeter` is hardcoded to `humanCap = "2000000"` ($2) instead of reading from API
- Fix: Add a YES/NO bet form to the market detail page

**3. World ID registration is broken**
- `/register` page exists but `NEXT_PUBLIC_WLD_APP_ID`, `RP_SIGNING_KEY`, and `RP_ID` are not set in Railway
- Any user clicking "Register" will get an error
- Fix: Either set up World ID credentials or hide the Register link in DEMO_MODE

---

### 🟡 Weak for a Demo (high impact improvements)

**4. Price history chart**
- Prices change as the agent bets but there's no chart — visitors see a static number
- Impact: Huge. A live chart moving in real-time is the single most compelling visual
- Fix: Add a sparkline or candlestick chart components; store price snapshots in-memory on the API side

**5. Only one agent, one strategy**
- The contrarian strategy always bets on the underpriced outcome
- All bets are the same size ($1 USDC) and same agent wallet
- Impact: Feed looks repetitive; doesn't showcase the "AI agents pay to play" pitch
- Fix: Add 2–3 more agent instances with different strategies (momentum, random, ML-based) and different wallet addresses. Each agent already runs as its own Railway service.

**6. The AgentFeed isn't visible on the homepage**
- Visitors land on the homepage, see 3 market cards, and leave — they never see the agent feed
- Fix: Add a condensed live feed panel to the homepage showing recent bets across all markets

**7. No market resolution / winner display**
- There's no UI to resolve markets (pick YES/NO) and no display of settled markets
- A resolved market with a winning side shows the system works end-to-end
- Fix: Add an admin endpoint `POST /markets/:id/resolve` and a "Resolved" badge/payout display

---

### 🟢 Production / Real Money path

**8. Deploy contracts to Base Sepolia**
```bash
cd contracts
forge script script/Deploy.s.sol \
  --rpc-url https://sepolia.base.org \
  --private-key $YOUR_KEY \
  --broadcast --verify
```
Then set in Railway:
- `WORLD_MARKET_ADDRESS` → API + frontend
- `HUMAN_REGISTRY_ADDRESS` → API + frontend
- `ADMIN_PRIVATE_KEY` → API
- `AGENT_PRIVATE_KEY` → agent (must call `registerAgent()` first)
- Remove `DEMO_MODE=true` from all services

**9. Wire up x402 micropayments**
- Set `PAYMENT_RECIPIENT` to a real wallet address in Railway API service
- The infrastructure is already there — agents call `GET /markets` which has a `$0.001` paywall
- Right now `0x000...000` receives all fees (burned)

**10. World ID integration**
- Register at [developer.worldcoin.org](https://developer.worldcoin.org)
- Set `NEXT_PUBLIC_WLD_APP_ID`, `RP_SIGNING_KEY`, `RP_ID` in Railway frontend service
- The `/register` flow and `WorldIDButton` component are already built

---

## Prioritized Action Plan

| Priority | Task | Effort | Demo Impact |
|---|---|---|---|
| 1 | Fix market deadlines (2026/2027) | 5 min | 🔴 Must fix |
| 2 | Add bet form to market detail page | 2–3 hrs | 🔴 Core feature missing |
| 3 | Add price history chart | 3–4 hrs | 🟡 Single biggest visual upgrade |
| 4 | Add agents feed to homepage | 1 hr | 🟡 First impression |
| 5 | Add 2 more agents (different strategies) | 2 hrs | 🟡 Sells the pitch |
| 6 | World ID setup or hide Register | 30 min | 🔴 Broken UX |
| 7 | Market resolution endpoint + UI | 2–3 hrs | 🟡 Completes the loop |
| 8 | Deploy to Base Sepolia | 1–2 hrs + gas | 🟢 Real money mode |
| 9 | Set real `PAYMENT_RECIPIENT` | 5 min | 🟢 Monetize agent calls |

---

## Current Live URLs

| Service | URL | Status |
|---|---|---|
| Frontend | https://worldmarket-frontend-production.up.railway.app | ✅ Live |
| API | https://worldmarket-api-production-e78a.up.railway.app | ✅ Live |
| Agent | Railway background worker | ✅ Trading every 5s |

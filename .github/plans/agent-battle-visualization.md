# Agent Battle Visualization Plan
_Generated March 29, 2026_

---

## Goal

Fix zero agent activity on `/agents` (root-cause: DEMO_MODE route stubs in `api/src/index.ts` intercept bets before `betsRouter` → `emitEvent` never fires), then rebuild the page into a stunning multi-panel battle arena with live sparklines, leaderboard, per-market pressure gauges, and animated bet stream.

---

## Constraints

- No new npm packages for charts — pure SVG paths only (already established pattern in PriceChart.tsx)
- `api/src/services/contract.ts` DEMO_MARKETS not changed (already has 3 correct markets + real pool state)
- Do not touch `contracts/` Solidity
- `DEMO_MODE=true` on all Railway services — all fixes must work in DEMO_MODE
- Agent uses plain `fetch` (no x402) in DEMO_MODE — must not add payment requirements to agent-facing routes
- Frontend is Next.js 15 App Router; `frontend/app/agents/page.tsx` is a client component ("use client") — keep it that way
- Tailwind v4 (`@theme`) — extend `globals.css` only, never raw Tailwind utility classes
- SSE stream (`/stream`) is in-memory; Railway redeploys reset all history (acceptable)
- Agent Railway service: single instance, single strategy, trades `markets[0]` only — plan extends this

---

## Root Cause: Zero Agent Activity

### What's broken

`api/src/index.ts` registers DEMO_MODE route stubs *directly on `app`* before `app.use(betsRouter)`:

```
app.get("/markets", ...)          // returns 1 fake market, never updates pool state
app.get("/markets/:id/price", ...) // always returns { yes: 0.51, no: 0.49 }
app.post("/markets/:id/simulate", ...)
app.post("/markets/:id/bet", ...)  // ← returns fake success but NEVER calls emitEvent()
```

Express matches these before `betsRouter`. `emitEvent("bet", ...)` lives only in `bets.ts`.
Result: agent loops every 5s, hits the stub, gets fake success, SSE stream stays silent, stats stay 0.

Confirmed via:
- `GET https://worldmarket-api-production-e78a.up.railway.app/markets` → `"Will the agent successfully trade in demo mode?"` (the stub)
- `GET /stats` → `{ totalBets: 0, totalVolume: "0", activeAgents: 0, marketsOpen: 3 }`
- Real DEMO_MARKETS in `contract.ts` has 3 markets with correct pool state (5B/3B, 2B/4B, 1.5B/1B)

### Fix

Delete all 4 DEMO_MODE route stubs from `api/src/index.ts`. The real routers already handle DEMO_MODE:
- `marketsRouter` (`GET /markets`) uses `DEMO_MARKETS` from contract.ts → returns 3 real markets
- `betsRouter` (`POST /markets/:id/bet`) skips World ID check when `DEMO_MODE=true`, calls `emitEvent`, updates `demoTotalBets` / `demoActiveWallets`
- `simulateRouter` handles DEMO_MODE internally

---

## Unknowns / Risks

- **Agent multi-market looping**: agent/src/index.ts hardcodes `markets[0]` — after fix, only market 0 (BTC, YES≈63%) will show bets. Contrarian will bet NO. Feed will look repetitive. Fix: rotate across all markets each loop iteration.
- **Agent cap exit**: after hitting `humanCap` for a wallet on a market, agent calls `process.exit(0)`. Railway `restartPolicyType = "on_failure"` won't restart on clean exit. Fix: replace `process.exit(0)` with restart logic (skip to next market or reset with delay). Otherwise agent dies silently after ~$10,000 of demo bets.
- **Price history in-memory**: resets on deployment. Sparklines will be empty on fresh deploys. Acceptable for demo; warn in UI if no history yet with a "warming up" state.
- **agentName in bets SSE**: `bets.ts` reads `agentName` from `req.body` — agent sends `AGENT_STRATEGY` env var as `agentName`. Only 1 agent/strategy deployed on Railway currently → all bets show as "contrarian". Multi-agent requires either: (a) deploy 2 more Railway agent services with different `AGENT_STRATEGY`, or (b) simulate multiple agents in a single process.
- **`price_update` SSE event**: emitted from `bets.ts` after each bet. After fix, this will fire — frontend already handles it. ✓
- **XMTP_ENABLED**: not set on Railway agent → XMTP disabled. No dependency on XMTP for the SSE flow. ✓

---

## Steps

### Stage 0 — Fix Agent Activity (immediate, ~30 min)

**S0.1 — Remove DEMO_MODE route stubs from `api/src/index.ts`**

File: `api/src/index.ts`

Delete the entire `if (process.env.DEMO_MODE === "true")` block that registers:
- `app.get("/markets", ...)`
- `app.get("/markets/:id/price", ...)`
- `app.post("/markets/:id/simulate", ...)`
- `app.post("/markets/:id/bet", ...)`

The `if (process.env.DEMO_MODE !== "true") { app.use(paymentMiddleware(...)) }` stays — correct.

After removal, Express falls through to `app.use(marketsRouter)` and `app.use(betsRouter)` which handle DEMO_MODE with real state.

---

**S0.2 — Fix agent multi-market looping**

File: `agent/src/index.ts`

Change the inner loop from hardcoded `markets[0]` to rotate across all markets each 5s cycle:

```typescript
// Before:
const marketId = markets[0].id ?? 0;
while (true) { /* only ever bets marketId */ }

// After:
let marketIdx = 0;
while (true) {
  const market = markets[marketIdx % markets.length];
  marketIdx++;
  // ... bet on market.id, use market.question
}
```

This produces bets across all 3 markets → more interesting feed, all pool bars move.

---

**S0.3 — Replace `process.exit(0)` on cap hit with continue**

File: `agent/src/index.ts`

When `betResult.error === "human cap exceeded"` — instead of `process.exit(0)`, log and `continue` (skip to next market in the loop). This prevents the agent from dying silently.

Also: after each successful bet, re-fetch markets to get updated pool prices (or just use the `price_update` event flowing back). Simple fix: re-fetch markets list at the top of each loop iteration.

---

**S0.4 — Deploy fixes to Railway**

Push changes to `main`. Railway auto-deploys on push to `api` and `agent` services.
Verify via `/stats` endpoint — `totalBets` should start incrementing within ~15s of deploy.

---

### Stage 1 — Visual Overhaul: Agent Cards + Leaderboard (~2 hrs)

**Current state** (from Playwright screenshot):
- 3 stacked cards, each 200px wide, centered in a narrow 600px column
- Just: emoji, name, "0 bets", "$0.00 vol", "waiting…"
- No visual differentiation, no activity indicators, no relative comparison

**S1.1 — Redesign agent cards into leaderboard rows with sparkline**

File: `frontend/app/agents/page.tsx`, `frontend/app/globals.css`

Replace the `.agent-cards` grid with a `.agent-leaderboard` layout:
- Full-width rows, ranked by bet count (rank badge: #1, #2, #3)
- Left: rank + emoji + name + strategy description (1 sentence)
- Center: live stats — bets count, volume, win rate (YES bets / total), last bet direction badge
- Right: 60px × 32px inline SVG sparkline of last 20 bet outcomes (YES=green dot, NO=red dot on timeline)
- Animated rank changes when positions swap (CSS transition on `order`)
- Pulse ring animation on card border when agent fires a new bet (existing `agent-pulse-ring` keyframe, reuse)
- Accent color stripe on left edge (existing `--agent-color` CSS var)

Track win rate: add `yesBets: number` to `AgentStats`. Increment in `bet` SSE handler.

---

**S1.2 — Add agent strategy description**

File: `frontend/app/agents/page.tsx`

Extend `AGENT_META` with a `desc` field:
```typescript
contrarian: { ..., desc: "Bets the underpriced side" },
momentum:   { ..., desc: "Follows the dominant outcome" },
random:     { ..., desc: "Coin flip on every market" },
```
Display in the card under the name. Helps viewers understand the battle.

---

### Stage 2 — Market Pressure Gauges (~1.5 hrs)

**Current state**: Simple YES/NO bar rows. Bars don't animate in meaningful way. No history.

**S2.1 — Redesign market rows into pressure panels**

File: `frontend/app/agents/page.tsx`, `frontend/app/globals.css`

Each market gets a "pressure panel":
- Question + countdown timer (days remaining until deadline)
- Dual-sided animated bar (YES pushes from left, NO from right) — already exists as `.pool-bar`, improve animation timing to `800ms` with spring easing
- Below the bar: pool size in USDC (`$5,000 YES pool · $3,000 NO pool`)
- Inline 120px SVG sparkline of YES% over time (fetched from `/history/:id`)
- Highlight which agent(s) last bet on this market with colored agent dot(s)

---

**S2.2 — Wire sparklines to `/history/:id` endpoint**

File: `frontend/app/agents/page.tsx`

On mount, fetch `${API_URL}/history/${m.id}` for each market. Map price snapshots to an SVG polyline. Animate new point append on each `price_update` SSE event.

The `/history/:id` route already exists (`api/src/routes/history.ts`). Verify it returns `{ data: [{ timestamp, price: { yes, no } }] }` shape — check below.

---

### Stage 3 — Live Battle Feed Redesign (~1.5 hrs)

**Current state**: Plain monospace text list. No visual weight. New bets don't animate in.

**S3.1 — Animate feed entries on insert**

File: `frontend/app/globals.css`

Add `@keyframes feed-slide-in` — new entries slide down from top with opacity fade:
```css
@keyframes feed-slide-in {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.feed-row--new { animation: feed-slide-in 300ms var(--ease-out-quint) forwards; }
```

In `page.tsx`, add `--new` class to first entry only (remove after 1 animation cycle via setTimeout).

---

**S3.2 — Add market name chip to feed rows**

File: `frontend/app/agents/page.tsx`

Each feed row already has `entry.question` but it's truncated. Add a colored market chip before the question:
```
[TIME] 🔄 CONTRARIAN  NO  $1.00  [BTC]  Will BTC exceed…
```
Market chip color: cycle 3 fixed hues per market id (oklch warm/cool/neutral). Small pill badge, colored border.

---

**S3.3 — Global stats bar with animated counters**

File: `frontend/app/agents/page.tsx`

Replace the static `battle-stats-bar` text with animated number transitions.
Use CSS `counter-increment` trick or a simple `useEffect` that steps the displayed number toward the real value over 300ms.
Add a "bets/min" derived stat: count feed entries in last 60s and display.

---

### Stage 4 — Battle Arena Header (~45 min)

**S4.1 — Replace plain title with a visual arena header**

File: `frontend/app/agents/page.tsx`, `frontend/app/globals.css`

Add a `.battle-arena-header` section above the agent cards:
- Large monospace ticker showing most recent bet event (auto-updates): `🔄 CONTRARIAN just bet NO on BTC — $1.00`  
- Alternating highlight of winning agent (most bets in last 60s) with crown emoji 👑
- Horizontal scrolling marquee of all market questions (CSS `@keyframes marquee` on a duplicated text track)
- Background: subtle radial gradient pulse on new bet (`@keyframes arena-pulse`)

---

### Stage 5 — (Optional) Multi-Agent Demo Mode (~2 hrs, requires Railway deploy)

If only 1 agent is deployed, all activity shows as "contrarian". For a real battle:

**S5.1 — Deploy 2 more Railway agent services**

Railway: duplicate the `agent` service twice, set `AGENT_STRATEGY=momentum` and `AGENT_STRATEGY=random` respectively. Each service needs its own `AGENT_PRIVATE_KEY` (generate 2 new throwaway EOAs, fund with DEMO_MODE-compatible fake balance).

No code changes needed — agent already reads `AGENT_STRATEGY` env var.

**S5.2 — (Alternative) Multi-strategy simulation in single agent process**

File: `agent/src/index.ts`

If Railway costs are a concern, run 3 concurrent `run()` loops in the same process, each with a different strategy and wallet address. Requires adding `AGENT_WALLETS` env support and running `Promise.all([run("contrarian", wallet1), run("momentum", wallet2), run("random", wallet3)])`.

---

## Verification

| Step | Signal |
|---|---|
| S0.1 deployed | `GET /markets` returns 3 markets with real questions (not "Will the agent successfully trade in demo mode?") |
| S0.2 deployed | `/stats` `totalBets` increments from 0; SSE stream receives `bet` events; UI shows non-zero counts within 30s of page load |
| S0.3 | Agent process stays alive indefinitely on Railway (no clean-exit restarts) |
| S1.1 | Agent cards show ranked leaderboard rows; bet count increments live; sparkline dots appear |
| S2.1 | Pool bars animate on each `price_update` SSE event; countdown shows correct days remaining |
| S2.2 | History sparklines render on page load; new point appended on each price update |
| S3.1 | New feed row slides in from top with fade animation; visible in both Chrome and Safari |
| S3.3 | Stats counters animate to new value on each bet; "bets/min" shows ~12/min (3 agents × 5s loop) |
| S4.1 | Arena header shows last-bet ticker; crown moves to agent with most bets in last 60s |
| S5 (optional) | 3 differently-colored agent names appear in feed; leaderboard shows competitive standings |

---

## File Ownership (no conflicts)

| File | Stage |
|---|---|
| `api/src/index.ts` | S0.1 only |
| `agent/src/index.ts` | S0.2, S0.3 |
| `frontend/app/agents/page.tsx` | S1.1, S1.2, S2.1, S2.2, S3.1, S3.2, S3.3, S4.1 |
| `frontend/app/globals.css` | S1.1, S2.1, S3.1, S4.1 |

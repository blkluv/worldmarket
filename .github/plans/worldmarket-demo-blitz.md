# WorldMarket Demo Blitz Plan
_Generated March 27, 2026_

---

## Goal

Transform WorldMarket from a functional skeleton into a jaw-dropping live demo by fixing all broken UX, adding a price-history chart, multi-agent ecosystem, bet form, homepage live feed, market resolution, real-time animated UI, and an XMTP-powered AI agent group chat — structured for 6 agents executing in parallel with zero file conflicts.

---

## Current State (observed via live site + code audit)

| Issue | Severity | Observed |
|---|---|---|
| Market status badge renders raw `0` not "OPEN" | 🔴 Bug | market detail page |
| CapMeter shows `$5336.00 / $2.00` at 100% always | 🔴 Bug | hardcoded `exposure=yesPool`, `cap="2000000"` |
| No bet form | 🔴 Missing | market detail page |
| Market questions reference "end of 2025" | 🟡 Stale | all 3 DEMO_MARKETS in contract.ts |
| No price history chart | 🟡 Missing | market detail page |
| Homepage has no live feed | 🟡 Missing | homepage |
| One agent, one wallet, one strategy, one market | 🟡 Weak | agent only trades market 0, always YES |
| No market resolution flow | 🟡 Missing | no resolve endpoint or UI |
| Register page → World ID step will hard-crash | 🔴 Broken | env vars not set on Railway |
| `humanCap` not exposed in public API | 🟡 Missing | CapMeter can't be computed client-side |
| SSE price_update event never emitted | 🟡 Missing | no real-time price refresh |

---

## Constraints

- DEMO_MODE=true on all Railway services; no real chain calls
- No new npm packages unless strictly required; prefer built-ins or already-installed
- All API changes must remain backwards-compatible (existing agent still works)
- Do not touch `contracts/` — no Solidity changes in this plan
- Do not delete any existing route or env var
- Frontend is Next.js 15 App Router; server components for data fetch, client components for interactivity
- Tailwind v4 (`@theme`) — use existing CSS variables; do not add Tailwind utility classes that bypass the design tokens
- 5 agents execute simultaneously; each track owns exclusive files (listed per track)

---

## Unknowns / Risks

- `AgentFeed.tsx` SSE connects directly to `NEXT_PUBLIC_API_URL` from client; cross-origin must remain open (CORS already `*`)
- Recharts / visx / chart libs: do NOT add heavy charting deps — use pure SVG sparkline
- `NEXT_PUBLIC_API_URL` is baked at build time on Railway; live screenshots confirm it resolves correctly
- World ID env vars: plan assumes they stay unset; Register page will be patched to gracefully degrade
- `agent/src/x402Client.ts` — not modified in any track; existing payment header behavior preserved
- `price-history` store is in-memory; Railway redeploys will reset it (acceptable for demo)
- `humanExposure` per wallet requires wallet address; in DEMO_MODE the bet form can use connected wallet or fall back to a demo address; exact UX decision is in Track B

---

## Agent Track Assignments (File Ownership — Zero Overlap)

| Track | Agent | Owns (exclusively) |
|---|---|---|
| **A** | API Fixes + New Endpoints | `api/src/services/contract.ts`, `api/src/routes/marketsPublic.ts`, `api/src/routes/markets.ts`, `api/src/routes/bets.ts`, `api/src/routes/stream.ts`, `api/src/index.ts`, new: `api/src/services/history.ts`, `api/src/routes/history.ts`, `api/src/routes/resolve.ts`, `api/src/routes/stats.ts` |
| **B** | Bet Form + Market Detail Fixes | `frontend/app/market/[id]/page.tsx`, new: `frontend/components/BetForm.tsx` |
| **C** | Homepage Live Feed + Stats | `frontend/app/page.tsx`, new: `frontend/components/HomepageFeed.tsx`, new: `frontend/components/LiveStatsTicker.tsx` |
| **D** | Price History Chart | new: `frontend/components/PriceChart.tsx` |
| **E** | Multi-Agent System + Feed Display | `agent/src/strategy.ts`, `agent/src/index.ts`, `agent/src/wallet.ts`, `frontend/components/AgentFeed.tsx`, `frontend/lib/types/events.ts` |
| **F** | XMTP Agent Group Chat | new `agent/src/xmtpBroadcast.ts`, new `frontend/components/AgentChat.tsx`, new `frontend/app/chat/page.tsx` |

**Cross-track dependencies (read-only):**
- B imports `PriceChart` from Track D — D must define the component interface first (props: `marketId: number`, `apiUrl: string`)
- B imports `BetForm`; no external dep
- C imports `AgentFeed` (Track E modifies it) — C only adds it to the page, does not modify the component
- E depends on Track A adding `agentName` to the `bet` SSE event payload in `bets.ts`
- F creates `xmtpBroadcast.ts` and exports `broadcastBet()`; Track E adds ONE import + one call in `index.ts` after successful bet (Track E owns that file, Track F only provides the module)
- F's frontend `AgentChat.tsx` is embedded in `frontend/app/chat/page.tsx` (new file, owned by F — no conflict). Track C's homepage may optionally link to `/chat` — document as a note, not a hard dependency

---

## Steps

### TRACK A — API Fixes + New Endpoints

**File ownership:** `api/src/services/contract.ts`, `api/src/routes/marketsPublic.ts`, `api/src/routes/markets.ts`, `api/src/routes/bets.ts`, `api/src/routes/stream.ts`, `api/src/index.ts`, + new files

---

**A1. Update DEMO_MARKETS questions and add humanCap to all market responses**

File: `api/src/services/contract.ts`

- Replace market questions with current 2026/2027 questions:
  - id 0: `"Will BTC exceed $150k by end of 2026?"`
  - id 1: `"Will the Fed cut rates to below 3% before Jan 2027?"`
  - id 2: `"Will Ethereum EIP-7702 be live on mainnet before 2027?"`
- Deadlines already compute as `Date.now() / 1000 + N * 86400` — verify values give dates in late 2026/early 2027:
  - id 0: `+365 days` → Mar 2027 ✓ (confirmed from live API)
  - id 1: `+180 days` → Sep 2026 ✓
  - id 2: `+270 days` → Dec 2026 ✓
- Add `DEMO_CAP` export: already exists as `BigInt("10000000000")` — expose via `getPerHumanCap()` (already done). No change needed here.
- Add `resolveMarket(marketId, winningOutcome)` function in DEMO_MODE: mutate `DEMO_MARKETS[id].status = 1`, `winningOutcome`, `winningOutcomeSet = true`
- Export `DEMO_MARKETS` reference (or add a `getMarketCount()` helper) for stats endpoint

---

**A2. Create price history service**

New file: `api/src/services/history.ts`

```typescript
interface PricePoint { ts: number; yes: number; no: number; }
const history: Map<number, PricePoint[]> = new Map();
const MAX_POINTS = 200;

export function recordPrice(marketId: number, yes: number, no: number): void {
  if (!history.has(marketId)) history.set(marketId, []);
  const arr = history.get(marketId)!;
  arr.push({ ts: Date.now(), yes, no });
  if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS);
}

export function getPriceHistory(marketId: number): PricePoint[] {
  return history.get(marketId) ?? [];
}
```

---

**A3. Emit `price_update` SSE event on every bet + record history**

File: `api/src/routes/bets.ts`

After the `placeBet` call succeeds and before `res.json(...)`:
1. Compute new price: `getPrice(m.yesPool, m.noPool)` — but the market object `m` was fetched before the bet. Fetch the updated market: `const updated = await getMarket(marketId);`
2. `const newPrice = getPrice(updated.yesPool, updated.noPool);`
3. `recordPrice(marketId, newPrice.yes, newPrice.no);` (import from history service)
4. `emitEvent("price_update", { marketId, price: newPrice, yesPool: updated.yesPool.toString(), noPool: updated.noPool.toString(), ts: Date.now() });`
5. Also forward `agentName` from request body into the `bet` SSE event (for Track E):
   - Add `agentName?: string` to the destructured request body
   - Pass `agentName` into `emitEvent("bet", { ..., agentName: agentName ?? null })`

---

**A4. Add `humanCap` and status string to public market responses**

Files: `api/src/routes/marketsPublic.ts`, `api/src/routes/markets.ts`

In both files, in the `.map()` that serializes markets, add:
```typescript
humanCap: (await getPerHumanCap()).toString(),
statusLabel: m.status === 0 ? "OPEN" : m.status === 1 ? "RESOLVED" : "CLOSED",
```

Note: `getPerHumanCap()` is async — convert map to `Promise.all(markets.map(async (m) => ({ ... })))`.

For single-market routes (`/markets/:id/public`, `/markets/:id`), same additions.

---

**A5. Add price history route**

New file: `api/src/routes/history.ts`

```typescript
GET /markets/:id/price-history
→ { data: PricePoint[] }
```

- Parse and validate `id`
- Return `getPriceHistory(id)`
- Seed initial point on first call if history is empty (use current market price from `getMarket`)

---

**A6. Add market resolve route**

New file: `api/src/routes/resolve.ts`

```typescript
POST /markets/:id/resolve
Body: { outcome: boolean, adminKey: string }
→ { data: { marketId, winningOutcome, status } }
```

- Check `adminKey === process.env.ADMIN_RESOLVE_KEY ?? "demo-admin"` — simple secret, not JWT
- Call `resolveMarket(marketId, outcome)` (from A1)
- Emit SSE `market_resolved` event: `{ marketId, winningOutcome }`
- Return updated market

---

**A7. Add stats route**

New file: `api/src/routes/stats.ts`

```typescript
GET /stats
→ { data: { totalBets: number, totalVolume: string, activeAgents: number, marketsOpen: number } }
```

Track in module-level counters (increment on each `placeBet` in contract.ts DEMO_MODE):
- `totalBets`: increment integer
- `totalVolumeUSDC`: accumulate bigint, serialize to string
- `activeAgents`: count of unique wallet addresses that have bet (store in a Set)
- `marketsOpen`: count DEMO_MARKETS with status === 0

---

**A8. Register new routes in index.ts**

File: `api/src/index.ts`

```typescript
import historyRouter from "./routes/history";
import resolveRouter from "./routes/resolve";
import statsRouter from "./routes/stats";
// ...
app.use(historyRouter);
app.use(resolveRouter);  // POST is gated by adminKey, no x402 needed
app.use(statsRouter);
```

Add `statsRouter` before `paymentMiddleware` (it's a free public endpoint).

---

**A9. Verify**

- `curl .../markets/0/public` → response includes `humanCap`, `statusLabel: "OPEN"`, updated question text
- `curl .../markets/0/price-history` → returns `[]` initially, then points appear after bets
- `curl -X POST .../markets/0/resolve -d '{"outcome":true,"adminKey":"demo-admin"}'` → `{ data: { winningOutcome: true, status: 1 } }`
- `curl .../stats` → returns counts
- SSE stream shows `price_update` and `market_resolved` events

---

### TRACK B — Bet Form + Market Detail Page Fixes

**File ownership:** `frontend/app/market/[id]/page.tsx`, new `frontend/components/BetForm.tsx`

---

**B1. Fix status badge**

File: `frontend/app/market/[id]/page.tsx`

The API now returns `statusLabel` (Track A, step A4). Use it:
- Replace `market.status` with `market.statusLabel` in the badge class and text
- Update the `Market` interface: add `statusLabel: string`, `humanCap: string`
- The badge condition: `market.statusLabel === "OPEN"` → class `market-status-badge--open`, else `--closed` or `--resolved`

---

**B2. Fix CapMeter — wire real cap, show user exposure**

File: `frontend/app/market/[id]/page.tsx`

Current bug: `exposure={market.yesPool}` and `cap="2000000"` (hardcoded $2).

Fix:
- `humanCap` is now in the market response (Track A)
- For DEMO_MODE: show total yesPool vs humanCap — this shows "the pool is X% of the per-human cap" as a market-level stat. Label it "Market YES pool vs per-human cap". `<CapMeter exposure={market.yesPool} cap={market.humanCap} label="YES pool / per-human cap" />`
- Add a second CapMeter instance only when wallet is connected (client-side): user exposure vs cap — this is in `BetForm` (see B3)

---

**B3. Create BetForm component**

New file: `frontend/components/BetForm.tsx`

Props:
```typescript
interface BetFormProps {
  marketId: number;
  apiUrl: string;
  humanCap: string;
  disabled?: boolean;    // true if market not OPEN
}
```

Client component (`"use client"`). State: `outcome: boolean | null`, `amountUSDC: string` (default "1.00"), `preview`, `status: "idle"|"simulating"|"submitting"|"success"|"error"`, `txHash: string | null`

Flow:
1. YES / NO toggle buttons — styled with `--color-yes` (green) / `--color-danger` (red)
2. Amount input (USD, converts to USDC integer: `Math.round(parseFloat(amount) * 1_000_000).toString()`)
3. On outcome or amount change: debounced (300ms) call to `POST /markets/:id/simulate` → display "You'll receive ~X shares" and price impact ("moves market X%")
4. "Place Bet" button: calls `POST /markets/:id/bet` with `{ outcome, amount, wallet }`.
   - Wallet: use `useAccount()` from wagmi. If no wallet connected, use a hardcoded demo address `"0x000000000000000000000000000000000000dE10"` so demo still works without a real wallet.
5. On success: show green flash, tx hash (truncated), "Bet placed!" message
6. On error: show error message
7. Show user's current exposure via `GET /markets/:id/exposure?wallet=...` — add this fetch on mount if wallet is connected. Display as `<CapMeter exposure={userExposure} cap={humanCap} label="Your exposure / cap" />`

Note: `GET /markets/:id/exposure` is not yet in the API. Add a simple note in the component with a TODO and fall back to `"0"` if the fetch fails. Alternatively, use the `humanExposureAfter` value returned from a successful bet to update incrementally.

---

**B4. Add PriceChart + BetForm to market detail page**

File: `frontend/app/market/[id]/page.tsx`

Add these sections between the price grid and the CapMeter:
```tsx
{/* Price history chart */}
<section aria-labelledby="chart-heading">
  <div className="section-header">
    <h2 id="chart-heading" className="section-title">Price history</h2>
  </div>
  <PriceChart marketId={market.id} apiUrl={API_URL} />
</section>

{/* Bet form */}
<section aria-labelledby="bet-heading">
  <div className="section-header">
    <h2 id="bet-heading" className="section-title">Place a bet</h2>
  </div>
  <BetForm
    marketId={market.id}
    apiUrl={API_URL}
    humanCap={market.humanCap}
    disabled={market.statusLabel !== "OPEN"}
  />
</section>
```

Import both components at top of file.
Update `Market` interface to include `humanCap: string` and `statusLabel: string`.

---

**B5. Add resolved market display**

File: `frontend/app/market/[id]/page.tsx`

If `market.statusLabel === "RESOLVED"`:
- Show a banner: "✓ RESOLVED — [YES/NO] wins" styled with `--color-yes` or `--color-danger`
- Replace bet form with "This market has been resolved" message
- Show payout estimate if wallet connected: `(userShares / totalWinningSidePool) * totalPool`

---

**B6. Verify**

- Navigate to `/market/0` → status badge shows "OPEN" (not "0")
- CapMeter shows `$5321 / $10000` (or whatever yesPool / humanCap is)
- BetForm renders with YES/NO buttons; simulate shows price impact; submitting a bet updates the feed
- PriceChart renders (even if empty initially — will populate as bets arrive)

---

### TRACK C — Homepage Live Feed + Stats

**File ownership:** `frontend/app/page.tsx`, new `frontend/components/HomepageFeed.tsx`, new `frontend/components/LiveStatsTicker.tsx`

---

**C1. Create LiveStatsTicker component**

New file: `frontend/components/LiveStatsTicker.tsx`

Client component. Polls `GET /stats` every 5 seconds.

Display (horizontal bar across full width, below the header):
```
◈ Total bets: 1,247  |  Volume: $1,247.00  |  Active agents: 3  |  Markets open: 3
```
Styled with `--color-surface` background, `--color-muted` text, `font-mono`. Numbers pulse/flash on update (CSS transition on `opacity`).

---

**C2. Create HomepageFeed component**

New file: `frontend/components/HomepageFeed.tsx`

Client component. Contains:
1. `<AgentFeed apiUrl={apiUrl} />` — no `marketId` filter (shows all markets)
   - Limit to last 8 entries in this context (pass a `maxEntries={8}` prop — Track E adds that prop)
2. Subheading: "Live activity across all markets"
3. Auto-polls `GET /markets/public` every 10 seconds and passes updated prices to a `PriceRefreshContext` — OR, simpler: just subscribe to SSE `price_update` events to know when to re-fetch. Use `useEffect` with EventSource listening for `price_update`, then call a callback `onPriceUpdate(marketId, price)` provided by the parent.

Actually, keep it simple: `HomepageFeed` just renders `AgentFeed` (all markets) with a compact header. Price refresh is a separate concern.

---

**C3. Add pool distribution bar to market cards**

File: `frontend/app/page.tsx`

In the `market-card` list item, after the odds, add a visual pool distribution bar:
```tsx
<div className="market-card__pool-bar">
  <div
    className="market-card__pool-yes"
    style={{ width: `${(market.price.yes * 100).toFixed(1)}%` }}
    aria-label={`Yes pool: ${(market.price.yes * 100).toFixed(1)}%`}
  />
</div>
```

CSS: thin 4px bar, left half green (`--color-yes`), right half red (`--color-danger`), no gap.

---

**C4. Add LiveStatsTicker + HomepageFeed to homepage**

File: `frontend/app/page.tsx`

- Add `<LiveStatsTicker apiUrl={API_URL} />` immediately after `<header>` (above hero section)
- Add this section after the markets list (before closing `</main>`):
```tsx
<section aria-labelledby="activity-heading">
  <div className="section-header">
    <h2 id="activity-heading" className="section-title">Live activity</h2>
    <span className="section-count font-mono">all markets</span>
  </div>
  <HomepageFeed apiUrl={API_URL} />
</section>
```

---

**C5. Add countdown timer to market cards**

File: `frontend/app/page.tsx`

Replace static `formatDeadline(market.deadline)` with a `<CountdownTimer deadline={market.deadline} />` client component. Create inline in same file or as a tiny new component.

`CountdownTimer`: shows "in 365d 4h" if > 1 day remaining, "in 4h 22m" if < 1 day, "EXPIRED" in red if past deadline. Updates every minute via `setInterval`.

Since `page.tsx` is a server component, `CountdownTimer` must be a separate `"use client"` file: `frontend/components/CountdownTimer.tsx` (Track C owns this new file).

---

**C6. Verify**

- Homepage shows stats ticker (numbers update as agent bets)
- Homepage shows agent feed panel below market list
- Pool distribution bar visible on each market card (green/red proportional bar)
- Countdown shows "in 365d" / "in 184d" etc. for each market

---

### TRACK D — Price History Chart

**File ownership:** new `frontend/components/PriceChart.tsx`, additions to `frontend/app/globals.css`

---

**D1. Define PriceChart component interface**

Interface (must match what Track B imports):
```typescript
interface PriceChartProps {
  marketId: number;
  apiUrl: string;
}
```

**D2. Implement PriceChart**

New file: `frontend/components/PriceChart.tsx`

Client component (`"use client"`).

State:
- `points: { ts: number; yes: number; no: number }[]` — initial fetch from `GET /markets/:id/price-history`
- `status: "loading" | "live" | "error"`

On mount:
1. Fetch `GET /markets/:id/price-history` → populate `points`
2. Open EventSource on `${apiUrl}/stream`; listen for `price_update` events. Filter by `data.marketId === marketId`. Push new point: `{ ts: data.ts, yes: data.price.yes, no: data.price.no }`

Rendering (pure SVG, no charting library):
- SVG viewBox: `0 0 400 120`; responsive via `width="100%"`
- X-axis: time (normalize to 0..400)
- Y-axis: price 0..1 (map to 120..0 pixels)
- YES line: green (`--color-yes` → oklch(65% 0.16 155))
- NO line: red (`--color-danger`)
- Animated: each new point appended causes SVG polyline to re-render (React state update)
- Show current price labels at the right endpoint of each line
- When empty (< 2 points): show "Waiting for price data…" placeholder text
- Striped grid lines at 0.25, 0.5, 0.75 price levels (dashed, `--color-border`)

Performance: cap at 200 points; slice oldest on overflow (matches server-side MAX_POINTS).

---

**D3. Add CSS for chart container**

File: `frontend/app/globals.css`

```css
.price-chart {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: var(--space-4);
  width: 100%;
}
.price-chart__svg { display: block; width: 100%; height: auto; }
.price-chart__empty {
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  padding: var(--space-8);
  text-align: center;
}
```

---

**D4. Verify**

- Load `/market/0` → `<PriceChart>` renders with "Waiting for price data…" initially
- After 10 seconds (2 agent bets): chart shows YES line trending
- Chart lines animate in real-time as agent fires bets
- At 200 points the chart scrolls (oldest dropped)

---

### TRACK E — Multi-Agent System + Feed Display

**File ownership:** `agent/src/strategy.ts`, `agent/src/index.ts`, `agent/src/wallet.ts`, `frontend/components/AgentFeed.tsx`, `frontend/lib/types/events.ts`

---

**E1. Add strategy selector to strategy.ts**

File: `agent/src/strategy.ts`

Add strategies:
```typescript
// momentum: bet on the currently winning side (amplify the trend)
export function momentumStrategy(price: Price): BetDecision {
  if (price.yes > price.no) return { shouldBet: true, outcome: true, confidence: price.yes - 0.5 };
  return { shouldBet: true, outcome: false, confidence: price.no - 0.5 };
}

// random: flip a coin on every tick
export function randomStrategy(_price: Price): BetDecision {
  return { shouldBet: Math.random() > 0.3, outcome: Math.random() > 0.5, confidence: 0.5 };
}

// shill-yes: always bet YES regardless of price
export function shillYesStrategy(_price: Price): BetDecision {
  return { shouldBet: true, outcome: true, confidence: 1 };
}

// shill-no: always bet NO
export function shillNoStrategy(_price: Price): BetDecision {
  return { shouldBet: true, outcome: false, confidence: 1 };
}

const strategyMap: Record<string, (p: Price) => BetDecision> = {
  contrarian: shouldBet,
  momentum: momentumStrategy,
  random: randomStrategy,
  "shill-yes": shillYesStrategy,
  "shill-no": shillNoStrategy,
};

export function getStrategy(): (p: Price) => BetDecision {
  const name = process.env.STRATEGY ?? "contrarian";
  return strategyMap[name] ?? shouldBet;
}
```

---

**E2. Add AGENT_NAME env var to index.ts**

File: `agent/src/index.ts`

- Read `const AGENT_NAME = process.env.AGENT_NAME ?? "Agent-Alpha";`
- Read `const TRADE_ALL_MARKETS = process.env.ALL_MARKETS === "true";`
- In the main loop, if `TRADE_ALL_MARKETS`: iterate all markets returned from `GET /markets`, pick strategy decision for each, bet on each.
- Pass `agentName: AGENT_NAME` in the POST body to `/markets/:id/bet`:
  ```typescript
  body: JSON.stringify({ marketId, outcome, amount: BET_AMOUNT, wallet: walletAddress, agentName: AGENT_NAME }),
  ```
- Use `getStrategy()(price)` instead of the imported `shouldBet` directly
- Add per-agent loop delay jitter: `LOOP_DELAY_MS + Math.random() * 2000` to prevent thundering herd if multiple agents share same Railway process clock

---

**E3. Update event types**

File: `frontend/lib/types/events.ts`

Add `agentName?: string | null` to `BetEventPayload`. Add `PriceUpdatePayload` type:
```typescript
export interface PriceUpdatePayload {
  marketId: number;
  price: { yes: number; no: number };
  yesPool: string;
  noPool: string;
  ts: number;
}
export function isPriceUpdateEvent(v: unknown): v is PriceUpdatePayload { ... }
```

Add `MarketResolvedPayload`:
```typescript
export interface MarketResolvedPayload {
  marketId: number;
  winningOutcome: boolean;
}
export function isMarketResolvedEvent(v: unknown): v is MarketResolvedPayload { ... }
```

---

**E4. Update AgentFeed to display agent name + strategy tag + accept maxEntries prop**

File: `frontend/components/AgentFeed.tsx`

- Add `maxEntries?: number` to props (default 50). Use in `slice(0, maxEntries)` instead of hardcoded 50.
- In the bet entry renderer: if `payload.agentName` is truthy, display it as a tag before the wallet address:
  ```tsx
  {entry.payload.agentName && (
    <span className="agent-feed__agent-tag font-mono">{entry.payload.agentName}</span>
  )}
  ```
  Styled as a small pill with `--color-accent` background, dark text.
- Add handler for `market_resolved` SSE event: push a special entry type `"resolved"` that shows "✓ Market #{id} resolved — YES wins" or NO, in gold color.
- Add `price_update` handler to keep a latest-price map per market (not displayed in feed, but can be used by PriceChart — actually PriceChart subscribes directly, so this is optional; skip if it adds complexity).

---

**E5. Railway config for 2 additional agents**

Add documentation comment block at top of `agent/src/index.ts`:
```
// RAILWAY AGENTS:
// Agent-Alpha: STRATEGY=contrarian, AGENT_NAME=Alpha, ALL_MARKETS=true
// Agent-Beta:  STRATEGY=momentum,   AGENT_NAME=Beta,  ALL_MARKETS=true (separate Railway service, same repo)
// Agent-Gamma: STRATEGY=random,     AGENT_NAME=Gamma, ALL_MARKETS=true (separate Railway service)
// Each service needs its own AGENT_PRIVATE_KEY env var.
```

No new source files required — Railway services are configured via the dashboard (env vars + repo).

---

**E6. Verify**

- Set `STRATEGY=momentum` locally, run agent → bets go on the currently-winning side
- Set `STRATEGY=random` → bets are split YES/NO randomly
- AgentFeed shows `Beta` / `Gamma` tags on entries
- Feed entries for different markets appear in the global feed (ALL_MARKETS)
- `maxEntries={8}` on homepage feed shows compact list

---

---

### TRACK F — XMTP Agent Group Chat

**File ownership:** new `agent/src/xmtpBroadcast.ts`, new `frontend/components/AgentChat.tsx`, new `frontend/app/chat/page.tsx`

**Concept:** Every trading agent broadcasts a human-readable commentary message via XMTP to a shared group conversation whenever it places a bet or hits a cap. A `/chat` page in the frontend subscribes to that XMTP group using the browser SDK and renders the messages as a live chat — _AI agents publicly narrating their market decisions in real time, visible to anyone_. This is the single most visually distinctive feature for a demo audience.

---

**F1. Install XMTP Node SDK in agent**

```bash
cd agent && npm install @xmtp/node-sdk
```

Package adds ~2MB to the agent bundle. Acceptable for Railway deployment.

---

**F2. Create `agent/src/xmtpBroadcast.ts`**

New file: `agent/src/xmtpBroadcast.ts`

```typescript
import { Client, type Signer, IdentifierKind } from "@xmtp/node-sdk";
import { getRandomValues } from "node:crypto";
import { privateKey, walletAddress } from "./wallet";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

// Group conversation ID is fixed — all agents join the same group.
// In DEMO_MODE there is one group per environment; topic is keyed by env var or defaults.
const XMTP_GROUP_ID = process.env.XMTP_GROUP_ID ?? null; // populated after first init
let _client: Client | null = null;
let _groupId: string | null = XMTP_GROUP_ID;

async function getClient(): Promise<Client> {
  if (_client) return _client;

  // Build a Signer from the agent private key
  const account = privateKeyToAccount(privateKey);
  const viemClient = createWalletClient({ account, chain: mainnet, transport: http() });

  const signer: Signer = {
    type: "EOA" as const,
    getIdentifier: () => ({ identifier: walletAddress, identifierKind: IdentifierKind.Ethereum }),
    signMessage: async (msg: string) => {
      const sig = await viemClient.signMessage({ message: msg });
      // Convert hex string to Uint8Array
      const hex = sig.startsWith("0x") ? sig.slice(2) : sig;
      return new Uint8Array(Buffer.from(hex, "hex"));
    },
  };

  const dbEncryptionKey = getRandomValues(new Uint8Array(32));
  _client = await Client.create(signer, { dbEncryptionKey, env: "dev" });
  return _client;
}

async function getOrCreateGroup(client: Client, agentName: string): Promise<string> {
  if (_groupId) return _groupId;

  // Check for existing group with matching metadata in allowed conversations
  await client.conversations.sync();
  const existing = await client.conversations.listGroups();
  const found = existing.find((g) => (g as any).name === "WorldMarket Trading Desk");
  if (found) {
    _groupId = found.id;
    return found.id;
  }

  // Create new group — add only this agent as member initially;
  // other agents create their own clients and join by group ID from env var
  const group = await client.conversations.createGroup([], {
    groupName: "WorldMarket Trading Desk",
    groupDescription: "AI agents broadcasting live trade decisions",
  });
  _groupId = group.id;
  console.log(`[XMTP] Created group ${group.id} — set XMTP_GROUP_ID=${group.id} in Railway`);
  return group.id;
}

export async function broadcastBet(
  agentName: string,
  marketId: number,
  question: string,
  outcome: boolean,
  amountUSDC: string,
  priceBefore: { yes: number; no: number },
  priceAfter: { yes: number; no: number },
  confidence: number
): Promise<void> {
  try {
    const client = await getClient();
    const groupId = await getOrCreateGroup(client, agentName);
    const group = await client.conversations.getConversationById(groupId);
    if (!group) return;

    const side = outcome ? "YES" : "NO";
    const pricePct = outcome
      ? (priceAfter.yes * 100).toFixed(1)
      : (priceAfter.no * 100).toFixed(1);
    const priceDelta = outcome
      ? ((priceAfter.yes - priceBefore.yes) * 100).toFixed(1)
      : ((priceAfter.no - priceBefore.no) * 100).toFixed(1);
    const sign = parseFloat(priceDelta) >= 0 ? "+" : "";
    const amt = (Number(amountUSDC) / 1_000_000).toFixed(2);

    const msg = [
      `[${agentName}] MKT-${String(marketId).padStart(4, "0")} ${side} $${amt}`,
      `"${question.slice(0, 60)}${question.length > 60 ? "…" : ""}"`,
      `Price: ${pricePct}¢ (${sign}${priceDelta}¢) · Confidence: ${(confidence * 100).toFixed(0)}%`,
    ].join("\n");

    await (group as any).sendText(msg);
  } catch (err) {
    // Non-fatal — XMTP broadcast failure should never crash the agent
    console.warn(`[XMTP] broadcast failed: ${err}`);
  }
}

export async function broadcastCapHit(
  agentName: string,
  marketId: number
): Promise<void> {
  try {
    const client = await getClient();
    const groupId = await getOrCreateGroup(client, agentName);
    const group = await client.conversations.getConversationById(groupId);
    if (!group) return;
    await (group as any).sendText(
      `[${agentName}] 🛑 Hit human cap on MKT-${String(marketId).padStart(4, "0")} — no more bets until cap resets`
    );
  } catch (err) {
    console.warn(`[XMTP] cap hit broadcast failed: ${err}`);
  }
}
```

Key notes:
- `env: "dev"` uses the XMTP dev network (free, no mainnet needed)
- `getRandomValues` creates a fresh in-memory encryption key per restart — this means message history is per-session only, which is fine for a demo
- All failures are caught and warned, never thrown — agent bets continue even if XMTP is down
- `XMTP_GROUP_ID` env var: first agent to start creates the group and logs the ID; set it in Railway for all agents so they join the same group instead of creating new ones

---

**F3. Track E integration instruction**

Track E adds to `agent/src/index.ts` (in the post-bet success block, after `emitEvent`):

```typescript
import { broadcastBet, broadcastCapHit } from "./xmtpBroadcast";

// After successful bet:
await broadcastBet(
  AGENT_NAME, marketId, markets[0].question /* or market question */,
  outcome, BET_AMOUNT, priceBefore, priceAfter, decision.confidence
);

// In the cap_hit branch:
await broadcastCapHit(AGENT_NAME, marketId);
```

Wrap both in `if (process.env.XMTP_ENABLED === "true")` guard so XMTP is opt-in and won't break existing agent behavior if env var is absent.

---

**F4. Install XMTP Browser SDK in frontend**

```bash
cd frontend && npm install @xmtp/browser-sdk
```

---

**F5. Create `frontend/components/AgentChat.tsx`**

New file: `frontend/components/AgentChat.tsx`

Client component (`"use client"`).

Props:
```typescript
interface AgentChatProps {
  groupId: string;    // XMTP group conversation ID
  agentAddresses: string[];  // known agent wallet addresses to display even without wallet
}
```

State:
- `messages: { sender: string; content: string; ts: Date }[]`
- `status: "connecting" | "live" | "error" | "no-group"`

On mount (XMTP demo read-only mode — no wallet needed for reading if group is public):
1. Create a read-only XMTP client using an ephemeral key (generate fresh on mount):
   ```typescript
   const tmpKey = crypto.getRandomValues(new Uint8Array(32));
   // Use a known demo address as identifier just to init the client
   const client = await Client.create(ephemeralSigner, { env: "dev" });
   ```
2. Fetch the group by `groupId`: `client.conversations.getConversationById(groupId)`
3. Load recent messages: `group.messages({ limit: 50 })`
4. Stream new messages: `group.stream(...)` via `for await` in a `useEffect`
5. Render as chat bubbles with agent name parsed from message prefix `[AgentName]`

Rendering:
- Dark chat panel, similar design to `AgentFeed` but styled as a chat
- Each message is a chat bubble:
  - Header: agent name tag (colored pill, color keyed by name: Alpha=blue, Beta=purple, Gamma=orange)
  - Body: the 3-line trade message
  - Timestamp: relative ("2s ago", "1m ago")
- Status indicator: `● LIVE` / `○ CONNECTING` matching AgentFeed style
- Auto-scroll to bottom on new message
- Empty state: "Agents are warming up…"

**Fallback:** If `groupId` is empty string (XMTP_GROUP_ID not configured), render:
```tsx
<div className="agent-chat__offline">
  XMTP not configured — set XMTP_GROUP_ID and XMTP_ENABLED=true on agents
</div>
```
This prevents a visible error in an unset environment.

---

**F6. Create `frontend/app/chat/page.tsx`**

New file: `frontend/app/chat/page.tsx`

Server component. Reads `NEXT_PUBLIC_XMTP_GROUP_ID` and `NEXT_PUBLIC_AGENT_ADDRESSES` from env:

```tsx
const groupId = process.env.NEXT_PUBLIC_XMTP_GROUP_ID ?? "";
const agentAddresses = (process.env.NEXT_PUBLIC_AGENT_ADDRESSES ?? "").split(",").filter(Boolean);
```

Page layout:
- Header with ← back link and `WorldMarket` brand (same pattern as other pages)
- `<h1>Agent Trading Desk</h1>`
- Subheading: "Live XMTP messages from AI agents explaining their trades"
- `<AgentChat groupId={groupId} agentAddresses={agentAddresses} />`
- Small explainer footer: "Messages sent over XMTP — decentralized, end-to-end encrypted, quantum-resistant"

---

**F7. Add "Trading Desk" link to navigation**

Track F does NOT modify `page.tsx` or `market/[id]/page.tsx` (owned by other tracks). Instead:
- Document as a note that Track C (homepage) and Track B (market detail) should add:
  ```tsx
  <Link href="/chat" className="nav-link">Agent Chat</Link>
  ```
  to the site header nav alongside the existing "Register" link.
- This is a 1-line addition in each file; each track adds it to the files they already own.

---

**F8. Add CSS for AgentChat**

File: `frontend/app/globals.css`

_Track D already owns `globals.css` for chart styles. Track F adds to it — coordinate by having Track F append at the end of the file. No conflict as long as Track D's additions are in a clearly labeled block and Track F appends after._

```css
/* ─── Agent Chat ─────────────────────────────────────────────────────────── */
.agent-chat {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  height: 480px;
  overflow: hidden;
}
.agent-chat__header {
  align-items: center;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
}
.agent-chat__messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.agent-chat__bubble {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: var(--space-3);
}
.agent-chat__bubble-header {
  align-items: center;
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}
.agent-chat__agent-tag {
  background: var(--color-accent);
  border-radius: 4px;
  color: oklch(10% 0.02 250);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  padding: 1px 6px;
}
.agent-chat__agent-tag--beta  { background: oklch(65% 0.19 300); }  /* purple */
.agent-chat__agent-tag--gamma { background: oklch(65% 0.19 50);  }  /* orange */
.agent-chat__bubble-time {
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  margin-left: auto;
}
.agent-chat__bubble-body {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  white-space: pre-wrap;
  line-height: 1.5;
}
.agent-chat__offline {
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  padding: var(--space-8);
  text-align: center;
}
```

---

**F9. Railway env vars for XMTP**

| Service | Var | Value |
|---|---|---|
| Agent Alpha | `XMTP_ENABLED` | `true` |
| Agent Alpha | `XMTP_GROUP_ID` | _(empty on first deploy; copy logged ID after first startup)_ |
| Agent Beta | `XMTP_ENABLED` | `true` |
| Agent Beta | `XMTP_GROUP_ID` | _(same as Alpha after creation)_ |
| Agent Gamma | `XMTP_ENABLED` | `true` |
| Agent Gamma | `XMTP_GROUP_ID` | _(same)_ |
| Frontend | `NEXT_PUBLIC_XMTP_GROUP_ID` | _(same group ID)_ |
| Frontend | `NEXT_PUBLIC_AGENT_ADDRESSES` | `0xAlpha,0xBeta,0xGamma` (comma-separated) |

Bootstrap procedure:
1. Deploy Agent Alpha with `XMTP_ENABLED=true`, `XMTP_GROUP_ID` unset
2. Check Alpha Railway logs → copy the logged group ID
3. Set `XMTP_GROUP_ID` on Beta, Gamma, and `NEXT_PUBLIC_XMTP_GROUP_ID` on frontend
4. Redeploy all services

---

**F10. Verify**

- Agent Alpha logs show `[XMTP] Created group 0x...`
- After setting group ID and redeploying, Agent Beta logs show it joined an existing group
- Navigate to `/chat` → shows "Agents are warming up…" for ~10 seconds then messages appear
- As agents bet, messages like `[Alpha] MKT-0000 YES $1.00` appear in real-time
- Multiple agents show different colored name tags
- Visiting `/chat` without a wallet works (ephemeral signer for read-only)

---

## Final Integration Verification

After all 5 tracks merge:

| Test | Expected result |
|---|---|
| `GET /markets/0/public` | `statusLabel: "OPEN"`, `humanCap: "10000000000"`, updated question |
| `GET /markets/0/price-history` | Points accumulate after bets |
| `POST /markets/0/resolve {"outcome":true,"adminKey":"demo-admin"}` | Status becomes RESOLVED; SSE emits `market_resolved` |
| `GET /stats` | Returns bet count + volume |
| `/market/0` status badge | Shows "OPEN" |
| `/market/0` CapMeter | Shows pool vs $10,000 cap (not $2) |
| `/market/0` BetForm | YES/NO toggle, simulate preview, submit bet → entry appears in feed |
| `/market/0` PriceChart | Sparkline animates live |
| Homepage | Stats ticker visible; agent feed panel below markets |
| Homepage market cards | Pool distribution bar; countdown timers |
| AgentFeed | Shows `Alpha`, `Beta`, `Gamma` agent name tags |
| 3 agents active | All 3 feed into all markets; prices on market 1 and 2 also move |
| `/chat` page | Agent chat panel loads, shows incoming XMTP messages from all 3 agents |
| Agent XMTP messages | `[Alpha] MKT-0000 YES $1.00 \n "Will BTC exceed..." \n Price: 38.2¢ (+2.2¢) · Confidence: 14%` |

---

## Deployment Order

Tracks can be deployed independently (Railway auto-deploys on push per service). Recommended merge order to avoid visible breakage:
1. **Track A** first (API changes are additive; old frontend still works)
2. **Track E** agent changes (new fields in SSE payload are backwards-compatible)
3. **Track D** PriceChart component (new file, zero breakage)
4. **Track B + Track C** simultaneously (separate pages/components, both depend on Track A's new fields)

---

## Extra Polish Ideas (Bonus — assign as follow-up)

- Bet confirmation toast (`react-hot-toast` or hand-rolled) when agent bet arrives while you're on that market page
- "Share this market" button → copies URL to clipboard with `navigator.clipboard`
- Admin panel page at `/admin` (password protected with the `ADMIN_RESOLVE_KEY`) with resolve buttons for each market
- Market resolution confetti animation on the resolved banner (CSS keyframes, no lib needed)
- Mobile responsive layout fixes (the price grid and feed don't collapse cleanly on 375px)
- Dark/light theme toggle button in header (CSS variable swap, toggle `data-theme` on `<html>`)
- Favicon and OG image tags in `layout.tsx`

---

## Railway Env Vars to Set Before Demo

| Service | Var | Value |
|---|---|---|
| API | `ADMIN_RESOLVE_KEY` | `demo-admin` (or custom) |
| Agent Beta (new service) | `STRATEGY` | `momentum` |
| Agent Beta | `AGENT_NAME` | `Beta` |
| Agent Beta | `ALL_MARKETS` | `true` |
| Agent Beta | `AGENT_PRIVATE_KEY` | new throwaway key |
| Agent Gamma (new service) | `STRATEGY` | `random` |
| Agent Gamma | `AGENT_NAME` | `Gamma` |
| Agent Gamma | `ALL_MARKETS` | `true` |
| Agent Gamma | `AGENT_PRIVATE_KEY` | new throwaway key |
| Agent Alpha (existing) | `AGENT_NAME` | `Alpha` |
| Agent Alpha | `ALL_MARKETS` | `true` |
| Frontend | `NEXT_PUBLIC_WLD_APP_ID` | Leave unset; Register page gracefully degrades |

# Agent Battle View Redesign
_Generated March 29, 2026_

---

## Goal

Redesign `frontend/app/agents/page.tsx` from a generic rounded-card AI dashboard into a financial terminal aesthetic with meaningful per-trade volume bars, per-market dual-panel price+volume charts, and a two-column layout that stops looking AI-generated.

---

## Constraints

- No new npm packages for charts — pure SVG, same pattern as existing `PriceSparkline`
- No new npm packages for fonts — use `@fontsource/*` pattern already in `layout.tsx`; add with `npm install`
- Tailwind v4 (`@theme`) — extend `globals.css` only; never write raw Tailwind utilities
- Next.js 15 App Router; `frontend/app/agents/page.tsx` stays `"use client"`
- DEMO_MODE=true on all Railway services — no API contract changes required
- All animation: `transform` + `opacity` only. Exception: existing `pool-bar__fill` `width` transition is acceptable (26px bar, no layout shift), keep as-is
- Do NOT add glassmorphism, glow effects, or `backdrop-filter`
- Do NOT change `border-radius` on non-battle components (register, market-detail, etc.)

---

## Unknowns / Risks

- **Font package availability**: `@fontsource/space-grotesk` exists on npm. Variable weight variant (`@fontsource-variable/space-grotesk`) also exists; preferable. Confirm before install.
- **`@fontsource/jetbrains-mono`**: exists on npm as `@fontsource/jetbrains-mono`. Verify weight 400/500/600 subsets are individually importable (`/400.css`, `/500.css`, `/600.css` pattern) matching existing IBM Plex Mono import style.
- **Two-column layout + sticky sidebar**: `.battle-side` must be `position: sticky; top: [header-height]` with `max-height: calc(100dvh - header-height)`. Header height is currently `~61px` (padding + line-height of `.site-header`). Verify exact value before implementing or use CSS custom property `--header-h: 61px`.
- **VolumeSparkline data density**: Per-agent bets-per-minute requires timestamps alongside `recentBets`. Currently `recentBets: boolean[]` has no timestamps. Must add `betTimestamps: number[]` to `AgentStats`. If Railway streams bets slowly (1 agent, 5s loop = 12/min), bars will have sparse data. Visually acceptable — show 0-height bars for empty minutes.
- **Per-market volume buckets from feed**: Volume bars derived from in-memory `feed` state (max 60 entries). On fresh page load, bars start empty with "insufficient data" affordance. After ~2 minutes of activity, bars fill meaningfully. Acceptable for demo.
- **Color token scope**: Changing `--color-accent` in `@theme` affects every accent usage sitewide (site nav `◈` mark, buttons, links, cap-meter fill, etc.). Inspect all accent usages before committing to amber; if amber looks wrong on the homepage, scope the token override to `.battle-page` via CSS custom property re-definition.
- **`@fontsource-variable/plus-jakarta-sans` removal**: `layout.tsx` imports this globally. Removing it changes typography on ALL pages (homepage, market detail, register). Decision: do NOT remove — add new fonts and scope `--font-sans`/`--font-mono` override inside `.battle-page` only to avoid regressing other pages.

---

## Design Direction

**Trading Floor Terminal** — interface reads as a specialized financial data terminal built by engineers who prioritize information density. Reference aesthetic: Refinitiv Eikon, Bloomberg terminal data density, not a consumer DeFi app.

### Do/Don't applied to this codebase

| Current (anti-pattern) | Fix |
|---|---|
| `border-radius: 10px–12px` on `.leaderboard-row`, `.market-panel`, `.battle-arena-header`, `.pool-bar`, `.agent-card` | `border-radius: 0` on all battle surfaces |
| `border-left: 3px solid var(--agent-color)` on leaderboard rows | Remove; agent color visible in name text only |
| `--color-accent: oklch(65% 0.19 243)` (electric blue on dark) scoped to battle | Override to `oklch(82% 0.16 80)` (amber) inside `.battle-page` |
| `BetSparkline` = colored dots (decorative, not data-meaningful) | Replace with `VolumeSparkline` — bar chart of bets per minute |
| `PriceSparkline` is 120×36px with no volume axis | Replace with `DualChart` — price line top panel + volume bars bottom panel |
| Feed rows: pill badges with `border-radius: 4px`, same visual weight | Hairline-separated rows, inline `TradeVolBar`, opacity fades with age |
| Stacked single-column page layout | Two-column grid: agent sidebar (340px) | right main area |
| `.battle-section-title` font-size `1.25rem` bold (SaaS heading style) | Uppercase `0.6rem` letter-spaced label, text-transform uppercase |
| Font: Plus Jakarta Sans + IBM Plex Mono (neutral "startup" defaults) | Space Grotesk + JetBrains Mono (scoped to `.battle-page`) |

---

## Steps

### S1 — Install new fonts

**Command** (run once):
```bash
cd frontend && npm install @fontsource-variable/space-grotesk @fontsource/jetbrains-mono
```

No files changed yet. Verify install succeeded before S2.

---

### S2 — Import fonts in layout.tsx

**File**: `frontend/app/layout.tsx`

Add two imports after the existing font imports:
```typescript
import "@fontsource-variable/space-grotesk";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
```

Do NOT remove existing `@fontsource-variable/plus-jakarta-sans` or `@fontsource/ibm-plex-mono` imports — other pages depend on them.

---

### S3 — Scope font tokens to `.battle-page`

**File**: `frontend/app/globals.css`

Add a CSS block AFTER the existing `@theme` section (do not modify `@theme`):

```css
/* Battle-page font override — scoped so other pages are unaffected */
.battle-page {
  --font-sans: "Space Grotesk Variable", "Space Grotesk", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "Courier New", monospace;
}
```

Scoping ensures homepage, register, market detail keep Plus Jakarta Sans + IBM Plex Mono.

---

### S4 — Scope color token overrides to `.battle-page`

**File**: `frontend/app/globals.css`

Add inside the same battle-page scoping block (extend S3's block):

```css
.battle-page {
  /* ... fonts from S3 ... */

  /* Amber accent replaces electric blue — scoped to battle only */
  --color-accent:  oklch(82% 0.16 80);     /* amber/saffron — institutional signal color */
  --color-bg:      oklch(9%  0.012 60);    /* warm charcoal — terminal screen, not cold dark */
  --color-surface: oklch(12% 0.013 60);
  --color-text:    oklch(91% 0.012 80);    /* warm phosphor white */
  --color-muted:   oklch(46% 0.010 60);
  --color-border:  oklch(19% 0.013 60);
  --color-yes:     oklch(70% 0.22 145);    /* brighter emerald (unchanged hue, higher chroma) */
}
```

**Note**: `.battle-page` is the root `<main>` element. All children inherit these tokens via cascade. The `<header>` and `<body>` background stay at global values — the battle page background override applies inside `<main>` only, which is the entire visible area below the header.

---

### S5 — Remove border-radius from all battle surfaces

**File**: `frontend/app/globals.css`

For each of these classes, set `border-radius: 0`:

| Class | Current value | New value |
|---|---|---|
| `.battle-arena-header` | `border-radius: 10px` | `border-radius: 0` |
| `.leaderboard-row` | `border-radius: 10px` | `border-radius: 0` |
| `.market-panel` | `border-radius: 10px` | `border-radius: 0` |
| `.pool-bar` | `border-radius: 6px` | `border-radius: 0` |
| `.pool-bar__fill` | `border-radius: 6px` | `border-radius: 0` |
| `.agent-card` | `border-radius: 12px` | `border-radius: 0` (unused after S9 but clean up) |
| `.battle-status` | `border-radius: 9999px` | `border-radius: 0` |
| `.battle-feed__count` | `border-radius: 9999px` | `border-radius: 0` |

Also update `.pool-bar` height from `26px` → `20px` (thinner = more precise look).

---

### S6 — Remove lazy left-border accent from leaderboard rows

**File**: `frontend/app/globals.css`

In `.leaderboard-row`, remove:
```css
border-left: 3px solid var(--agent-color, var(--color-border));
transition: border-left-color 300ms;
```

Replace with: no left border. Agent color is visible only in `.leaderboard-row__name` text. This eliminates the "rounded rectangle with one colored side" anti-pattern.

---

### S7 — Two-column grid layout for .battle-page

**File**: `frontend/app/globals.css`

Replace `.battle-page` layout:

```css
.battle-page {
  max-width: 1280px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 340px 1fr;
  grid-template-rows: auto 1fr;
  grid-template-areas:
    "arena arena"
    "side  main";
  min-height: calc(100dvh - 61px); /* 61px = .site-header height */
  /* remove: padding, flex, gap */
}

.battle-arena-header { grid-area: arena; }

.battle-side {
  grid-area: side;
  border-right: 1px solid var(--color-border);
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  position: sticky;
  top: 61px;
  max-height: calc(100dvh - 61px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.battle-main {
  grid-area: main;
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  overflow: hidden;
}

@media (max-width: 900px) {
  .battle-page {
    grid-template-columns: 1fr;
    grid-template-areas:
      "arena"
      "side"
      "main";
  }
  .battle-side {
    border-right: none;
    border-bottom: 1px solid var(--color-border);
    position: static;
    max-height: none;
    overflow-y: visible;
  }
}
```

---

### S8 — Update JSX layout structure

**File**: `frontend/app/agents/page.tsx`

In the `return` block, wrap sections in the two new containers:

```tsx
<main className="battle-page">
  {/* arena header — grid-area: arena (no wrapper needed, directly child) */}
  <div className="battle-arena-header"> … </div>

  {/* sidebar — grid-area: side */}
  <aside className="battle-side">
    <div className="battle-header"> … </div>          {/* title + status + stats bar */}
    <section className="agent-leaderboard"> … </section>
  </aside>

  {/* main content — grid-area: main */}
  <div className="battle-main">
    <section className="battle-markets"> … </section>
    <section className="battle-feed"> … </section>
  </div>
</main>
```

---

### S9 — Leaderboard table redesign

**File**: `frontend/app/globals.css`

Rewrite `.agent-leaderboard` + `.leaderboard-row` to a flat table style:

```css
.agent-leaderboard {
  display: flex;
  flex-direction: column;
  /* remove: gap: 3px */
}

.leaderboard-row {
  display: grid;
  grid-template-columns: 24px 1fr 60px;  /* rank | identity+stats | vol-sparkline */
  align-items: start;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  background: transparent;        /* remove card background */
  border: none;                   /* remove card border */
  border-bottom: 1px solid var(--color-border);
  border-radius: 0;               /* already done in S5, explicit here */
  /* remove: border-left accent */
}
.leaderboard-row:last-child { border-bottom: none; }
.leaderboard-row:hover { background: color-mix(in oklch, var(--color-surface) 70%, transparent); }
.leaderboard-row[data-pulse="true"] { animation: agent-pulse-ring 1.1s ease-out forwards; }

/* Collapse identity + stats into a single stacked cell */
.leaderboard-row__identity {
  /* name row: emoji + name */
  /* stats row: bets · vol · YES% (move stats here from separate column) */
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Remove separate stats column — stats now live under identity */
.leaderboard-row__stats {
  font-size: var(--text-xs);  /* down from text-sm */
  gap: var(--space-2);
}
.leaderboard-row__bets { font-weight: 600; }

/* Remove last-bet column on the leaderboard sidebar (space constraint) */
.leaderboard-row__last { display: none; }
```

**Data change**: Stats (bets, vol, YES%) move from the third `grid-template-columns` slot into `.leaderboard-row__identity` as a second row, freeing the third column for the volume sparkline.

Update JSX accordingly: move `<div className="leaderboard-row__stats">…</div>` inside `.leaderboard-row__identity` div.

---

### S10 — Replace .battle-section-title style

**File**: `frontend/app/globals.css`

```css
.battle-section-title {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-muted);
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  /* remove: font-size var(--text-xl), font-weight 600, letter-spacing -0.01em */
}
```

---

### S11 — New component: VolumeSparkline (per-agent activity bars)

**File**: `frontend/app/agents/page.tsx`

**S11.1 — Add `betTimestamps` to AgentStats interface**:
```typescript
interface AgentStats {
  // ... existing fields ...
  betTimestamps: number[];     // unix ms, most recent last, max 120 items
}
```

Initialize `betTimestamps: []` in the default stats object inside the SSE `bet` handler.

Populate in the same handler:
```typescript
betTimestamps: [...existing.betTimestamps, Date.now()].slice(-120),
```

**S11.2 — Add VolumeSparkline component**:

```tsx
function VolumeSparkline({
  timestamps,
  color = "var(--color-accent)",
  width = 60,
  height = 24,
  buckets = 10,
}: {
  timestamps: number[];
  color?: string;
  width?: number;
  height?: number;
  buckets?: number;
}) {
  const now = Date.now();
  const windowMs = buckets * 60_000;  // 10 minutes
  const bucketMs = 60_000;            // 1 minute per bar

  // Build bucket array: [oldest … newest]
  const counts = Array.from({ length: buckets }, (_, i) => {
    const bucketStart = now - windowMs + i * bucketMs;
    const bucketEnd   = bucketStart + bucketMs;
    return timestamps.filter((t) => t >= bucketStart && t < bucketEnd).length;
  });

  const maxCount = Math.max(...counts, 1);
  const barW = (width - (buckets - 1)) / buckets;  // 1px gap
  const pad = 1;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {counts.map((c, i) => {
        const barH = Math.max(c / maxCount * (height - pad * 2), c > 0 ? 2 : 0);
        const x = i * (barW + 1);
        const y = height - pad - barH;
        return (
          <rect
            key={i}
            x={x.toFixed(1)}
            y={y.toFixed(1)}
            width={barW.toFixed(1)}
            height={barH.toFixed(1)}
            fill={color}
            opacity={0.5 + 0.5 * (i / (buckets - 1))}  // older bars dimmer
          />
        );
      })}
    </svg>
  );
}
```

**S11.3 — Replace BetSparkline with VolumeSparkline in leaderboard rows**:

In the leaderboard row JSX, replace:
```tsx
<div className="leaderboard-row__sparkline">
  <BetSparkline bets={stats?.recentBets ?? []} />
</div>
```
With:
```tsx
<div className="leaderboard-row__sparkline">
  <VolumeSparkline
    timestamps={stats?.betTimestamps ?? []}
    color={meta.color}
    width={60}
    height={24}
  />
</div>
```

`BetSparkline` component can be deleted (or kept if used elsewhere — grep first).

---

### S12 — New component: DualChart (per-market price + volume)

**File**: `frontend/app/agents/page.tsx`

**S12.1 — Add `getMarketVolumeBuckets` helper**:

```typescript
function getMarketVolumeBuckets(
  feed: FeedEntry[],
  marketId: number,
  buckets: number = 10
): Array<{ yesVol: number; noVol: number }> {
  const now = Date.now();
  const bucketMs = 60_000;
  const windowMs = buckets * bucketMs;

  const filtered = feed.filter((e) => e.marketId === marketId && now - e.ts < windowMs);

  return Array.from({ length: buckets }, (_, i) => {
    const bucketStart = now - windowMs + i * bucketMs;
    const bucketEnd   = bucketStart + bucketMs;
    const inBucket    = filtered.filter((e) => e.ts >= bucketStart && e.ts < bucketEnd);
    return {
      yesVol: inBucket.filter((e) => e.outcome).reduce((s, e) => s + Number(e.amount), 0),
      noVol:  inBucket.filter((e) => !e.outcome).reduce((s, e) => s + Number(e.amount), 0),
    };
  });
}
```

**S12.2 — Add DualChart component**:

```tsx
function DualChart({
  history,
  volumeBuckets,
  width = 300,
}: {
  history: PricePoint[];
  volumeBuckets: Array<{ yesVol: number; noVol: number }>;
  width?: number;
}) {
  const HEIGHT       = 80;
  const PRICE_H      = 50;   // top panel: price line
  const SEP_Y        = PRICE_H + 1;
  const VOL_TOP      = SEP_Y + 2;
  const VOL_H        = HEIGHT - VOL_TOP - 2;  // ~25px
  const PAD          = 2;
  const buckets      = volumeBuckets.length;
  const barW         = (width - (buckets - 1)) / buckets;

  // Price line
  const yesValues    = history.map((p) => p.yes);
  const pricePoints  = (() => {
    if (history.length < 2) return null;
    const minV = Math.min(...yesValues);
    const maxV = Math.max(...yesValues);
    const range = maxV - minV || 0.01;
    return history.map((p, i) => {
      const x = PAD + (i / (history.length - 1)) * (width - PAD * 2);
      const y = PAD + (1 - (p.yes - minV) / range) * (PRICE_H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  })();

  const lastYes      = yesValues.length > 0 ? yesValues[yesValues.length - 1] : 0.5;
  const lineColor    = lastYes >= 0.5 ? "var(--color-yes)" : "var(--color-danger)";

  // Volume bars
  const maxVol = Math.max(...volumeBuckets.map((b) => b.yesVol + b.noVol), 1);

  return (
    <svg
      width={width}
      height={HEIGHT}
      viewBox={`0 0 ${width} ${HEIGHT}`}
      style={{ display: "block" }}
    >
      {/* Price panel */}
      {pricePoints ? (
        <>
          <polyline
            points={pricePoints}
            fill="none"
            stroke={lineColor}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          {/* Current YES% label on right */}
          <text
            x={width - 2}
            y={PAD + 8}
            textAnchor="end"
            fontSize="7"
            fill="var(--color-muted)"
            fontFamily="var(--font-mono)"
          >
            {Math.round(lastYes * 100)}%
          </text>
        </>
      ) : (
        <text
          x={width / 2}
          y={PRICE_H / 2 + 4}
          textAnchor="middle"
          fontSize="8"
          fill="var(--color-muted)"
          fontFamily="var(--font-mono)"
        >
          warming up…
        </text>
      )}

      {/* Separator */}
      <line
        x1={0}
        y1={SEP_Y}
        x2={width}
        y2={SEP_Y}
        stroke="var(--color-border)"
        strokeWidth="1"
      />

      {/* Volume bars */}
      {volumeBuckets.map((b, i) => {
        const totalH   = ((b.yesVol + b.noVol) / maxVol) * (VOL_H - 2);
        const yesH     = totalH > 0 ? (b.yesVol / (b.yesVol + b.noVol)) * totalH : 0;
        const noH      = totalH - yesH;
        const x        = i * (barW + 1);
        const baseY    = HEIGHT - 2;  // bottom of volume area
        const opacity  = 0.45 + 0.55 * (i / (buckets - 1));  // older = dimmer
        return (
          <g key={i} opacity={opacity}>
            {/* YES volume (bottom of stack, green) */}
            {yesH > 0 && (
              <rect
                x={x.toFixed(1)}
                y={(baseY - yesH).toFixed(1)}
                width={barW.toFixed(1)}
                height={yesH.toFixed(1)}
                fill="var(--color-yes)"
                opacity={0.7}
              />
            )}
            {/* NO volume (stacked above YES, red) */}
            {noH > 0 && (
              <rect
                x={x.toFixed(1)}
                y={(baseY - yesH - noH).toFixed(1)}
                width={barW.toFixed(1)}
                height={noH.toFixed(1)}
                fill="var(--color-danger)"
                opacity={0.7}
              />
            )}
          </g>
        );
      })}

      {/* Volume label */}
      <text
        x={width - 2}
        y={HEIGHT - 3}
        textAnchor="end"
        fontSize="6"
        fill="var(--color-muted)"
        fontFamily="var(--font-mono)"
      >
        VOL
      </text>
    </svg>
  );
}
```

**S12.3 — Wire DualChart into market panels**:

In the market panel JSX, replace:
```tsx
<div className="market-panel__sparkline">
  <PriceSparkline history={history} width={120} height={36} />
</div>
```
With:
```tsx
<div className="market-panel__chart">
  <DualChart
    history={history}
    volumeBuckets={getMarketVolumeBuckets(feed, m.id)}
    width={280}
  />
</div>
```

**S12.4 — CSS for `.market-panel__chart`**:

In `globals.css`, add:
```css
.market-panel__chart {
  grid-column: 2;
  grid-row: 1 / 3;
  align-self: center;
}
```

Update `.market-panel` grid:
```css
.market-panel {
  grid-template-columns: 1fr 290px;  /* was 130px */
}
```

`PriceSparkline` component can remain (used elsewhere or retain for future).

---

### S13 — New component: TradeVolBar (per-trade size indicator in feed)

**File**: `frontend/app/agents/page.tsx`

**S13.1 — Add `getMedianAmount` helper**:

```typescript
function getMedianAmount(feed: FeedEntry[]): number {
  const amounts = feed.slice(0, 20).map((e) => Number(e.amount)).filter((n) => n > 0);
  if (amounts.length === 0) return 1_000_000;  // fallback: $1
  const sorted = [...amounts].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
```

**S13.2 — Add TradeVolBar component**:

```tsx
function TradeVolBar({
  amount,
  median,
  outcome,
}: {
  amount: string;
  median: number;
  outcome: boolean;
}) {
  const normalized = Math.min(Number(amount) / median, 3);  // cap at 3× median
  const height     = Math.max(Math.round(normalized * 16), 2);  // min 2px, max 48px
  return (
    <svg width={6} height={20} viewBox="0 0 6 20" style={{ display: "block", alignSelf: "center" }}>
      <rect
        x={0}
        y={20 - height}
        width={6}
        height={height}
        fill={outcome ? "var(--color-yes)" : "var(--color-danger)"}
        opacity={0.75}
      />
    </svg>
  );
}
```

**S13.3 — Add to feed rows**:

At the top of the feed-rendering block, compute median once:
```tsx
const medianAmount = getMedianAmount(feed);
```

In each `feed-row`, add `<TradeVolBar>` between `feed-row__amount` and `feed-row__market-chip`:
```tsx
<TradeVolBar amount={entry.amount} median={medianAmount} outcome={entry.outcome} />
```

**S13.4 — Update `.feed-row` grid column**:

In `globals.css`:
```css
.feed-row {
  grid-template-columns: 72px 130px 36px 56px 8px 28px 1fr;
  /* was:                 80px 160px 44px 64px     28px 1fr */
  padding: var(--space-2) 0;    /* remove side padding: hairline rows, no container padding */
  border-radius: 0;
  border-bottom: 1px solid color-mix(in oklch, var(--color-border) 40%, transparent);
}
.feed-row:first-child {
  background: transparent;    /* remove special first-row highlight */
  border: none;
  border-bottom: 1px solid var(--color-border);
}
.feed-row:hover { background: color-mix(in oklch, var(--color-surface) 60%, transparent); }

/* Wrap feed in a container so hairlines sit flush */
.battle-feed__list {
  padding: 0;
  /* remove: gap: 2px */
  gap: 0;
}
```

---

### S14 — Feed age-opacity effect

**File**: `frontend/app/agents/page.tsx`

In the feed-row rendering map, add inline opacity decreasing with index:

```tsx
feed.map((entry, index) => (
  <div
    key={entry.id}
    className={`feed-row${entry.id === newFeedId ? " feed-row--new" : ""}`}
    style={{ opacity: Math.max(0.35, 1 - index * 0.045) }}
  >
```

Newest entry = `opacity: 1.0`. Entry ~14 = `opacity: 0.37`. Entry 15+ = floored at `0.35`.

---

### S15 — Feed header rename + section label style

**File**: `frontend/app/agents/page.tsx`

Change "Live Feed" heading text to "TRADE TAPE".

**File**: `frontend/app/globals.css`

Rename `.battle-feed` section title inline with S10 style (already handled by `.battle-section-title` update in S10).

---

### S16 — Arena header: full-bleed bar with market price row

**File**: `frontend/app/globals.css`

```css
.battle-arena-header {
  border: none;
  border-bottom: 1px solid var(--color-border);
  border-radius: 0;                 /* remove rounded container */
  background: var(--color-bg);      /* true bg, not surface */
  overflow: hidden;
}

/* Market price ticker row — new, below existing arena-ticker-row */
.arena-market-prices {
  display: flex;
  gap: var(--space-6);
  padding: var(--space-1) var(--space-6);
  border-top: 1px solid var(--color-border);
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  overflow-x: auto;
  scrollbar-width: none;
}
.arena-market-prices::-webkit-scrollbar { display: none; }

.arena-price-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  white-space: nowrap;
  flex-shrink: 0;
}
.arena-price-item__label { color: var(--color-muted); }
.arena-price-item__val   { font-weight: 600; }
.arena-price-item__val--up   { color: var(--color-yes); }
.arena-price-item__val--down { color: var(--color-danger); }
.arena-price-item__val--flat { color: var(--color-text); }
```

**File**: `frontend/app/agents/page.tsx`

Add `.arena-market-prices` row inside `.battle-arena-header`, below `.arena-ticker-row`:

```tsx
<div className="arena-market-prices font-mono">
  {markets.map((m) => {
    const yes = Math.round((m.price?.yes ?? 0.5) * 100);
    const dir = yes > 50 ? "up" : yes < 50 ? "down" : "flat";
    return (
      <div key={m.id} className="arena-price-item">
        <span className="arena-price-item__label">#{m.id}</span>
        <span className={`arena-price-item__val arena-price-item__val--${dir}`}>
          {yes}% YES
        </span>
      </div>
    );
  })}
</div>
```

---

### S17 — Remove .agent-card (dead class cleanup)

**File**: `frontend/app/globals.css`

`.agent-card` and its sub-classes (`.agent-card__top`, `.agent-card__emoji`, etc.) are no longer referenced in the JSX — the leaderboard replaced agent cards. Delete the `.agent-card` CSS block.

Confirm by grepping `page.tsx` for `agent-card` before deleting.

---

## Verification

| Step | Signal |
|---|---|
| S1 | `frontend/node_modules/@fontsource-variable/space-grotesk` directory exists |
| S2–S3 | DevTools computed font for `.battle-page h1` = "Space Grotesk"; homepage h1 still "Plus Jakarta Sans" |
| S4 | Background inside `<main class="battle-page">` is warm dark charcoal (not cold blue-grey); accent elements show amber, not blue |
| S5–S6 | No rounded corners on leaderboard rows, market panels, pool bars, arena header in screenshot; no colored left border on rows |
| S7–S8 | ≥900px viewport: agent list in left column, markets+feed in right column; leaderboard stays fixed on scroll while feed scrolls |
| S11 | `VolumeSparkline` visible in each leaderboard row; bars update within 1s of agent firing a bet; oldest bars dimmer than newest |
| S12 | `DualChart` visible in each market panel at 280px wide; top panel shows YES% line; bottom panel shows stacked YES/NO volume bars; "warming up…" shows on first load until ≥1 bet per market |
| S13 | `TradeVolBar` visible in each feed entry; bets above median visually taller; YES=green, NO=red |
| S14 | Feed entries visually fade from top (opacity 1.0) to ~0.35 at bottom; newest bets always full-opacity |
| S15 | Feed section header reads "TRADE TAPE", uppercase, muted |
| S16 | Arena header is borderless container flush with page width; market price row shows #0/1/2 with colored YES% values |
| All | Screenshots: no rounded data surfaces, no colored glow borders, no electric-blue elements on the battle page; fonts visually distinct from homepage |

---

## File Ownership

| File | Steps |
|---|---|
| `frontend/package.json` + `node_modules` | S1 (npm install) |
| `frontend/app/layout.tsx` | S2 |
| `frontend/app/globals.css` | S3–S6, S9–S10, S13.4, S15–S17 |
| `frontend/app/agents/page.tsx` | S7–S8, S11–S14, S16 (JSX), S8 |

No database, no API, no contract changes.

---

## Anti-Pattern Compliance Checklist

Verified against impeccable design DON'Ts:

| DON'T | Status |
|---|---|
| Rounded rectangles with generic drop shadows | ✅ Removed in S5 |
| Rounded rectangle with thick colored border on one side | ✅ Removed in S6 |
| Sparklines as decoration (tiny charts conveying nothing) | ✅ Replaced with VolumeSparkline (data-meaningful bars) in S11 |
| Cyan-on-dark / purple-to-blue gradients | ✅ Accent changed to amber in S4 |
| Same spacing everywhere (no rhythm) | ✅ Side padding removed from feed rows (S13.4); tighter section labels (S10) |
| Center everything | ✅ Left-aligned throughout; two-column layout creates asymmetry |
| Hero metric layout (big number + small label) | ✅ Stats bar remains but is beside the title, not a hero |
| Cards inside cards | ✅ Leaderboard rows have no card background (S9); market panels sit flat |
| Font: Inter/system/neutral sans | ✅ Space Grotesk scoped to battle page (S3) |

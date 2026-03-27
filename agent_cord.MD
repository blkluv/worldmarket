# WorldMarket — 3-Agent Parallel Build Plan

> **Created:** March 27, 2026
> **Methodology:** Feature-branch isolation. Each agent owns a disjoint file set. No shared file is touched by more than one agent per stage.

---

## Branch Strategy

```
main
├── feat/api-fixes         ← Agent A (Express API only)
├── feat/frontend-infra    ← Agent B (lib/, layout, global CSS only)
└── feat/frontend-ui       ← Agent C (components/, pages only)
```

Agents A and B run **fully in parallel** — zero file overlap.
Agent C runs in the **same parallel stage** but targets its own files — it uses `var(--color-accent)` etc. as string references that become live once Agent B's CSS is merged. Syntactically valid immediately; visually complete after merge order.

**Merge order (all via PR → squash merge):**
1. `feat/api-fixes` → `main`  (Stage 1a)
2. `feat/frontend-infra` → `main`  (Stage 1b, same stage)
3. `feat/frontend-ui` → `main`  (Stage 2, after 1a+1b)

---

## File Ownership Table

| File / directory | Owner | Stage |
|---|---|---|
| `api/src/routes/markets.ts` | **Agent A** | 1 |
| `api/src/routes/bets.ts` | **Agent A** | 1 |
| `api/src/index.ts` | **Agent A** | 1 |
| `frontend/package.json` | **Agent B** | 1 |
| `frontend/.env.example` | **Agent B** | 1 |
| `frontend/app/globals.css` | **Agent B** | 1 |
| `frontend/app/layout.tsx` | **Agent B** | 1 |
| `frontend/app/providers.tsx` | **Agent B** | 1 |
| `frontend/lib/wagmi.ts` *(new)* | **Agent B** | 1 |
| `frontend/lib/env.ts` *(new)* | **Agent B** | 1 |
| `frontend/lib/contracts.ts` *(new)* | **Agent B** | 1 |
| `frontend/lib/abis/*.json` *(new)* | **Agent B** | 1 |
| `frontend/lib/types/events.ts` *(new)* | **Agent B** | 1 |
| `frontend/components/CapMeter.tsx` | **Agent C** | 1\* |
| `frontend/components/AgentFeed.tsx` | **Agent C** | 1\* |
| `frontend/components/WorldIDButton.tsx` | **Agent C** | 1\* |
| `frontend/components/ConnectWalletButton.tsx` *(new)* | **Agent C** | 1\* |
| `frontend/app/page.tsx` | **Agent C** | 1\* |
| `frontend/app/register/page.tsx` | **Agent C** | 1\* |
| `frontend/app/market/[id]/page.tsx` | **Agent C** | 1\* |

> \* Agent C runs in parallel with A+B but merges after them to pick up design tokens.

---

## Stage 1 — Parallel Execution

---

### Agent A: API Fixes (`feat/api-fixes`)

**Scope:** `api/src/` only. No frontend files.

#### A-1. Add ungated public market endpoints (`api/src/routes/markets.ts`)

Add two new free routes at the **top** of the file (before the existing gated routes). These are identical in logic to the gated equivalents — server components call these.

```typescript
// Add at top, before existing gated routes
router.get("/markets/public", async (_req: Request, res: Response) => {
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

router.get("/markets/:id/public", async (req: Request, res: Response) => {
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
```

#### A-2. Register public router before x402 middleware (`api/src/index.ts`)

```typescript
import marketsPublicRouter from "./routes/marketsPublic"; // new file

// BEFORE paymentMiddleware:
app.use(marketsPublicRouter);          // free reads
app.use(paymentMiddleware(x402Routes, resourceServer));
app.use(marketsRouter);                // x402-gated reads (agent only)
```

> OR: keep in same `markets.ts` file and just ensure those `router.get` calls occur before `app.use(paymentMiddleware(...))` in `index.ts`. Either approach works; single-file preferred for simplicity.

#### A-3. Emit `cap_hit` SSE event (`api/src/routes/bets.ts`)

Locate the cap check block and add `emitEvent` before the early return:

```typescript
// Existing block (find by: humanExposure + amountBig > humanCap)
if (humanExposure + amountBig > humanCap) {
  // ADD THESE LINES:
  emitEvent("cap_hit", {
    marketId,
    wallet,
    humanExposure: humanExposure.toString(),
    humanCap: humanCap.toString(),
    requestedAmount: amount,
  });
  // existing response:
  res.json({
    error: "human cap exceeded",
    humanExposure: humanExposure.toString(),
    humanCap: humanCap.toString(),
  });
  return;
}
```

#### A-4. Commit and PR

```bash
git checkout -b feat/api-fixes
# ... make changes ...
git add api/src/routes/markets.ts api/src/routes/bets.ts api/src/index.ts
git commit -m "feat(api): add public market endpoints + cap_hit SSE event"
git push origin feat/api-fixes
# Open PR → squash merge into main
```

---

### Agent B: Frontend Infrastructure (`feat/frontend-infra`)

**Scope:** `frontend/package.json`, `frontend/lib/`, `frontend/app/globals.css`, `frontend/app/layout.tsx`, `frontend/app/providers.tsx`. No `components/` or `app/page.tsx` etc.

#### B-1. Install dependencies

```bash
cd frontend
npm install @wagmi/connectors @fontsource-variable/syne @fontsource/ibm-plex-mono
```

Update `package.json` accordingly.

#### B-2. Create `frontend/.env.example`

```bash
# Public (safe in client bundle)
NEXT_PUBLIC_REGISTRY_ADDRESS=0x0000000000000000000000000000000000000000
NEXT_PUBLIC_MARKET_ADDRESS=0x0000000000000000000000000000000000000000
NEXT_PUBLIC_WLD_APP_ID=app_staging_xxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_WLD_ACTION=register-human
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Server-only (NEVER prefix with NEXT_PUBLIC_)
RP_SIGNING_KEY=
RP_ID=
```

#### B-3. Create `frontend/lib/env.ts`

```typescript
function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const env = {
  registryAddress: requireEnv("NEXT_PUBLIC_REGISTRY_ADDRESS") as `0x${string}`,
  marketAddress: requireEnv("NEXT_PUBLIC_MARKET_ADDRESS") as `0x${string}`,
  wldAppId: requireEnv("NEXT_PUBLIC_WLD_APP_ID"),
  wldAction: process.env.NEXT_PUBLIC_WLD_ACTION ?? "register-human",
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
} as const;

export function serverEnv() {
  return {
    rpSigningKey: requireEnv("RP_SIGNING_KEY"),
    rpId: requireEnv("RP_ID"),
  };
}
```

#### B-4. Create `frontend/lib/wagmi.ts`

```typescript
import { createConfig, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [
    injected(),
    walletConnect({ projectId }),
  ],
  transports: {
    [baseSepolia.id]: http(),
  },
});
```

#### B-5. Create `frontend/lib/abis/` + `frontend/lib/contracts.ts`

```
frontend/lib/abis/HumanRegistry.abi.json   ← copy abi[] from contracts/out/HumanRegistry.sol/HumanRegistry.json
frontend/lib/abis/WorldMarket.abi.json      ← copy abi[] from contracts/out/WorldMarket.sol/WorldMarket.json
```

```typescript
// frontend/lib/contracts.ts
import HumanRegistryABI from "./abis/HumanRegistry.abi.json";
import WorldMarketABI from "./abis/WorldMarket.abi.json";

export const REGISTRY = {
  address: (process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ?? "") as `0x${string}`,
  abi: HumanRegistryABI,
} as const;

export const MARKET = {
  address: (process.env.NEXT_PUBLIC_MARKET_ADDRESS ?? "") as `0x${string}`,
  abi: WorldMarketABI,
} as const;
```

#### B-6. Create `frontend/lib/types/events.ts`

```typescript
export interface BetEventPayload {
  marketId: number;
  outcome: boolean;
  amount: string;   // USDC base units (6 dec)
  wallet: string;
  txHash: string;
}

export interface CapHitEventPayload {
  marketId: number;
  wallet: string;
  humanExposure: string;
  humanCap: string;
  requestedAmount: string;
}

export function isBetEvent(v: unknown): v is BetEventPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.marketId === "number" &&
    typeof o.outcome === "boolean" &&
    typeof o.amount === "string" &&
    typeof o.wallet === "string" &&
    typeof o.txHash === "string"
  );
}

export function isCapHitEvent(v: unknown): v is CapHitEventPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.marketId === "number" &&
    typeof o.wallet === "string" &&
    typeof o.humanExposure === "string" &&
    typeof o.humanCap === "string"
  );
}
```

#### B-7. Update `frontend/app/providers.tsx`

```typescript
"use client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { wagmiConfig } from "@/lib/wagmi";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
```

#### B-8. Create `frontend/app/globals.css` — Full Design Token System

See **"Design System Specification"** section below. This is the entire file Agent B must create.

#### B-9. Update `frontend/app/layout.tsx`

```typescript
import type { Metadata } from "next";
import "@fontsource-variable/syne";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "WorldMarket — Prediction Markets for Verified Humans",
  description: "On-chain prediction markets with World ID human exposure caps.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

#### B-10. Commit and PR

```bash
git checkout -b feat/frontend-infra
git add frontend/
git commit -m "feat(frontend): design system, wagmi config, lib files, env schema"
git push origin feat/frontend-infra
# Open PR → squash merge AFTER or alongside feat/api-fixes
```

---

### Agent C: Frontend UI (`feat/frontend-ui`)

**Scope:** `frontend/components/`, `frontend/app/page.tsx`, `frontend/app/register/page.tsx`, `frontend/app/market/[id]/page.tsx`. References `var(--color-*)` tokens which resolve after Agent B merges.

Agent C works against this token set (string references — always valid CSS, visually live after B merges):

```
--color-bg             near-black surface
--color-surface        elevated panel surface
--color-text           primary text
--color-muted          muted text
--color-accent         acid-yellow — THE feature color
--color-danger         red — cap wall
--color-border         1px border color
--font-sans            Syne variable
--font-mono            IBM Plex Mono
```

#### C-1. Redesign `CapMeter.tsx` — The Signature Component

Full new implementation. **Wall-slam animation is the product.**

```typescript
"use client";
import { useEffect, useRef, useState } from "react";

interface CapMeterProps {
  exposure: string;
  cap: string;
  label?: string;
}

export function CapMeter({ exposure, cap, label }: CapMeterProps) {
  const raw = cap === "0" ? 1n : BigInt(cap || "1");
  const pctRaw = Number((BigInt(exposure || "0") * 10000n) / raw) / 100;
  const pct = Math.min(pctRaw, 100);
  const isMaxed = BigInt(exposure || "0") >= BigInt(cap || "1");
  const exposureUSD = (Number(BigInt(exposure || "0")) / 1_000_000).toFixed(2);
  const capUSD = (Number(BigInt(cap || "1")) / 1_000_000).toFixed(2);

  const prevPct = useRef(pct);
  const [slamming, setSlamming] = useState(false);

  useEffect(() => {
    if (isMaxed && prevPct.current < 100) {
      setSlamming(true);
      const t = setTimeout(() => setSlamming(false), 600);
      return () => clearTimeout(t);
    }
    prevPct.current = pct;
  }, [isMaxed, pct]);

  return (
    <div className="cap-meter" data-maxed={isMaxed || undefined} data-slamming={slamming || undefined}>
      {label && <div className="cap-meter__label">{label}</div>}
      <div className="cap-meter__header">
        <span className="cap-meter__pct font-mono">{pct.toFixed(1)}%</span>
        <span className="cap-meter__amounts font-mono">
          ${exposureUSD} <span className="cap-meter__sep">/</span> ${capUSD}
        </span>
      </div>
      <div className="cap-meter__track">
        <div
          className="cap-meter__fill"
          style={{ width: `${pct}%` }}
        />
        {isMaxed && <div className="cap-meter__wall" />}
      </div>
      {isMaxed && (
        <div className="cap-meter__maxed-label font-mono">
          🛑 CAP REACHED — BETS REJECTED
        </div>
      )}
    </div>
  );
}
```

CSS for `CapMeter` (goes in globals.css, Agent B writes it — Agent C references the classes):

```css
.cap-meter {
  border: 1px solid var(--color-border);
  padding: var(--space-3);
  background: var(--color-surface);
}

.cap-meter__label {
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-muted);
  margin-bottom: var(--space-2);
}

.cap-meter__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: var(--space-2);
}

.cap-meter__pct {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text);
}

.cap-meter[data-maxed] .cap-meter__pct {
  color: var(--color-danger);
}

.cap-meter__amounts {
  font-size: var(--text-xs);
  color: var(--color-muted);
}

.cap-meter__sep { margin: 0 var(--space-1); opacity: 0.5; }

.cap-meter__track {
  position: relative;
  height: 8px;
  background: color-mix(in oklch, var(--color-border) 60%, transparent);
  overflow: visible;
}

.cap-meter__fill {
  height: 100%;
  background: var(--color-accent);
  transition: width 400ms cubic-bezier(0.22, 1, 0.36, 1);
  transform-origin: left center;
}

.cap-meter[data-maxed] .cap-meter__fill {
  background: var(--color-danger);
  transition: background 200ms linear;
}

.cap-meter[data-slamming] .cap-meter__fill {
  animation: cap-slam 600ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

@keyframes cap-slam {
  0%   { transform: scaleX(1.04); }
  40%  { transform: scaleX(0.98); }
  70%  { transform: scaleX(1.01); }
  100% { transform: scaleX(1); }
}

.cap-meter__wall {
  position: absolute;
  right: 0;
  top: -4px;
  bottom: -4px;
  width: 2px;
  background: var(--color-danger);
  box-shadow: 0 0 8px 2px color-mix(in oklch, var(--color-danger) 60%, transparent);
}

.cap-meter[data-slamming] .cap-meter__wall {
  animation: wall-pulse 600ms ease-out;
}

@keyframes wall-pulse {
  0%   { box-shadow: 0 0 0 0 color-mix(in oklch, var(--color-danger) 80%, transparent); }
  50%  { box-shadow: 0 0 20px 6px color-mix(in oklch, var(--color-danger) 40%, transparent); }
  100% { box-shadow: 0 0 8px 2px color-mix(in oklch, var(--color-danger) 60%, transparent); }
}

.cap-meter__maxed-label {
  margin-top: var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-danger);
  font-weight: 600;
  letter-spacing: 0.05em;
}
```

#### C-2. Redesign `AgentFeed.tsx`

```typescript
"use client";
import { useEffect, useRef, useState } from "react";
import { isBetEvent, isCapHitEvent, type BetEventPayload, type CapHitEventPayload } from "@/lib/types/events";

type FeedEntry =
  | { type: "bet"; ts: string; payload: BetEventPayload }
  | { type: "cap_hit"; ts: string; payload: CapHitEventPayload }

interface AgentFeedProps {
  apiUrl: string;
  marketId?: number;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
function usdAmount(amount: string) {
  return `$${(Number(amount) / 1_000_000).toFixed(2)}`;
}
function shortHash(hash: string) {
  return `${hash.slice(0, 8)}…`;
}

export function AgentFeed({ apiUrl, marketId }: AgentFeedProps) {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "error">("connecting");

  useEffect(() => {
    const es = new EventSource(`${apiUrl}/stream`);

    es.addEventListener("open", () => setStatus("live"));
    es.addEventListener("error", () => setStatus("error"));

    es.addEventListener("bet", (e) => {
      try {
        const raw = JSON.parse((e as MessageEvent).data) as unknown;
        if (!isBetEvent(raw)) return;
        if (marketId !== undefined && raw.marketId !== marketId) return;
        setEntries((prev) => [{ type: "bet", ts: new Date().toISOString(), payload: raw }, ...prev].slice(0, 50));
      } catch { /* noop */ }
    });

    es.addEventListener("cap_hit", (e) => {
      try {
        const raw = JSON.parse((e as MessageEvent).data) as unknown;
        if (!isCapHitEvent(raw)) return;
        if (marketId !== undefined && raw.marketId !== marketId) return;
        setEntries((prev) => [{ type: "cap_hit", ts: new Date().toISOString(), payload: raw }, ...prev].slice(0, 50));
      } catch { /* noop */ }
    });

    return () => es.close();
  }, [apiUrl, marketId]);

  return (
    <div className="agent-feed">
      <div className="agent-feed__header">
        <span className="agent-feed__title font-sans">AGENT FEED</span>
        <span className={`agent-feed__status agent-feed__status--${status} font-mono`}>
          {status === "live" ? "● LIVE" : status === "connecting" ? "○ CONNECTING" : "✕ ERROR"}
        </span>
      </div>
      <div className="agent-feed__list" role="log" aria-live="polite" aria-label="Agent betting activity">
        {entries.length === 0 && (
          <div className="agent-feed__empty font-mono">Waiting for agent activity…</div>
        )}
        {entries.map((entry, i) => (
          <div
            key={`${entry.ts}-${i}`}
            className={`agent-feed__entry agent-feed__entry--${entry.type}`}
            aria-label={entry.type === "bet" ? "Bet placed" : "Cap hit"}
          >
            <span className="agent-feed__time font-mono">
              {new Date(entry.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
            {entry.type === "bet" && (
              <span className="agent-feed__body font-mono">
                <span className="agent-feed__addr">{shortAddr(entry.payload.wallet)}</span>
                {" "}bet{" "}
                <span className="agent-feed__amount">{usdAmount(entry.payload.amount)}</span>
                {" on "}
                <span className={entry.payload.outcome ? "agent-feed__yes" : "agent-feed__no"}>
                  {entry.payload.outcome ? "YES" : "NO"}
                </span>
                {" "}
                <a
                  className="agent-feed__tx"
                  href={`https://sepolia.basescan.org/tx/${entry.payload.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View transaction ${entry.payload.txHash} on BaseScan`}
                >
                  {shortHash(entry.payload.txHash)}↗
                </a>
              </span>
            )}
            {entry.type === "cap_hit" && (
              <span className="agent-feed__body agent-feed__body--cap font-mono">
                🛑 <span className="agent-feed__addr">{shortAddr(entry.payload.wallet)}</span>
                {" "}hit cap — {usdAmount(entry.payload.humanExposure)} / {usdAmount(entry.payload.humanCap)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

#### C-3. Create `ConnectWalletButton.tsx`

```typescript
"use client";
import { useAccount, useConnect, useDisconnect } from "wagmi";

export function ConnectWalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        className="wallet-btn wallet-btn--connected font-mono"
        onClick={() => disconnect()}
        aria-label={`Disconnect wallet ${address}`}
      >
        {address.slice(0, 6)}…{address.slice(-4)} ✕
      </button>
    );
  }

  const injectedConnector = connectors.find((c) => c.id === "injected");
  const wcConnector = connectors.find((c) => c.id === "walletConnect");

  return (
    <div className="wallet-connect-group" role="group" aria-label="Connect wallet">
      {injectedConnector && (
        <button
          className="wallet-btn font-mono"
          onClick={() => connect({ connector: injectedConnector })}
          disabled={isPending}
          aria-label="Connect injected wallet (MetaMask)"
        >
          {isPending ? "CONNECTING…" : "CONNECT WALLET"}
        </button>
      )}
      {wcConnector && (
        <button
          className="wallet-btn wallet-btn--secondary font-mono"
          onClick={() => connect({ connector: wcConnector })}
          disabled={isPending}
          aria-label="Connect via WalletConnect"
        >
          WC
        </button>
      )}
    </div>
  );
}
```

#### C-4. Redesign `WorldIDButton.tsx`

Keep existing interface. Add brutalist styling and loading/error states:

```typescript
"use client";
import { useState } from "react";
import { IDKitRequestWidget, orbLegacy, type IDKitResult, type RpContext } from "@worldcoin/idkit";

interface WorldIDButtonProps {
  onVerify: (result: IDKitResult) => void;
  walletAddress: `0x${string}`;
  action?: string;
}

export function WorldIDButton({
  onVerify,
  walletAddress,
  action = process.env.NEXT_PUBLIC_WLD_ACTION ?? "register-human",
}: WorldIDButtonProps) {
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadRpContext() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rp-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(`rp-signature ${res.status}`);
      const ctx = (await res.json()) as RpContext;
      setRpContext(ctx);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load World ID context");
    } finally {
      setLoading(false);
    }
  }

  if (error) {
    return (
      <button className="wid-btn wid-btn--error font-mono" onClick={loadRpContext}>
        ✕ {error} — RETRY
      </button>
    );
  }

  if (loading) {
    return (
      <button className="wid-btn wid-btn--loading font-mono" disabled>
        LOADING WORLD ID…
      </button>
    );
  }

  if (!rpContext) {
    return (
      <button className="wid-btn font-mono" onClick={loadRpContext}>
        VERIFY WITH WORLD ID ◎
      </button>
    );
  }

  return (
    <IDKitRequestWidget
      app_id={process.env.NEXT_PUBLIC_WLD_APP_ID as `app_${string}`}
      action={action}
      signal={walletAddress}
      rp_context={rpContext}
      preset={orbLegacy({ signal: walletAddress })}
      allow_legacy_proofs
      onSuccess={onVerify}
    >
      {({ open }) => (
        <button className="wid-btn wid-btn--ready font-mono" onClick={open}>
          ◎ WORLD ID READY — CLICK TO SCAN
        </button>
      )}
    </IDKitRequestWidget>
  );
}
```

#### C-5. Redesign `app/page.tsx` — Market List

```typescript
import Link from "next/link";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface Market {
  id: number;
  question: string;
  deadline: string;
  status: string;
  price: { yes: number; no: number };
}

async function getMarkets(): Promise<Market[]> {
  try {
    const res = await fetch(`${API_URL}/markets/public`, { cache: "no-store" });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: Market[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

function formatDeadline(ts: string): string {
  return new Date(Number(ts) * 1000).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default async function HomePage() {
  const markets = await getMarkets();

  return (
    <div className="page-shell">
      <header className="site-header">
        <div className="site-header__brand">
          <span className="site-header__mark font-mono">◈</span>
          <span className="site-header__name font-sans">WORLDMARKET</span>
        </div>
        <nav className="site-header__nav" aria-label="Primary navigation">
          <Link href="/register" className="nav-link font-mono">REGISTER</Link>
          <ConnectWalletButton />
        </nav>
      </header>

      <main className="page-content">
        <section className="hero-section" aria-labelledby="hero-heading">
          <h1 id="hero-heading" className="hero-heading font-sans">
            PREDICTION MARKETS<br />
            <span className="hero-heading__accent">FOR VERIFIED HUMANS</span>
          </h1>
          <p className="hero-sub font-mono">
            Per‑human exposure caps enforced on‑chain via World ID.<br />
            AI agents pay to play. You set the ceiling.
          </p>
        </section>

        <section aria-labelledby="markets-heading">
          <div className="section-header">
            <h2 id="markets-heading" className="section-title font-sans">OPEN MARKETS</h2>
            <span className="section-count font-mono">{markets.length} active</span>
          </div>

          {markets.length === 0 ? (
            <div className="empty-state font-mono" role="status">
              — NO MARKETS AVAILABLE —
            </div>
          ) : (
            <ul className="market-list" role="list" aria-label="Open prediction markets">
              {markets.map((market) => (
                <li key={market.id} className="market-card">
                  <Link href={`/market/${market.id}`} className="market-card__link" aria-label={`View market: ${market.question}`}>
                    <div className="market-card__id font-mono">MKT-{String(market.id).padStart(4, "0")}</div>
                    <h3 className="market-card__question font-sans">{market.question}</h3>
                    <div className="market-card__footer">
                      <div className="market-card__odds" aria-label="Current odds">
                        <span className="odds-yes font-mono" aria-label={`Yes: ${(market.price.yes * 100).toFixed(1)} cents`}>
                          YES {(market.price.yes * 100).toFixed(1)}¢
                        </span>
                        <span className="odds-divider" aria-hidden="true">/</span>
                        <span className="odds-no font-mono" aria-label={`No: ${(market.price.no * 100).toFixed(1)} cents`}>
                          NO {(market.price.no * 100).toFixed(1)}¢
                        </span>
                      </div>
                      <div className="market-card__deadline font-mono" aria-label={`Deadline: ${formatDeadline(market.deadline)}`}>
                        {formatDeadline(market.deadline)}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
```

#### C-6. Redesign `app/register/page.tsx`

Minimal interface change — add CSS classes to existing logic, update API URL to `/markets/public` pattern if needed. Preserve all existing `writeContract` + IDKit logic. Add step-state visual indicator (Step 1: Connect → Step 2: Verify → Step 3: Register → Step 4: Add Agent).

#### C-7. Redesign `app/market/[id]/page.tsx`

Update to use `/markets/:id/public`. Pass `CapMeter` real `humanCap` from contract read via `useReadContract` in a client island (new `MarketDetailClient.tsx` component). Wire `AgentFeed` with `marketId` filter.

#### C-8. Commit and PR

```bash
git checkout -b feat/frontend-ui
git add frontend/components/ frontend/app/page.tsx frontend/app/register/ frontend/app/market/
git commit -m "feat(frontend): brutalist design system — CapMeter, AgentFeed, pages"
git push origin feat/frontend-ui
# Open PR → squash merge AFTER feat/api-fixes + feat/frontend-infra
```

---

## Design System Specification — `globals.css`

> Agent B implements this file. Agent C references the classes/vars. Source: Tailwind CSS v4 `@theme` pattern verified via context7 (`/tailwindlabs/tailwindcss.com`).

```css
@import "tailwindcss";

/* ─── Design tokens via @theme ─────────────────────────────────────────── */
@theme {
  /* Typography */
  --font-sans: "Syne Variable", "Syne", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", "Courier New", monospace;

  /* Semantic color tokens — dark-first (html[data-theme="dark"]) */
  --color-bg:      oklch(8% 0 0);
  --color-surface: oklch(12% 0 0);
  --color-text:    oklch(96% 0.01 90);
  --color-muted:   oklch(55% 0.01 90);
  --color-accent:  oklch(88% 0.25 120);   /* acid-yellow — ONE accent */
  --color-danger:  oklch(65% 0.22 25);    /* muted red */
  --color-border:  oklch(22% 0 0);

  /* Spacing scale (4px grid) */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --space-16: 4rem;

  /* Type scale */
  --text-xs:   0.75rem;
  --text-sm:   0.875rem;
  --text-base: 1rem;
  --text-lg:   1.125rem;
  --text-xl:   1.25rem;
  --text-2xl:  1.5rem;
  --text-3xl:  1.875rem;
  --text-5xl:  3rem;

  /* Easing */
  --ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);
}

/* Light theme override */
[data-theme="light"] {
  --color-bg:      oklch(98% 0 0);
  --color-surface: oklch(94% 0 0);
  --color-text:    oklch(10% 0 0);
  --color-muted:   oklch(48% 0 0);
  --color-border:  oklch(82% 0 0);
  /* accent + danger same in both themes */
}

@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    --color-bg:      oklch(98% 0 0);
    --color-surface: oklch(94% 0 0);
    --color-text:    oklch(10% 0 0);
    --color-muted:   oklch(48% 0 0);
    --color-border:  oklch(82% 0 0);
  }
}

/* ─── Base reset ────────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html {
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

body {
  background-color: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: 1.6;
  min-height: 100dvh;
  transition: background-color 200ms linear, color 200ms linear;
}

/* ─── Typography helpers ────────────────────────────────────────────────── */
.font-sans  { font-family: var(--font-sans); }
.font-mono  { font-family: var(--font-mono); }

/* ─── Layout ────────────────────────────────────────────────────────────── */
.page-shell {
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 100dvh;
}

.page-content {
  max-width: 960px;
  width: 100%;
  margin: 0 auto;
  padding: var(--space-8) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
}

/* ─── Site header ───────────────────────────────────────────────────────── */
.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-6);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  background: var(--color-bg);
  z-index: 10;
}

.site-header__brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.site-header__mark {
  font-size: var(--text-xl);
  color: var(--color-accent);
}

.site-header__name {
  font-size: var(--text-sm);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.site-header__nav {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.nav-link {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--color-muted);
  text-decoration: none;
  text-transform: uppercase;
  transition: color 150ms ease;
}
.nav-link:hover { color: var(--color-text); }

/* ─── Hero section ──────────────────────────────────────────────────────── */
.hero-section { padding: var(--space-16) 0 var(--space-8); }

.hero-heading {
  font-size: clamp(var(--text-3xl), 6vw, var(--text-5xl));
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.02em;
  margin-bottom: var(--space-6);
}

.hero-heading__accent { color: var(--color-accent); }

.hero-sub {
  font-size: var(--text-sm);
  color: var(--color-muted);
  line-height: 1.8;
  max-width: 52ch;
}

/* ─── Section header ────────────────────────────────────────────────────── */
.section-header {
  display: flex;
  align-items: baseline;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--color-border);
}

.section-title {
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text);
}

.section-count {
  font-size: var(--text-xs);
  color: var(--color-muted);
}

/* ─── Market list + cards ───────────────────────────────────────────────── */
.market-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1px;                     /* hairline gap between cards */
  background: var(--color-border);   /* gap becomes border color */
}

.market-card {
  background: var(--color-bg);
  transition: background 120ms ease;
}
.market-card:hover { background: var(--color-surface); }

.market-card__link {
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-rows: auto auto;
  gap: var(--space-1) var(--space-4);
  padding: var(--space-4) var(--space-4);
  text-decoration: none;
  color: inherit;
}

.market-card__id {
  grid-column: 1;
  grid-row: 1;
  font-size: var(--text-xs);
  color: var(--color-accent);
  font-weight: 600;
  letter-spacing: 0.06em;
  align-self: start;
  padding-top: 2px;
}

.market-card__question {
  grid-column: 2;
  grid-row: 1 / 3;
  font-size: var(--text-base);
  font-weight: 600;
  line-height: 1.4;
  color: var(--color-text);
  align-self: center;
}

.market-card__footer {
  grid-column: 3;
  grid-row: 1 / 3;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-2);
  align-self: center;
}

.market-card__odds { display: flex; align-items: center; gap: var(--space-2); }
.odds-yes { font-size: var(--text-sm); color: var(--color-accent); font-weight: 600; }
.odds-divider { color: var(--color-border); }
.odds-no  { font-size: var(--text-sm); color: var(--color-muted); }

.market-card__deadline { font-size: var(--text-xs); color: var(--color-muted); }

@media (max-width: 640px) {
  .market-card__link {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
  }
  .market-card__id    { grid-column: 1; grid-row: 1; }
  .market-card__question { grid-column: 1; grid-row: 2; }
  .market-card__footer { grid-column: 1; grid-row: 3; flex-direction: row; align-items: center; }
}

/* ─── Empty state ───────────────────────────────────────────────────────── */
.empty-state {
  padding: var(--space-12) 0;
  text-align: center;
  font-size: var(--text-sm);
  color: var(--color-muted);
  letter-spacing: 0.06em;
}

/* ─── Buttons ───────────────────────────────────────────────────────────── */
.wallet-btn {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  padding: var(--space-2) var(--space-4);
  background: transparent;
  border: 1px solid var(--color-accent);
  color: var(--color-accent);
  border-radius: 2px;
  cursor: pointer;
  text-transform: uppercase;
  transition: background 120ms ease, color 120ms ease;
}
.wallet-btn:hover { background: var(--color-accent); color: var(--color-bg); }
.wallet-btn--connected { border-color: var(--color-border); color: var(--color-muted); }
.wallet-btn--connected:hover { border-color: var(--color-danger); color: var(--color-danger); background: transparent; }
.wallet-btn--secondary {
  border-color: var(--color-border);
  color: var(--color-muted);
}
.wallet-btn--secondary:hover { border-color: var(--color-text); color: var(--color-text); }

.wallet-connect-group { display: flex; gap: var(--space-2); }

/* ─── World ID button ───────────────────────────────────────────────────── */
.wid-btn {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  padding: var(--space-3) var(--space-6);
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-muted);
  border-radius: 2px;
  cursor: pointer;
  text-transform: uppercase;
  width: 100%;
  transition: all 120ms ease;
}
.wid-btn--ready { border-color: var(--color-accent); color: var(--color-accent); }
.wid-btn--ready:hover { background: var(--color-accent); color: var(--color-bg); }
.wid-btn--error { border-color: var(--color-danger); color: var(--color-danger); }
.wid-btn--loading { opacity: 0.5; cursor: not-allowed; }

/* ─── Agent feed ─────────────────────────────────────────────────────────── */
.agent-feed {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

.agent-feed__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.agent-feed__title {
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-muted);
}

.agent-feed__status { font-size: var(--text-xs); letter-spacing: 0.06em; }
.agent-feed__status--live       { color: var(--color-accent); }
.agent-feed__status--connecting { color: var(--color-muted); }
.agent-feed__status--error      { color: var(--color-danger); }

.agent-feed__list {
  max-height: 320px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.agent-feed__empty {
  padding: var(--space-8) var(--space-4);
  text-align: center;
  font-size: var(--text-xs);
  color: var(--color-muted);
  letter-spacing: 0.04em;
}

.agent-feed__entry {
  display: flex;
  align-items: baseline;
  gap: var(--space-4);
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid color-mix(in oklch, var(--color-border) 40%, transparent);
  font-size: var(--text-xs);
  animation: feed-slide-in 200ms var(--ease-out-quint) both;
}

@keyframes feed-slide-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: none; }
}

.agent-feed__entry--cap_hit { background: color-mix(in oklch, var(--color-danger) 8%, transparent); }

.agent-feed__time  { color: var(--color-muted); flex-shrink: 0; }
.agent-feed__body  { color: var(--color-text); flex: 1; line-height: 1.4; }
.agent-feed__body--cap { color: var(--color-danger); }
.agent-feed__addr  { color: var(--color-muted); }
.agent-feed__amount { color: var(--color-accent); font-weight: 600; }
.agent-feed__yes   { color: var(--color-accent); font-weight: 600; }
.agent-feed__no    { color: var(--color-muted); font-weight: 600; }
.agent-feed__tx    { color: var(--color-muted); text-decoration: none; border-bottom: 1px solid var(--color-border); }
.agent-feed__tx:hover { color: var(--color-text); }

/* ─── CapMeter (see C-1 above for component-level CSS) ────────────────── */
/* All .cap-meter* classes go here — Agent B writes them verbatim from C-1 spec */

/* ─── Theme toggle ───────────────────────────────────────────────────────── */
.theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 2px;
  padding: 2px;
}

.theme-toggle__btn {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  font-weight: 600;
  letter-spacing: 0.06em;
  background: transparent;
  border: none;
  color: var(--color-muted);
  cursor: pointer;
  border-radius: 1px;
  transition: all 100ms ease;
}

.theme-toggle__btn[aria-pressed="true"] {
  background: var(--color-accent);
  color: var(--color-bg);
}
```

---

## Merge Runbook

```
Stage 1 (parallel, any order):
  PR#1: feat/api-fixes      → CI green → squash merge → main
  PR#2: feat/frontend-infra → CI green → squash merge → main

Stage 2 (sequential, after both above):
  git checkout feat/frontend-ui
  git fetch origin && git rebase origin/main
  # resolve any import path conflicts (none expected — disjoint files)
  git push --force-with-lease origin feat/frontend-ui
  PR#3: feat/frontend-ui → CI green → squash merge → main
```

No agent touches the same file. No rebase conflict is possible between A/B. Agent C rebases onto the merged main before final merge.

---

## Conflict Risk Analysis

| Risk | Mitigation |
|---|---|
| Agent B and C both in `frontend/` | Different subdirs: B owns `lib/` + layout, C owns `components/` + pages |
| Both write to `package.json` | Only Agent B touches `package.json` — Agent C adds no deps |
| `globals.css` classes used before file exists | CSS vars degrade gracefully; page compiles without tokens |
| `lib/types/events.ts` created by B, used by C | Agent C imports from path that will exist post-merge. No compile-time check across branches; type errors surface only in merged state (expected, not blocking) |
| ABI files not yet in `lib/` | Agent C pages don't import ABIs directly — only through `lib/contracts.ts` which B creates. C uses `as const` assertion until merge |

---

## Completion Checklist

### Agent A done when:
- [ ] `GET /markets/public` returns 200 with market data (no wallet required)
- [ ] `GET /markets/:id/public` returns 200
- [ ] `POST /markets/:id/bet` with cap exceeded emits `cap_hit` SSE event (verify via `curl /stream` in one terminal, POST in another)

### Agent B done when:
- [ ] `frontend/lib/wagmi.ts` exports `wagmiConfig` with injected + walletConnect connectors
- [ ] `frontend/lib/env.ts` exports `env` and `serverEnv()`
- [ ] `frontend/lib/contracts.ts` exports `REGISTRY` and `MARKET`
- [ ] `frontend/lib/types/events.ts` exports type guards
- [ ] `frontend/app/globals.css` contains all `@theme` tokens and CSS classes
- [ ] `frontend/app/layout.tsx` loads Syne + IBM Plex Mono, sets `data-theme="dark"`
- [ ] `frontend/app/providers.tsx` uses `wagmiConfig` from lib

### Agent C done when:
- [ ] `CapMeter` renders fill bar in acid-yellow, transitions to red at 100%, wall-slam animates
- [ ] `AgentFeed` connects to `/stream`, uses named event listeners, uses type guards from `lib/types/events.ts`
- [ ] `ConnectWalletButton` shows address when connected, supports injected + WalletConnect
- [ ] `WorldIDButton` has loading/error/ready states with brutalist styling
- [ ] `page.tsx` uses `/markets/public`
- [ ] `market/[id]/page.tsx` uses `/markets/:id/public`
- [ ] No `style={{...}}` inline styles remain — all classes

---

*ArchitectUX agent plan — ready for immediate parallel execution.*

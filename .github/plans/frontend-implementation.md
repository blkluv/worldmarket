# WorldMarket Frontend Implementation Plan

> **Last updated:** March 27, 2026 — reconciled against actual contracts, agent, and API implementation.

---

## State of the Build

All scaffolding exists. Contracts are deployed (UUPS proxies on Base Sepolia). Agent loop runs end-to-end. API is live with x402. Frontend has working logic in inline-style placeholder UI. **What remains is design, wiring correctness, and a few missing lib files.**

| File / component | Status | Notes |
|---|---|---|
| `contracts/src/HumanRegistry.sol` | ✅ done | UUPS proxy, `registerHuman`, `registerAgent`, `humanOf` |
| `contracts/src/WorldMarket.sol` | ✅ done | UUPS proxy, `bet`, `resolve`, `claim`, `perHumanCap`, `humanExposure` |
| `agent/src/x402Client.ts` | ✅ done | `@x402/fetch` + `x402Client` class + `ExactEvmScheme` pattern |
| `agent/src/index.ts` | ✅ done | Full loop: price → simulate → bet → cap hit → exit |
| `api/src/middleware/x402.ts` | ✅ done | `@x402/express` v2, `RoutesConfig` per endpoint |
| `api/src/routes/markets.ts` | ✅ done | `GET /markets`, `/markets/:id`, `/markets/:id/price` |
| `api/src/routes/bets.ts` | ✅ done | `POST /markets/:id/bet` — emits `"bet"` SSE event |
| `api/src/routes/simulate.ts` | ✅ done | `POST /markets/:id/simulate` |
| `api/src/routes/stream.ts` | ✅ done | Named SSE events: `"bet"`, `"ping"` |
| `frontend/app/api/rp-signature/route.ts` | ✅ done | Returns `{ rp_id, signature, nonce, created_at, expires_at }` |
| `frontend/app/providers.tsx` | ⚠️ partial | Missing `injected()` + `walletConnect()` connectors |
| `frontend/app/layout.tsx` | ⚠️ partial | No font loading, no design tokens, no `data-theme` |
| `frontend/app/page.tsx` | ⚠️ partial | Works but inline styles, x402 problem unaddressed |
| `frontend/app/register/page.tsx` | ⚠️ partial | Logic works, inline styles, no step states |
| `frontend/app/market/[id]/page.tsx` | ⚠️ partial | Hardcoded `humanCap`, no live reads, inline styles |
| `frontend/components/WorldIDButton.tsx` | ⚠️ partial | Works, no brutalist style |
| `frontend/components/AgentFeed.tsx` | ⚠️ partial | Works, no brutalist style, uses string timestamp |
| `frontend/components/CapMeter.tsx` | ⚠️ partial | Works, no brutalist style, no wall-slam animation |
| `frontend/lib/wagmi.ts` | ❌ missing | Inline in `providers.tsx` — needs extraction + connectors |
| `frontend/lib/env.ts` | ❌ missing | No typed env helper |
| `frontend/lib/contracts.ts` + `lib/abis/` | ❌ missing | No ABI files, no typed contract constants |
| `frontend/lib/types/idkit.ts` | ❌ missing | `RpContext` from idkit, corrected parse guard |
| `frontend/lib/types/events.ts` | ❌ missing | `BetEvent` type guard matching actual SSE shape |
| `frontend/components/ConnectWalletButton.tsx` | ❌ missing | |
| `frontend/app/globals.css` | ❌ missing | No design tokens, no Tailwind `@theme` block |
| fonts installed | ❌ missing | Syne, IBM Plex Mono not in `package.json` |
| `api`: `cap_hit` SSE event | ❌ missing | `bets.ts` never emits `"cap_hit"` — `AgentFeed` listens but never fires |
| Demo mode (DevRegistry + orchestrator) | ❌ not started | Low priority — do after design pass |

---

### Goal

Build a production-grade Next.js 15 (App Router) frontend for WorldMarket — three pages (market list, registration, market detail), three components (WorldIDButton, AgentFeed, CapMeter) — wired to the Express API and smart contracts, with a brutalist-editorial aesthetic that makes the cap-hit moment unforgettable.

---

### Constraints

- **Next.js 15** App Router (not Pages Router). Server Components by default; client components explicit.
- **wagmi v2** — `useWriteContract` (not v1 `useContractWrite`). `useReadContract` for on-chain reads. WalletConnect + injected connectors — both required in wagmi config.
- **IDKit v4.x** (`@worldcoin/idkit@4.0.11`). Component is `IDKitRequestWidget`, not `IDKitWidget`. `RpContext` type imported directly from `@worldcoin/idkit`. Requires `rp_context` from `/api/rp-signature`. `preset={orbLegacy({ signal: walletAddress })}`. `allow_legacy_proofs: true` mandatory until June 1, 2026. IDKit v3 proofs have `protocol_version: "3.0"` and `responses[0].{ proof, merkle_root, nullifier }` — the register page already handles this branch.
- **`rp-signature` response shape** (actual, not plan spec): `{ rp_id: string, signature: string, nonce: string, created_at: string, expires_at: string }`. Note: key is `signature` not `sig`. `RpContext` is imported from `@worldcoin/idkit` — it matches this shape already.
- **x402 packages** (actual): agent uses `@x402/fetch` + `@x402/core/client` + `@x402/evm/exact/client`. API uses `@x402/express` + `@x402/core/server` + `@x402/evm/exact/server`. Frontend does NOT use any x402 package.
- **x402-gated endpoints** — `GET /markets`, `GET /markets/:id`, `GET /markets/:id/price`, `POST /markets/:id/bet`, `POST /markets/:id/simulate` are all x402-gated. **Frontend Server Components cannot call these directly.** Required fix: add `GET /markets/public` and `GET /markets/:id/public` free endpoints to the Express API (or proxy via Next.js API routes). See Step 13.
- **SSE stream** (`GET /stream`) is free (no x402). Uses **named events** — must use `es.addEventListener("bet", handler)` and `es.addEventListener("cap_hit", handler)`, NOT `es.onmessage`. Generic `onmessage` will receive only the heartbeat `"ping"` events.
- **SSE `"bet"` event payload** (actual shape from `bets.ts`): `{ marketId: number, outcome: boolean, amount: string, wallet: string, txHash: string }`. Fields `agent` and `human` do NOT exist. `timestamp` is not included — add client-side.
- **`cap_hit` SSE event** — `AgentFeed` listens for it but `bets.ts` never emits it. Must add `emitEvent("cap_hit", {...})` to `bets.ts` when `humanExposure >= humanCap` (the error path). See Step 0 (API fix).
- **`CapMeter` props** (current actual): `{ exposure: string; cap: string; label?: string }` — strings in USDC base units (6 decimals). The component converts to USD display internally. Bigint props would require `useReadContract` to pass through; keep strings for server-passable compatibility.
- **`AgentFeed` props** (current actual): `{ apiUrl: string; marketId?: number }`. `apiUrl` is required because `NEXT_PUBLIC_API_URL` is not directly accessible in server components.
- **`WorldIDButton` props** (current actual): `{ onVerify: (result: IDKitResult) => void; walletAddress: \`0x${string}\`; action?: string }`. The parent (`register/page.tsx`) owns the `writeContract` call.
- **World ID v3 on-chain** — `WorldIDRouter.verifyProof()` at `0x42FF98C4E85212a5D31358ACbFe76a621b50fC02` (Base Sepolia). No v4 on-chain (preview, not mainnet as of March 27, 2026).
- **Chain**: Base Sepolia (`chainId: 84532`, CAIP-2: `eip155:84532`). No mainnet.
- **No API keys in client bundle** — `RP_SIGNING_KEY`, `RP_ID` are server-only. `NEXT_PUBLIC_*` vars are only non-sensitive identifiers.
- **TypeScript strict mode** — `tsconfig.json` must include:
  ```json
  {
    "compilerOptions": {
      "strict": true,
      "noUncheckedIndexedAccess": true,
      "exactOptionalPropertyTypes": true,
      "noImplicitReturns": true,
      "noFallthroughCasesInSwitch": true,
      "forceConsistentCasingInFileNames": true
    }
  }
  ```
  No `any`. No unchecked `as Foo` except at validated parse boundaries (env addresses only).
- **Runtime validation at parse boundaries** — any `JSON.parse` or untyped API response must be validated with a narrow type guard before use.
- **Tailwind CSS v4** for utility classes. CSS custom properties for design tokens.
- **No modals** for primary flows. Sheet/inline patterns preferred.

---

### Resolved Unknowns / Remaining Risks

Previously-unknown items that are now confirmed from the actual implementation:

| Was unknown | Confirmed answer |
|---|---|
| `humanExposure` public getter | ✅ Yes — `humanExposure(uint256 marketId, address human)` returns `uint256` |
| AMM `price` format from API | ✅ `{ yes: number, no: number }` (probabilities 0–1) |
| SSE event schema | ✅ Named events `"bet"` + `"ping"`. `"bet"` payload: `{ marketId, outcome, amount, wallet, txHash }` |
| `rp-signature` response shape | ✅ `{ rp_id, signature, nonce, created_at, expires_at }` |
| x402 package API | ✅ `@x402/fetch` + `x402Client` class + scheme registration pattern |
| `BetPlaced` event fields | ✅ `(marketId, bettor, outcome, amount, shares)` |

**Remaining risks:**

- `NEXT_PUBLIC_WLD_APP_ID` and `RP_ID` + `RP_SIGNING_KEY` must be set before registration flow can be tested. If `RP_ID` env var is missing, `/api/rp-signature` returns 500 (current route requires both `RP_SIGNING_KEY` and `RP_ID`).
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — must be provisioned from cloud.walletconnect.com. Current `providers.tsx` omits WalletConnect connector entirely.
- **x402 frontend problem** — `GET /markets` is gated at $0.001. `page.tsx` currently calls it directly as a Server Component but will receive 402 in production. This is the highest-priority API-side fix needed. Resolution: add free `GET /markets/public` endpoint (see Step 0).
- **`cap_hit` SSE gap** — `AgentFeed` has a `cap_hit` event listener but `bets.ts` never emits it. The demo's signature moment (`CapMeter` hits the wall as the feed shows a cap-hit event) requires this to be wired. Fix in Step 0.
- Proof encoding for `registerHuman`: IDKit v3 legacy returns `responses[0].proof` as hex-encoded ABI-packed `uint256[8]`. The `register/page.tsx` decodes it by slicing 64-char hex segments. Needs verification against a Simulator run on Base Sepolia.
- CORS: Express API must emit `Access-Control-Allow-Origin: <frontend-origin>` for the `/stream` SSE endpoint. Current `app.use(cors())` uses the default wildcard — confirm this is sufficient in production.

---

### Design Direction

**Aesthetic: Brutalist Data Terminal × Swiss Editorial**

Identity-forward, anti-AI-slop, intentional.

| Token | Value |
|---|---|
| Background | `oklch(8% 0 0)` — near-black, not pure |
| Surface | `oklch(12% 0 0)` — elevated panels |
| Text primary | `oklch(96% 0.01 90)` — warm off-white |
| Text muted | `oklch(55% 0.01 90)` — desaturated |
| Accent | `oklch(88% 0.25 120)` — acid-yellow/chartreuse — ONE accent, used sparingly |
| Danger | `oklch(65% 0.22 25)` — muted red for cap wall |
| Headline font | **Syne** (700, 800) — `variable`, loaded from Fontsource |
| Data font | **IBM Plex Mono** (400, 600) — all numbers, addresses, prices |
| Body font | **Syne** (400) — same family, avoids Inter/Roboto |
| Border | 1px `oklch(22% 0 0)` — sharp, no rounding on data surfaces |
| Border-radius | `0px` on data cards, `2px` on buttons only |
| Shadows | none — no glassmorphism, no drop-shadows |
| Motion | `ease-out-quint` for entrances, `linear` for CapMeter fills |

**Differentiator**: The CapMeter is the product. It fills with each bet in acid-yellow, then hits a solid red wall with a hard-stop animation and a `🛑` pulse. Nothing else on any competing market looks like it.

---

### Steps

---

#### Step 0 — API Fixes (required before frontend can work end-to-end)

These are Express API changes, not frontend changes. They unblock the frontend completely. Do these first.

**0a. Add free public market endpoints**

File: `api/src/routes/markets.ts` — add two ungated routes. Register them in `api/src/index.ts` BEFORE `app.use(paymentMiddleware(...))`.

```typescript
// Add ungated read routes to markets.ts
router.get("/markets/public", async (_req, res) => {
  // same logic as GET /markets
});

router.get("/markets/:id/public", async (req, res) => {
  // same logic as GET /markets/:id
});
```

In `api/src/index.ts`, register the ungated router before the x402 middleware line:
```typescript
app.use(marketsPublicRouter); // free reads — before paymentMiddleware
app.use(paymentMiddleware(x402Routes, resourceServer));
app.use(marketsRouter);       // x402-gated reads (agent use only)
```

Frontend `page.tsx` and `market/[id]/page.tsx` Server Components use the `/public` variants.

**0b. Emit `"cap_hit"` SSE event from `bets.ts`**

The demo's signature moment requires a `"cap_hit"` event to appear in `AgentFeed` exactly when the wall is hit. Currently `bets.ts` returns an error JSON but never calls `emitEvent`.

File: `api/src/routes/bets.ts` — add `emitEvent` call in the cap-exceeded branch:

```typescript
if (humanExposure + amountBig > humanCap) {
  emitEvent("cap_hit", {
    marketId,
    wallet,
    humanExposure: humanExposure.toString(),
    humanCap: humanCap.toString(),
  });
  res.json({
    error: "human cap exceeded",
    humanExposure: humanExposure.toString(),
    humanCap: humanCap.toString(),
  });
  return;
}
```

---

#### Phase A — Scaffold & Configuration

**1. ✅ Next.js project — already initialized**

`frontend/` exists with Next.js 15, App Router, TypeScript, Tailwind v4. No action needed.

**2. Install missing dependencies**

Currently installed: `wagmi`, `viem`, `@tanstack/react-query`, `@worldcoin/idkit`. Missing:

```bash
cd frontend

# Connectors (WalletConnect + injected)
npm install @wagmi/connectors

# Fonts
npm install @fontsource-variable/syne @fontsource/ibm-plex-mono
```

No `x402` packages in frontend.

**3. Configure environment variables**

File: `frontend/.env.local` (gitignored — document schema in `.env.example`)

```bash
# Public (safe in bundle)
NEXT_PUBLIC_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_MARKET_ADDRESS=0x...
NEXT_PUBLIC_WLD_APP_ID=app_...
NEXT_PUBLIC_WLD_ACTION=register-human
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...

# Server-only (never NEXT_PUBLIC_)
RP_SIGNING_KEY=...
RP_ID=...           # required by rp-signature route (rp_id in IDKit context)
```

File: `frontend/.env.example` — commit this with placeholder values.

**3a. Add env validation helper**

File: `frontend/lib/env.ts`

```typescript
function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const env = {
  registryAddress: requireEnv("NEXT_PUBLIC_REGISTRY_ADDRESS") as `0x${string}`,
  marketAddress: requireEnv("NEXT_PUBLIC_MARKET_ADDRESS") as `0x${string}`,
  wldAppId: requireEnv("NEXT_PUBLIC_WLD_APP_ID") as `app_${string}`,
  wldAction: requireEnv("NEXT_PUBLIC_WLD_ACTION"),
  apiUrl: requireEnv("NEXT_PUBLIC_API_URL"),
  walletConnectProjectId: requireEnv("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID"),
  demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === "true",
} as const;

// Server-only — import only in route.ts files, never in client components
export function serverEnv() {
  return {
    rpSigningKey: requireEnv("RP_SIGNING_KEY"),
    rpId: requireEnv("RP_ID"),
  };
}
```

**4. Configure wagmi**

File: `frontend/lib/wagmi.ts`

```typescript
import { createConfig, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  transports: { [baseSepolia.id]: http() },
  connectors: [
    injected(),
    walletConnect({ projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID! }),
  ],
});
```

**5. Configure providers**

File: `frontend/app/providers.tsx` — `"use client"` wrapper

```typescript
"use client";
import { WagmiProvider } from "wagmi";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

File: `frontend/app/layout.tsx` — Root layout. Import Syne + IBM Plex Mono. Wrap with `<Providers>`. Set `<html lang="en" className="dark">`. Apply CSS custom properties for design tokens (defined in `globals.css`).

**6. Configure Tailwind + design tokens**

File: `frontend/app/globals.css`

Define CSS custom properties on `:root` for all design tokens (background, surface, accent, danger, text colors, font stacks). Configure Tailwind `@theme` block to expose these as utility classes.

No global card/shadow utilities — tokens only.

---

#### Phase B — ABIs & Contract Types

**7. Export contract ABIs**

Depends on: contracts compiled (Day 1 of 3-day plan).

File: `frontend/lib/abis/HumanRegistry.abi.json` — copy from `contracts/out/HumanRegistry.sol/HumanRegistry.json` (Foundry artifact). Extract `abi` array only.

File: `frontend/lib/abis/WorldMarket.abi.json` — same, from `WorldMarket.sol` artifact.

File: `frontend/lib/contracts.ts` — typed ABI objects + address constants.

```typescript
import HumanRegistryABI from "@/lib/abis/HumanRegistry.abi.json";
import WorldMarketABI from "@/lib/abis/WorldMarket.abi.json";

export const REGISTRY = {
  address: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS as `0x${string}`,
  abi: HumanRegistryABI,
} as const;

export const MARKET = {
  address: process.env.NEXT_PUBLIC_MARKET_ADDRESS as `0x${string}`,
  abi: WorldMarketABI,
} as const;
```

---

#### Phase C — Backend API Route (rp-signature)

**8. ✅ DONE — `rp-signature` route already implemented**

File: `frontend/app/api/rp-signature/route.ts` — complete. Do not recreate.

**Actual response shape** (differs from what was originally planned):
```json
{
  "rp_id": "<string>",
  "signature": "<string>",
  "nonce": "<string>",
  "created_at": "<string>",
  "expires_at": "<string>"
}
```

Note: the key is `signature` (not `sig`), and `rp_id` is included. `RpContext` imported directly from `@worldcoin/idkit` — this type already matches the actual response shape. No custom type guard needed.

Requires both `RP_SIGNING_KEY` **and** `RP_ID` env vars (see Step 3).

Verify: `curl -X POST http://localhost:3000/api/rp-signature -d '{"action":"register-human"}' -H 'Content-Type: application/json'` → returns `{ rp_id, signature, nonce, created_at, expires_at }`.

---

#### Phase D — Shared UI Components

**9. Build `ConnectWalletButton` component**

File: `frontend/components/ConnectWalletButton.tsx` — `"use client"`

Uses `useAccount`, `useConnect`, `useDisconnect` from wagmi v2. Shows shortened address when connected (`0xABCD…1234`). IBM Plex Mono for address display. No modal — inline button that cycles connect → disconnect.

**10. ⚠️ PARTIAL — Update `WorldIDButton` component**

File: `frontend/components/WorldIDButton.tsx` — exists, works, needs design pass.

**Actual props** (already implemented, do not change interface):
```typescript
{ onVerify: (result: IDKitResult) => void; walletAddress: `0x${string}`; action?: string }
```

`RpContext` is imported directly from `@worldcoin/idkit` — it already matches the actual `/api/rp-signature` response shape (`{ rp_id, signature, nonce, created_at, expires_at }`). No custom `parseRpContext` guard needed.

**What still needs doing on this component:**
- Brutalist button styling (sharp edges, `--color-accent` border, IBM Plex Mono text, hover state that shifts fill)
- Loading state while fetching `rp_context` from `/api/rp-signature`
- Error state when WorldID widget fails

**Do NOT recreate `lib/types/idkit.ts`** with a custom `RpContext` definition. The type is already exported from `@worldcoin/idkit`. Import it:

```typescript
import type { RpContext } from "@worldcoin/idkit";
```

**11. ⚠️ PARTIAL — Redesign `CapMeter` component**

File: `frontend/components/CapMeter.tsx` — exists, works logic-wise, needs full brutalist redesign.

**Actual props** (do not change interface):
```typescript
{ exposure: string; cap: string; label?: string }
```

Both `exposure` and `cap` are USDC base unit strings (6 decimals). The component converts to human-readable USD internally:
```typescript
const pct = (Number(BigInt(exposure) * 100n) / Number(BigInt(cap))); // avoid float on big ints
// or: const pct = Number(BigInt(exposure) * 10000n / BigInt(cap)) / 100;
const isMaxed = BigInt(exposure) >= BigInt(cap);
```

**Design spec (all missing, needs implementation):**
- Sharp rectangle, `border-radius: 0` — this is a data instrument, not a UI widget
- Fill bar in `--color-accent` (acid-yellow) that animates from current `pct` on prop change (`transition: width 400ms ease-out-quint`)
- When `isMaxed`: fill transitions to `--color-danger` (red), plays wall-slam animation (`transform: scaleX(1.02) → 1.0`, 150ms linear + red pulsing ring on right edge)
- Labels in IBM Plex Mono: `{pct.toFixed(1)}%` inside bar, `{(exposure/1e6).toFixed(2)} / {(cap/1e6).toFixed(2)} USDC` below in muted text
- Optional `label` prop shown above bar in Syne 700 small-caps (used by DemoCapMeters for human address)
- No box-shadow, no border-radius, 1px `--color-border` border on container

**12. ⚠️ PARTIAL — Redesign `AgentFeed` component**

File: `frontend/components/AgentFeed.tsx` — exists, works logic-wise, needs design pass and one correctness fix.

**Actual props** (do not change interface):
```typescript
{ apiUrl: string; marketId?: number }
```
`apiUrl` is required (callers pass `process.env.NEXT_PUBLIC_API_URL` from server props).

**Actual `BetEvent` shape** (from `api/src/routes/bets.ts` SSE emission):
```typescript
type BetEvent = {
  type: "bet" | "cap_hit" | "ping";
  marketId?: number;
  outcome?: boolean;
  amount?: string;
  wallet?: string;   // ← NOT "agent" or "human" — just "wallet"
  txHash?: string;
  timestamp: string; // ISO string added client-side (not in server payload)
};
```

**Critical correctness fix** — SSE stream uses **named events**. `onmessage` only fires for unnamed events (heartbeat pings). Must use:
```typescript
es.addEventListener("bet", (e: MessageEvent<string>) => { /* ... */ });
es.addEventListener("cap_hit", (e: MessageEvent<string>) => { /* ... */ });
```
`cap_hit` will fire after Step 0b is implemented in the API.

File: `frontend/lib/types/events.ts` — correct type guard:

```typescript
export type BetEvent = {
  type: "bet" | "cap_hit";
  marketId: number;
  outcome?: boolean;
  amount?: string;
  wallet?: string;
  txHash?: string;
  timestamp: string; // added client-side as new Date().toISOString()
};

export function isBetEvent(v: unknown): v is BetEvent {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    (o["type"] === "bet" || o["type"] === "cap_hit") &&
    typeof o["marketId"] === "number"
  );
}
```

**Design spec (needs implementation):**
- Monospace terminal aesthetic: IBM Plex Mono, very small text, max 50 events kept in state
- Each row pattern: `HH:MM:SS  0xWALLET…  YES  $1.00  ↳txHash`
- `cap_hit` events styled differently: red background strip, `🛑 CAP HIT` text, full-width
- New events slide in from top (CSS transition)
- Subtle `--color-border` separator between rows, no card backgrounds

---

#### Phase E — Pages

**13. ⚠️ PARTIAL — Redesign `/` (Market List page)**

File: `frontend/app/page.tsx` — Server Component, exists, works, needs design pass and one fix.

**Fix**: Change `fetch(${API_URL}/markets)` → `fetch(${API_URL}/markets/public)` (free endpoint added in Step 0a). The x402-gated `/markets` is for agents, not browser load.

Layout to implement:
- Full-page: header with `WORLDMARKET` wordmark (Syne 800, all-caps, huge), tagline in small caps.
- Market list: table layout, not card grid. Columns: `MARKET`, `YES`, `NO`, `VOLUME`, `STATUS`. IBM Plex Mono for all numbers. Clicking a row navigates to `/market/[id]`.
- `ConnectWalletButton` in top-right.
- Large typographic statement at bottom: **"ONE HUMAN. ONE VOTE."** in massive Syne 800, spanning full width, ~15vw size.

**14. Build `/register` — Registration page**

File: `frontend/app/register/page.tsx` — Server Component shell, `WorldIDButton` is client.

Flow:
1. User lands on `/register`.
2. `ConnectWalletButton` — must connect wallet first.
3. `WorldIDButton` — verify World ID. Calls `registerHuman` on HumanRegistry.
4. After `registerHuman` succeeds: show "Register an Agent" input. User pastes agent wallet address, calls `registerAgent(agentWallet)` via `useWriteContract`.
5. Success state: show registered principal address + agent address. Link to `/market/0`.

States:
- `wallet-disconnected`: Show connect prompt. `WorldIDButton` disabled.
- `wallet-connected-unregistered`: Show `WorldIDButton` active. Step counter: 1 of 3.
- `registered-no-agent`: Show agent registration form. Step counter: 2 of 3.
- `registered-with-agent`: Show success, link to market.

Transaction feedback: use `useWaitForTransactionReceipt` from wagmi to show pending/confirmed states. No modals — inline status within the page.

Read registration status: `useReadContract` to call `humanOf(address)` on HumanRegistry. If non-zero, user is registered.

**15. ⚠️ PARTIAL — Redesign `/market/[id]` (Market Detail page)**

File: `frontend/app/market/[id]/page.tsx` — Server Component shell, exists, logic partially works.

**Correctness fixes needed:**

1. **Server-side fetch**: Change from `/markets/:id` to `/markets/:id/public` (free endpoint from Step 0a).

2. **Live `humanCap` read**: Currently hardcoded as `"2000000"`. Replace with `useReadContract` on `WorldMarket.perHumanCap()`. The value is a `bigint` from the contract; convert to string with `.toString()` when passing to `CapMeter`.

3. **Live `humanExposure` read**: Currently uses `totalPool` as proxy. Replace with `useReadContract` on `WorldMarket.humanExposure(marketId, connectedAddress)`. Wrap this in a client island — the connected wallet address is only available client-side.

4. **`CapMeter` prop types**: Pass `exposure` and `cap` as decimal strings (USDC base-6 units). The conversion from `bigint` (returned by wagmi's `useReadContract`) to string:
   ```typescript
   exposure={exposureData?.toString() ?? "0"}
   cap={capData?.toString() ?? "0"}
   ```

5. **`AgentFeed` prop**: Pass `apiUrl` explicitly — it's required:
   ```tsx
   <AgentFeed apiUrl={process.env.NEXT_PUBLIC_API_URL!} marketId={id} />
   ```

**Client island component needed** (`frontend/components/MarketIsland.tsx`):
- Takes `marketId: number` as prop
- Uses `useAccount` to get wallet address
- `useReadContract` for `humanExposure` + `useReadContract` for `perHumanCap` (both with `query: { refetchInterval: 3000 }`)
- Renders `<CapMeter>` and `<AgentFeed>` with correct props
- Renders `<PlaceBetForm>` (new component — calls `WorldMarket.bet()` directly via `useWriteContract`)

**`PlaceBetForm` component** (new, inline in MarketIsland or separate file):
- Two buttons: YES / NO — select active direction
- Amount input (number, default 1 USDC)
- Submit calls `useWriteContract` → `WorldMarket.bet(marketId, outcome, amount * 1e6)`
- Disabled when `exposure >= cap`
- `useWaitForTransactionReceipt` shows pending/confirmed inline state

Layout:
- Left: Market name (Syne 800, large), current YES/NO probabilities as large fractions (IBM Plex Mono)
- Center: `CapMeter` — full width, prominently placed. **This IS the product.**
- Right: `AgentFeed` — live stream, 50-line buffer
- Bottom: `PlaceBetForm` — minimal, two buttons (YES / NO), amount input, submit



---

#### Phase F — Dev Infrastructure

**16. Mock API for standalone development**

File: `frontend/lib/mockData.ts`

Export typed mock market objects. Use when `NEXT_PUBLIC_API_URL` is undefined.

File: `frontend/lib/api.ts` — thin wrapper around `fetch` with `NEXT_PUBLIC_API_URL` prefix. Falls back to mock data if URL is not set.

**17. Verify contract ABI types**

Run `wagmi generate` (if using `wagmi CLI`) or manually verify ABI JSON matches deployed contract selectors. Confirm `perHumanCap()`, `humanExposure(uint256, address)`, `bet(uint256, bool, uint256)` are present in `WorldMarket.abi.json`.

---

#### Phase G — Demo Simulation Mode (no real users required)

Goal: run the full CapMeter demo — multiple humans, multiple agents, live feed, cap-hit moment — without any Orb-verified World IDs. Achieved by: (a) a `DevHumanRegistry` contract that skips ZK proof verification, (b) a `demoOrchestrator.ts` that drives N concurrent agent loops from pre-registered sim wallets.

**18. Deploy `DevHumanRegistry.sol`**

File: `contracts/src/DevHumanRegistry.sol` — testnet only, never mainnet.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Demo-only registry. No World ID proof required.
/// @notice NEVER deploy to mainnet — add a mainnet guard if paranoid.
contract DevHumanRegistry {
    mapping(address => uint256) public nullifierOf;
    mapping(address => address[]) public agentsOf;
    mapping(address => address) public principalForAgent;

    uint256 private _nextNullifier = 1;

    function registerHumanDev(address wallet) external {
        require(nullifierOf[wallet] == 0, "already registered");
        nullifierOf[wallet] = _nextNullifier++;
    }

    function registerAgent(address agentWallet) external {
        require(nullifierOf[msg.sender] != 0, "not a registered human");
        require(principalForAgent[agentWallet] == address(0), "agent already registered");
        require(nullifierOf[agentWallet] == 0, "wallet is a registered human");
        principalForAgent[agentWallet] = msg.sender;
        agentsOf[msg.sender].push(agentWallet);
    }

    function humanOf(address wallet) public view returns (address) {
        if (nullifierOf[wallet] != 0) return wallet;
        if (principalForAgent[wallet] != address(0)) return principalForAgent[wallet];
        return address(0);
    }
}
```

Satisfies the same `humanOf` interface `WorldMarket.sol` calls. Point `WorldMarket` at this address for demo deploys.

**19. Write `DeployDev.s.sol`**

File: `contracts/script/DeployDev.s.sol`

1. Deploys `DevHumanRegistry` + `WorldMarket` (pointing at DevRegistry, `perHumanCap = 5e6` USDC — 5 USDC cap so bets fill the meter in ~5 rounds at $1/bet).
2. Registers `SIM_HUMAN_COUNT = 3` deterministic sim human addresses via `registerHumanDev`.
3. Registers 2 agent wallets per sim human via `registerAgent`.
4. Writes `contracts/demo-wallets.json` via `vm.writeFile`.

Private keys for sim wallets are derived from known seeds (`keccak256("sim-human-0")`, etc.) — throwaway testnet keys only.

`forge script contracts/script/DeployDev.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast`

Output: `contracts/demo-wallets.json` (schema below). **Add to `.gitignore`.**

```json
{
  "registry": "0x...",
  "market": "0x...",
  "perHumanCap": "5000000",
  "humans": ["0x...", "0x...", "0x..."],
  "agents": [
    { "privateKey": "0x...", "address": "0x...", "humanAddress": "0x..." },
    { "privateKey": "0x...", "address": "0x...", "humanAddress": "0x..." },
    { "privateKey": "0x...", "address": "0x...", "humanAddress": "0x..." },
    { "privateKey": "0x...", "address": "0x...", "humanAddress": "0x..." },
    { "privateKey": "0x...", "address": "0x...", "humanAddress": "0x..." },
    { "privateKey": "0x...", "address": "0x...", "humanAddress": "0x..." }
  ]
}
```

**20. Write `agent/src/demoOrchestrator.ts`**

File: `agent/src/demoOrchestrator.ts`

Reads `demo-wallets.json`. Spawns one async loop per agent wallet concurrently. Each loop:
1. Reads current `humanExposure` via `readContract` from viem to know remaining headroom.
2. Picks bet direction (weighted random, configurable).
3. Calls `WorldMarket.bet(marketId, outcome, amount)` via viem `writeContract` — direct contract call, no x402 required for demo. (Agents need only testnet ETH for gas, not USDC, if you make bet collateral optional for demo — see note below.)
4. Sleeps `INTERVAL_MS` (default 2000ms) + ±500ms random jitter.
5. Stops when `humanExposure >= perHumanCap`.

```typescript
// agent/src/demoOrchestrator.ts
import { createWalletClient, http, createPublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import demoWallets from "../../contracts/demo-wallets.json";
import WorldMarketABI from "../../contracts/out/WorldMarket.sol/WorldMarket.json";

const MARKET_ID = 0n;
const BET_AMOUNT = 1_000_000n; // 1 USDC (6 decimals)
const INTERVAL_MS = 2000;

type AgentConfig = {
  privateKey: `0x${string}`;
  address: `0x${string}`;
  humanAddress: `0x${string}`;
};

async function runAgent(cfg: AgentConfig, publicClient: ReturnType<typeof createPublicClient>): Promise<void> {
  const account = privateKeyToAccount(cfg.privateKey);
  const walletClient = createWalletClient({ account, transport: http(), chain: baseSepolia });

  while (true) {
    const exposure = await publicClient.readContract({
      address: demoWallets.market as `0x${string}`,
      abi: WorldMarketABI.abi,
      functionName: "humanExposure",
      args: [MARKET_ID, cfg.humanAddress],
    }) as bigint;

    const cap = BigInt(demoWallets.perHumanCap);
    if (exposure >= cap) {
      console.log(`🛑 [${cfg.address.slice(0, 8)}] Human cap hit`);
      return;
    }

    const outcome = Math.random() > 0.5;
    await walletClient.writeContract({
      address: demoWallets.market as `0x${string}`,
      abi: WorldMarketABI.abi,
      functionName: "bet",
      args: [MARKET_ID, outcome, BET_AMOUNT],
    });

    console.log(`[${cfg.address.slice(0, 8)}] bet ${outcome ? "YES" : "NO"} $1`);
    await new Promise(r => setTimeout(r, INTERVAL_MS + Math.random() * 500));
  }
}

async function main(): Promise<void> {
  const publicClient = createPublicClient({ transport: http(), chain: baseSepolia });
  const agents = demoWallets.agents as AgentConfig[];
  await Promise.allSettled(agents.map(a => runAgent(a, publicClient)));
  console.log("All sim agents finished.");
}

main().catch(console.error);
```

**Note on USDC collateral**: If `WorldMarket.bet()` requires USDC transfer, fund each agent address with testnet USDC from `MockUSDC` (mint in `DeployDev.s.sol`) and approve `WorldMarket` to spend it. Add `MockUSDC.mint(agentAddress, 100e6)` + `MockUSDC.approve(marketAddress, MaxUint256)` per agent in the deploy script.

**21. Add `NEXT_PUBLIC_DEMO_MODE` flag to frontend**

When `env.demoMode === true`:
- `/register` page shows a banner: `DEMO MODE — World ID skipped`.
- `WorldIDButton` is replaced by `DemoRegisterButton` which calls `DevHumanRegistry.registerHumanDev(address)` directly via `useWriteContract`. No IDKit, no `rp_context`.
- `/market/[id]` renders `<DemoCapMeters>` instead of a single `<CapMeter>`.

Add to `.env.local` for demo:
```bash
NEXT_PUBLIC_DEMO_MODE=true
NEXT_PUBLIC_DEV_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_DEMO_HUMANS=0x...,0x...,0x...   # comma-separated, copied from demo-wallets.json
```

Update `lib/env.ts`:
```typescript
demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === "true",
devRegistryAddress: process.env.NEXT_PUBLIC_DEMO_MODE === "true"
  ? (requireEnv("NEXT_PUBLIC_DEV_REGISTRY_ADDRESS") as `0x${string}`)
  : null,
demoHumans: process.env.NEXT_PUBLIC_DEMO_HUMANS?.split(",") as `0x${string}`[] | undefined,
```

File: `frontend/components/DemoRegisterButton.tsx` — `"use client"`. Calls `DevHumanRegistry.registerHumanDev(connectedAddress)`. Used only when `env.demoMode`.

**22. Build `DemoCapMeters` component**

File: `frontend/components/DemoCapMeters.tsx` — `"use client"`.

Props: `{ marketId: number }`. Reads `env.demoHumans`. For each human address, renders a labeled `CapMeter` (reuses Step 11 component). Each meter polls `humanExposure` every 1s via `useReadContract`.

```typescript
"use client";
import { env } from "@/lib/env";
import { CapMeter } from "./CapMeter";
import { useReadContract } from "wagmi";
import { MARKET } from "@/lib/contracts";

export function DemoCapMeters({ marketId }: { marketId: number }) {
  const humans = env.demoHumans ?? [];
  return (
    <div className="flex flex-col gap-4">
      {humans.map((human) => (
        <HumanMeter key={human} marketId={marketId} human={human} />
      ))}
    </div>
  );
}

function HumanMeter({ marketId, human }: { marketId: number; human: `0x${string}` }) {
  const { data: exposure } = useReadContract({
    ...MARKET,
    functionName: "humanExposure",
    args: [BigInt(marketId), human],
    query: { refetchInterval: 1000 },
  });
  const { data: cap } = useReadContract({ ...MARKET, functionName: "perHumanCap" });

  if (exposure === undefined || cap === undefined) return null;
  // CapMeter takes string props (USDC base-6 units), not bigints
  return (
    <CapMeter
      exposure={(exposure as bigint).toString()}
      cap={(cap as bigint).toString()}
      label={`${human.slice(0, 6)}…${human.slice(-4)}`}
    />
  );
}
```

**Demo cold-start sequence (zero real users)**:

```bash
# 1. Deploy (once)
cd contracts && forge script script/DeployDev.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast

# 2. Copy addresses to frontend/.env.local
#    NEXT_PUBLIC_DEMO_MODE=true
#    NEXT_PUBLIC_DEV_REGISTRY_ADDRESS=<registry from demo-wallets.json>
#    NEXT_PUBLIC_MARKET_ADDRESS=<market from demo-wallets.json>
#    NEXT_PUBLIC_DEMO_HUMANS=<humans joined by comma>

# 3. Fund agents with testnet ETH (gas) and mock USDC (handled in deploy script)

# 4. Start API
cd api && npm run dev

# 5. Start frontend
cd frontend && npm run dev

# 6. Run orchestrator
cd agent && npx ts-node src/demoOrchestrator.ts
```

Expected: three `CapMeter` bars animate from 0 → 100% in ~30 seconds. Each slams the red wall. `AgentFeed` shows all bets live. Fully reproducible from cold start in < 5 minutes.

---

### Verification

| Step | Signal |
|---|---|
| Step 1–4 completed | `next dev` starts at `localhost:3000` with no TS errors; `tsc --noEmit` passes with all strict flags |
| Step 5 (providers) | React tree has WagmiProvider; DevTools show correct chain (`baseSepolia`) |
| Step 6 (tokens) | Custom property `--color-accent` resolves to `oklch(88% 0.25 120)` in browser DevTools |
| Step 7 (ABIs) | `ts-node` can import `REGISTRY.abi` and call `REGISTRY.address` without type errors |
| Step 8 (rp-signature) | `curl -X POST localhost:3000/api/rp-signature -d '{"action":"register-human"}'` returns `{ rp_id, signature, nonce, created_at, expires_at }` |
| Step 9 (ConnectWallet) | MetaMask connectable; account address shows truncated in header |
| Step 10 (WorldIDButton) | Simulator at `simulator.worldcoin.org` completes flow; `handleVerify` receives proof object with `merkle_root`, `nullifier_hash`, `proof` |
| Step 10 (registerHuman tx) | Base Sepolia Etherscan shows `registerHuman()` tx confirmed; `humanOf(wallet)` returns non-zero |
| Step 11 (CapMeter) | Renders acid-yellow fill from 0 to N%; at 100%, red wall appears + CSS animation plays |
| Step 12 (AgentFeed) | With agent running (`node agent/src/index.ts`), events appear in real-time in AgentFeed list |
| Step 13 (market list) | `/` loads, shows at least one market row; row click navigates to `/market/0` |
| Step 14 (register page) | Full flow: connect → verify → register agent → success screen. `humanOf` returns principal address on-chain. |
| Step 15 (market detail) | CapMeter shows current agent exposure; `AgentFeed` shows live events; `PlaceBetForm` submits a bet TX |
| Full demo | Terminal agent runs → `AgentFeed` shows bets → `CapMeter` fills → agent logs `🛑 Human cap hit — stopping` → `CapMeter` shows red wall. No new features after this point. |
| Steps 18–19 (DevRegistry) | `forge test --match-contract DevHumanRegistry` passes; `demo-wallets.json` generated with 3 humans × 2 agents |
| Step 20 (orchestrator) | `npx ts-node agent/src/demoOrchestrator.ts` runs; BaseScan shows 6 bet txs from sim agent wallets |
| Steps 21–22 (demo mode) | `NEXT_PUBLIC_DEMO_MODE=true npm run dev` → `/market/0` shows 3 `CapMeter` bars; all fill and slam red wall |
| Full demo (no real users) | Three meters fill in sequence, `AgentFeed` live, all hit wall. Reproducible from cold start in < 5 min. |

---

### Environment Variable Checklist (before testing)

- [ ] `NEXT_PUBLIC_WLD_APP_ID` — from World Developer Portal
- [ ] `NEXT_PUBLIC_WLD_ACTION` — matches action registered in Portal (e.g. `register-human`)
- [ ] `RP_SIGNING_KEY` — from World Developer Portal, server-only
- [ ] `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` — from cloud.walletconnect.com
- [ ] `NEXT_PUBLIC_REGISTRY_ADDRESS` — deployed proxy address on Base Sepolia
- [ ] `NEXT_PUBLIC_MARKET_ADDRESS` — deployed WorldMarket proxy address on Base Sepolia
- [ ] `NEXT_PUBLIC_API_URL` — Express server URL (local: `http://localhost:3001`)

**Demo mode only** (add when `NEXT_PUBLIC_DEMO_MODE=true`):
- [ ] `NEXT_PUBLIC_DEMO_MODE=true`
- [ ] `NEXT_PUBLIC_DEV_REGISTRY_ADDRESS` — `DevHumanRegistry` deployed address (from `demo-wallets.json`)
- [ ] `NEXT_PUBLIC_DEMO_HUMANS` — comma-separated sim human addresses from `demo-wallets.json`

---

### File Manifest

```
frontend/
├── .env.local                         # gitignored — all actual secrets
├── .env.example                       # committed — schema with placeholders
├── app/
│   ├── layout.tsx                     # root layout, Providers, font imports
│   ├── globals.css                    # CSS tokens, Tailwind theme
│   ├── page.tsx                       # Step 13: market list (Server Component)
│   ├── providers.tsx                  # Step 5: WagmiProvider + QueryClientProvider
│   ├── api/
│   │   ├── rp-signature/route.ts      # Step 8: World ID request signing
│   │   └── markets/route.ts           # Step 13 Option B: x402 proxy (if chosen)
│   ├── register/
│   │   └── page.tsx                   # Step 14: World ID registration flow
│   └── market/
│       └── [id]/
│           └── page.tsx               # Step 15: market detail + CapMeter + AgentFeed
├── components/
│   ├── ConnectWalletButton.tsx        # Step 9
│   ├── WorldIDButton.tsx              # Step 10
│   ├── CapMeter.tsx                   # Step 11 — THE product moment
│   ├── AgentFeed.tsx                  # Step 12 — SSE live feed
│   ├── PlaceBetForm.tsx               # Step 15 (inline)
│   ├── DemoRegisterButton.tsx         # Step 21 — demo mode only, no ZK proof
│   └── DemoCapMeters.tsx              # Step 22 — multi-meter view for demo
└── lib/
    ├── wagmi.ts                       # Step 4: wagmi config
    ├── contracts.ts                   # Step 7: ABI imports + address constants
    ├── env.ts                         # Step 3a: typed env helper + requireEnv()
    ├── api.ts                         # Step 16: API wrapper with mock fallback
    ├── mockData.ts                    # Step 16: dev mocks
    ├── types/
    │   ├── idkit.ts                   # RpContext type + parseRpContext guard
    │   └── events.ts                  # BetEvent type + isBetEvent guard
    └── abis/
        ├── HumanRegistry.abi.json     # Step 7: from Foundry artifact
        ├── WorldMarket.abi.json       # Step 7: from Foundry artifact
        └── DevHumanRegistry.abi.json  # Step 18: demo registry ABI (demo mode only)
contracts/
├── src/
│   └── DevHumanRegistry.sol          # Step 18: testnet-only no-ZK registry
├── script/
│   └── DeployDev.s.sol               # Step 19: deploys + seeds demo wallets
└── demo-wallets.json                  # Step 19: GITIGNORED — testnet keys + addresses
agent/
└── src/
    └── demoOrchestrator.ts            # Step 20: concurrent sim agent loops

---

*WorldMarket Frontend — Hackathon build · Next.js 15 + wagmi v2 + IDKit v4.x · Base Sepolia*

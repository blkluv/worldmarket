# WorldMarket — Pre-Build Research Report
**Date:** March 27, 2026 | Researched live against official docs & npm

---

## 1. World ID Current State (March 2026)

### Package & Version

| Package | Current Version | Notes |
|---|---|---|
| `@worldcoin/idkit` (React) | **4.0.11** (published March 26, 2026) | Still the right package. API changed significantly. |
| `@worldcoin/idkit-core` (Vanilla JS) | 4.x | Use for non-React environments |
| `@worldcoin/idkit-standalone` | **DISCONTINUED** | Do not use. Replaced by `@worldcoin/idkit-core`. |

### What Changed in IDKit 4.x (Breaking)

1. **React widget renamed**: `IDKitWidget` → **`IDKitRequestWidget`**
   ```tsx
   // WRONG (v3 / old)
   import { IDKitWidget } from "@worldcoin/idkit";

   // CORRECT (v4, current)
   import { IDKitRequestWidget, orbLegacy } from "@worldcoin/idkit";
   
   // Widget now requires preset prop:
   <IDKitRequestWidget
     open={open}
     onOpenChange={setOpen}
     app_id="app_xxxxx"
     action="my-action"
     rp_context={rpContext}          // ← REQUIRED, new in v4
     allow_legacy_proofs={true}      // ← set true during migration phase
     preset={orbLegacy({ signal: walletAddress })}  // ← REQUIRED, new in v4
     onSuccess={(result) => { ... }}
     handleVerify={async (result) => { ... }}
   />
   ```

2. **`rp_context` is now required** on every request. You must generate it on your backend with `signRequest`:
   ```typescript
   // api/rp-signature/route.ts (Next.js App Router)
   import { signRequest } from "@worldcoin/idkit/signing";
   
   export async function POST(request: Request) {
     const { action } = await request.json();
     const { sig, nonce, createdAt, expiresAt } = signRequest(action, process.env.RP_SIGNING_KEY!);
     return Response.json({ sig, nonce, created_at: createdAt, expires_at: expiresAt });
   }
   ```

3. **Verify endpoint changed**: v4 proofs verify via `POST /api/v4/verify/{rp_id}` (Developer Portal API). The old `/api/v1/verify` is legacy.

4. **Hook API** (alternative to widget):
   ```tsx
   import { useIDKitRequest, orbLegacy } from "@worldcoin/idkit";
   const flow = useIDKitRequest({ app_id, action, rp_context, preset: orbLegacy({ signal }) });
   // flow.open, flow.isAwaitingUserConnection, flow.isAwaitingUserConfirmation
   ```

### World ID 4.0 Migration Status

> **4.0 is NOT fully released.** The official docs label it "Coming Soon" with a phased migration timeline.

| Phase | Dates | What's available |
|---|---|---|
| Phase 1 (Migration) | Now → **June 1, 2026** | v3 + v4 proofs both work. Use `allow_legacy_proofs: true`. |
| Phase 2 (Transition) | June 1, 2026 → March 31, 2027 | New users get v4 only. Old users migrated. |
| Phase 3 (v3 Cut-off) | From April 1, 2027 | v3 proofs no longer generated. |

**Hackathon implication:** You are in Phase 1 right now. Both v3 and v4 proofs can be generated. Set `allow_legacy_proofs: true` in IDKit. Use the `WorldIDRouter.verifyProof()` path on-chain (v3 legacy). This is the **correct and supported approach** for the hackathon.

### Critical Nullifier Gotcha (v4 breaking semantic)

In v3, nullifiers were **persistent identifiers** for a user across sessions.
In v4, nullifiers are **one-time-use** replay tokens. The stable cross-session identifier is now `session_id`.

**Impact on HumanRegistry.sol:** Your contract uses `usedNullifiers[nullifierHash]` for replay protection. This is CORRECT for v3 uniqueness proofs. Don't use the nullifierHash as a stable user identifier in application logic — store the associated wallet instead (you're already doing this: `principalOf[nullifierHash] = msg.sender`). This is fine.

### Simulator Status

**`simulator.worldcoin.org` is working** as of March 27, 2026.

There is a notice on the simulator: *"This simulator will change with the adoption of World ID 4.0."* — but it currently works for testing. Set `environment: "staging"` in IDKit config when using the simulator.

### WorldIDRouter on Base Sepolia

✅ **`0x42FF98C4E85212a5D31358ACbFe76a621b50fC02` is confirmed correct** in the official docs table as of today.

Base mainnet router: `0xBCC7e591...4163` (for reference).

### WorldIDVerifier.sol (v4 on-chain)

⚠️ **Still in preview, NOT deployed to mainnet.** The official docs say:
> `WorldIDVerifier` is currently in preview and not yet deployed to mainnet. The interface below may change before release.

The v4 interface is different (`uint256[5]` proof vs `uint256[8]` proof). Your plan to use the v3 legacy path for the hackathon is correct.

---

## 2. Coinbase x402 Current State — ⚠️ CRITICAL: BREAKING CHANGES

### Package Names Changed

The plan uses `x402-fetch@1.1.0` and `x402-express@1.1.0`. **These packages are dead.** They are legacy v1, last published ~3 months ago. The current packages are under the `@x402/` org scope.

| Old (v1, DO NOT USE) | New (v2, USE THIS) | Latest Version |
|---|---|---|
| `x402-fetch` | `@x402/fetch` | **2.8.0** (published March 23, 2026) |
| `x402-express` | `@x402/express` | **2.8.0** (published March 23, 2026) |
| `x402-axios` | `@x402/axios` | 2.8.0 |
| (new) | `@x402/core` | 2.8.0 |
| (new) | `@x402/evm` | 2.8.0 |

### Agent Client (Buyer) — `@x402/fetch`

The `wrapFetchWithPayment` function name stayed the same, but **the second argument changed completely**:

```typescript
// ❌ OLD v1 (x402-fetch@1.1.0) — WILL NOT INSTALL
import { wrapFetchWithPayment } from "x402-fetch";
import { createWalletClient, http } from "viem";
const walletClient = createWalletClient({ account, transport: http(), chain: baseSepolia });
const agentFetch = wrapFetchWithPayment(fetch, walletClient);  // WalletClient ← OLD

// ✅ NEW v2 (@x402/fetch@2.8.0) — CORRECT
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`);
// NOTE: Just privateKeyToAccount — NOT createWalletClient. No chain/transport needed.

const client = new x402Client();
client.register("eip155:*", new ExactEvmScheme(signer));  // "*" = all EVM chains

const agentFetch = wrapFetchWithPayment(fetch, client);  // x402Client ← NEW

// Usage unchanged:
const market = await agentFetch(`/markets/0`).then(r => r.json());
```

There's also a convenience wrapper:
```typescript
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
const agentFetch = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: "eip155:84532", client: new ExactEvmScheme(signer) }],
});
```

### API Server (Seller) — `@x402/express`

Route config format and middleware signature both changed:

```typescript
// ❌ OLD v1 (x402-express@1.1.0) — dead
import { paymentMiddleware, FacilitatorConfig } from "x402-express";
app.use(paymentMiddleware(facilitatorConfig, {
  "GET /markets": { price: "$0.001", network: "base-sepolia", ... },
}));

// ✅ NEW v2 (@x402/express@2.8.0)
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";

const facilitatorClient = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });

app.use(
  paymentMiddleware(
    {
      "GET /markets": {
        accepts: [{
          scheme: "exact",
          price: "$0.001",
          network: "eip155:84532",   // ← CAIP-2 format, not "base-sepolia"
          payTo: process.env.PAYMENT_RECIPIENT,
        }],
        description: "List markets",
        mimeType: "application/json",
      },
      "POST /markets/:id/bet": {
        accepts: [{ scheme: "exact", price: "$0.01", network: "eip155:84532", payTo: process.env.PAYMENT_RECIPIENT }],
        description: "Place bet",
      },
      // ... etc
    },
    new x402ResourceServer(facilitatorClient)
      .register("eip155:84532", new ExactEvmScheme()),
      // Note: can use "eip155:*" for all EVM chains
  ),
);
```

### Key Differences Summary

| Concern | v1 | v2 |
|---|---|---|
| Package | `x402-fetch`, `x402-express` | `@x402/fetch`, `@x402/express` |
| Protocol version | `x402Version: 1` payloads | `x402Version: 2` payloads |
| Buyer signer type | viem `WalletClient` (full w/ chain+transport) | `privateKeyToAccount` result (no chain/transport) |
| Network format | `"base-sepolia"` string | `"eip155:84532"` CAIP-2 |
| Server setup | `paymentMiddleware(facilitatorConfig, routes)` | `paymentMiddleware(routes, resourceServer)` |
| Route `accepts` | flat `{ price, network }` | array of `{ scheme, price, network, payTo }` |

### Gotcha: v1 and v2 servers are not cross-compatible
A v2 client talking to a v1 server (or vice versa) will fail. The payment header format changed (`x402Version: 2` vs `x402Version: 1`). Build everything in v2 from the start.

---

## 3. Base Sepolia — WorldIDRouter Address

**`0x42FF98C4E85212a5D31358ACbFe76a621b50fC02` — CONFIRMED** in live official docs (today, March 27, 2026).

This is listed in the table at `docs.world.org/world-id/idkit/onchain-verification`:
> Base | Testnet: 0x42FF98C4…C02 → links to sepolia.basescan.org

No reported issues with this address as of today. It is currently live on Base Sepolia.

### Other Active Base Sepolia Info
- Base Sepolia chain ID: `84532` → CAIP-2: `eip155:84532`
- x402 testnet facilitator: `https://x402.org/facilitator` (supports Base Sepolia and Solana devnet)
- Base Sepolia RPC (free): `https://sepolia.base.org`

---

## 4. Prediction Market Sybil Resistance — Known Attacks & Edge Cases

### Per-Human Betting Cap: Known Attack Vectors

**Attack A — Late Registration (Most Relevant)**
A bad actor registers many wallets with a single Orb-verified World ID *before* depositing any collateral, waits until a market is almost closed (directional outcome clear), then registers all agent wallets and bets the cap times N agents. This is different from multi-wallet Sybil — the attacker uses the legitimate cap N times.

**Mitigation in your design:** The `agentsOf` mapping means registering an agent wallet links it to your human principal. The per-human cap in `WorldMarket.sol` checks `humanExposure[marketId][human]` and increments it, so all agents for a given principal share one cap. Registering 100 agents and betting from all 100 still uses one cap — this is your core mechanic and it works correctly.

**Attack B — Social/Collusion Sybil (Out of Scope for Hackathon)**
A well-resourced attacker recruits verified humans at scale (pay-to-orb). Each person gets their own cap. This cannot be stopped with on-chain identity alone. Standard market microstructure (AMM price impact) is your defense.

**Attack C — Agent Registration Race Before Market Close**
An attacker pre-registers as a human (only once), waits for near-certainty on an outcome, then registers all their own wallets *as agents* right before the registration deadline. Then bets from one agent (cap enforced). This doesn't exploit your cap — the human cap still applies regardless of when agents are registered.

**The real concern:** is there a way to register *as a human* multiple times? No — `usedNullifiers[nullifierHash]` prevents the same World ID from registering twice. This is solid.

### Edge Case: Registration vs. Bet Timing

If you allow agents to be registered *after* market creation, there's no latent risk from that alone — the human cap still collapses all agent exposure. The only meaningful window to close is if you add a "new human registrations after market creation" rule — but you don't need that mechanically; you need it only if you want to prevent someone getting Orb-verified after seeing outcomes.

**Recommendation for hackathon:** Add a minimal guard: `require(block.timestamp < market.deadline, "market closed")` to `registerHuman()` or at minimum to `registerAgent()`. This prevents "register 5 minutes before resolution." Even this is low priority for the demo — focus on the core mechanic.

### Edge Case: nullifierHash as msg.sender Signal

Your `registerHuman` uses `abi.encodePacked(msg.sender).hashToField()` as the signal hash. This binds the proof to the caller's address — a proof generated for wallet A cannot be replayed to register wallet B. This is correct and important; keep it.

---

## 5. x402 + AI Agent Pattern — Current Best Practice

### Recommended Pattern (v2)

The viem `WalletClient` approach in the original plan is **v1 only**. In v2, the agent wallet setup is simpler:

```typescript
// agent/src/x402Client.ts
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`);

const client = new x402Client();
client.register("eip155:*", new ExactEvmScheme(signer));
// "eip155:*" wildcard means it handles any EVM chain — Base Sepolia included.

export const agentFetch = wrapFetchWithPayment(fetch, client);
```

**No `createWalletClient`, no `chain: baseSepolia`, no `transport: http()` needed.** The scheme handles chain-specific signing internally.

### Error Handling for the "cap hit" demo moment

The x402 client throws (not returns) on certain failures. The `human cap exceeded` error will come from the API server (HTTP 200 with `{ error: "human cap exceeded" }`) — this is your application logic, not a 402-level error. The x402 client will have already paid. Structure your agent loop to check for the cap error in the response body:

```typescript
const result = await agentFetch(`/markets/0/bet`, { method: "POST", body: "..." }).then(r => r.json());
if (result.error === "human cap exceeded") {
  console.log("🛑 Human cap hit — stopping");
  process.exit(0);
}
```

### Known Issues with Agent Pattern

1. **No built-in retry on insufficient USDC balance** — the x402 client will throw. Pre-fund the agent wallet with enough testnet USDC to cover all expected bets + some buffer.
2. **Race condition with `Payment already attempted`** — if you retry on network error while a previous payment is in-flight, the v2 client throws `"Payment already attempted"`. Add explicit `try/catch` with delay before retry.
3. **USDC approval** — on first use, the agent wallet needs to `approve` the facilitator to spend USDC. The official facilitator handles this, but testnet USDC from a mock ERC20 may need manual approval. Consider `MockUSDC.approve(facilitatorAddress, MaxUint256)` in your setup script.

---

## 6. UUPS Proxy Pattern Gotchas (Foundry Hackathon)

### The One That Always Bites

**Forget `_authorizeUpgrade` → contract is bricked.**

With OZ UUPS, the upgrade authorization lives in the implementation contract:
```solidity
// HumanRegistry.sol (behind UUPS proxy)
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract HumanRegistry is UUPSUpgradeable, OwnableUpgradeable {
    function initialize(address worldIdRouter, address initialOwner) external initializer {
        __UUPSUpgradeable_init();
        __Ownable_init(initialOwner);
        worldIdRouter = IWorldID(worldIdRouter);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
    // ↑ Without this override, upgrades revert. It MUST be present.
}
```

### `initializer` vs Constructor

Never use `constructor` for initialization on upgradeable contracts. All setup goes in `initialize()` with the `initializer` modifier. `immutable` state variables cannot be used in upgradeable contracts — use regular storage variables set in `initialize`.

**The `immutable` gotcha is directly relevant to your plan**: the plan has `IWorldID public immutable worldIdRouter`. This will NOT work with UUPS proxy. Make it a regular storage variable:
```solidity
// ❌ WRONG for upgradeable
IWorldID public immutable worldIdRouter;

// ✅ CORRECT for upgradeable  
IWorldID public worldIdRouter;  // set in initialize()
```

### Foundry Deploy Script Pattern

```solidity
// script/Deploy.s.sol
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast();
        
        // 1. Deploy implementation
        HumanRegistry impl = new HumanRegistry();
        
        // 2. Encode initializer call
        bytes memory data = abi.encodeCall(
            HumanRegistry.initialize,
            (WORLD_ID_ROUTER, msg.sender)
        );
        
        // 3. Deploy proxy
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), data);
        
        console.log("Proxy:", address(proxy));
        console.log("Impl:", address(impl));
        
        vm.stopBroadcast();
    }
}
```

### Storage Collision

Inserting new state variables between existing ones in a later implementation will collide with existing storage. For a hackathon, just append new variables at the end. Use [`@openzeppelin/contracts-upgradeable`](https://github.com/OpenZeppelin/openzeppelin-contracts-upgradeable) — the upgradeable variants handle storage gaps for base contracts via `__gap`.

### Storage Gap

If you inherit from a base upgradeable contract you wrote yourself, add a storage gap or you'll collide on upgrade:
```solidity
uint256[50] private __gap;  // at end of every upgradeable base contract
```

### Foundry Test Fork Pattern

To test upgradeability, use Foundry's `vm.prank` + `upgrades.upgradeProxy` pattern or do it manually:
```solidity
// In test
HumanRegistry newImpl = new HumanRegistry();
vm.prank(owner);
proxy.upgradeToAndCall(address(newImpl), "");
```

### ⚠️ Do Not Call `initialize` Twice

The proxy constructor calls `initialize` during deployment. If you re-call it, it reverts (the `initializer` modifier prevents re-initialization). This frequently catches devs who test `impl.initialize(...)` directly without realizing the proxy already initialized the shared storage.

---

## Summary of Plan Changes Required

| Item | Plan Says | Reality | Action Required |
|---|---|---|---|
| x402 fetch package | `x402-fetch@1.1.0` | `@x402/fetch@2.8.0` | **MUST CHANGE** package name + API |
| x402 express package | `x402-express@1.1.0` | `@x402/express@2.8.0` | **MUST CHANGE** package name + API |
| `wrapFetchWithPayment` 2nd arg | `walletClient` (viem WalletClient) | `x402Client` instance | **MUST CHANGE** |
| `paymentMiddleware` args | `(facilitatorConfig, routes)` | `(routes, resourceServer)` | **MUST CHANGE** order + format |
| Network format | `"base-sepolia"` | `"eip155:84532"` | **MUST CHANGE** |
| IDKit widget component | `IDKitWidget` (implied) | `IDKitRequestWidget` | **MUST CHANGE** |
| IDKit `rp_context` | optional | required | Already in plan ✅ |
| `immutable worldIdRouter` | immutable | regular storage var | **MUST FIX** for UUPS |
| WorldIDRouter Base Sepolia | `0x42FF98C4...C02` | `0x42FF98C4...C02` | ✅ Confirmed |
| Simulator | `simulator.worldcoin.org` with `environment: "staging"` | Working, same URL | ✅ Confirmed |
| v3 legacy path on-chain | Use `WorldIDRouter` | Correct path for now | ✅ Confirmed |
| `allow_legacy_proofs` | Not in plan | Set to `true` in Phase 1 | **ADD THIS** |

---

*Research against: docs.world.org, simulator.worldcoin.org, docs.x402.org, npmjs.com — March 27, 2026*

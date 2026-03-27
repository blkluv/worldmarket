# WorldMarket — API Reference

> **On every other prediction market, one person with 100 bots is 100 voices. On WorldMarket, they're one.**

Prediction markets where every agent traces to a verified human. Built on **Coinbase x402 v2** + **World ID** on Base.

---

## Design by Contract (DbC) Philosophy

Every API in this project is documented using **Design by Contract** (Bertrand Meyer, 1986). Each callable unit carries three categories of formal obligation:

| Term | Meaning | Who is responsible |
|---|---|---|
| **Precondition** | What must be true *before* the call is made | **Caller** — violated precondition = caller bug |
| **Postcondition** | What will be true *after* the call succeeds | **Implementation** — violated postcondition = implementation bug |
| **Invariant** | What remains true across all calls to this system | **Both** — invariants are structural guarantees of the contract |

Calls that violate a precondition **MUST** return an explicit error and **MUST NOT** partially mutate state. Calls that succeed **MUST** satisfy their postconditions or revert all state changes.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js)                                                 │
│  ┌──────────────────┐  ┌────────────────────┐  ┌────────────────┐  │
│  │  /register       │  │  /market/[id]      │  │  AgentFeed     │  │
│  │  WorldIDButton   │  │  CapMeter          │  │  SSE stream    │  │
│  └──────────────────┘  └────────────────────┘  └────────────────┘  │
│         │                        │                      │           │
│         └──────── POST /api/rp-signature ───────────────┘           │
└───────────────────────────────────────────────────────────────────  ┘
                              │
┌─────────────────────────────────────────────────────────────────────┐
│  API Server (Express + @x402/express v2)                            │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐ ┌─────────────┐ │
│  │ GET /markets│ │ GET /price  │ │ POST /bet    │ │ GET /stream │ │
│  │ $0.001 x402 │ │ $0.0001 x402│ │ $0.01  x402  │ │ FREE (SSE)  │ │
│  └─────────────┘ └─────────────┘ └──────────────┘ └─────────────┘ │
│         │                              │                            │
│         └── services/contract.ts ──────┘                           │
└───────────────────────────────────────────────────────────────────  ┘
                              │
┌─────────────────────────────────────────────────────────────────────┐
│  Smart Contracts (Base Sepolia)                                     │
│  ┌──────────────────────┐     ┌──────────────────────────────────┐  │
│  │  HumanRegistry.sol   │     │  WorldMarket.sol                 │  │
│  │  (UUPS Proxy)        │◄────│  bet() → humanOf() → cap check  │  │
│  │  World ID v3 legacy  │     │  resolve(), claim()              │  │
│  └──────────────────────┘     └──────────────────────────────────┘  │
│           │                                                         │
│  WorldIDRouter: 0x42FF98C4E85212a5D31358ACbFe76a621b50fC02         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Table of Contents

1. [Smart Contract API — HumanRegistry.sol](#1-smart-contract-api--humanregistrysol)
2. [Smart Contract API — WorldMarket.sol](#2-smart-contract-api--worldmarketsol)
3. [HTTP REST API — Express Server](#3-http-rest-api--express-server)
4. [Frontend API Route — rp-signature](#4-frontend-api-route--rp-signature)
5. [Agent Client API — x402 Wrapped Fetch](#5-agent-client-api--x402-wrapped-fetch)
6. [System-Wide Invariants](#6-system-wide-invariants)
7. [Environment Variables](#7-environment-variables)
8. [Error Code Reference](#8-error-code-reference)

---

## 1. Smart Contract API — HumanRegistry.sol

**Contract address:** set at deploy time (UUPS proxy, Base Sepolia)
**Implementation:** Solidity, deployed behind ERC-1967 UUPS proxy
**World ID Router:** `0x42FF98C4E85212a5D31358ACbFe76a621b50fC02` (Base Sepolia)

> ⚠️ **UUPS Note:** `worldIdRouter` is a regular storage variable (not `immutable`) because this contract sits behind a UUPS proxy. The `_authorizeUpgrade` override with `onlyOwner` must be present or upgrades revert permanently.

### System Invariants (HumanRegistry)

| # | Invariant |
|---|---|
| HR-INV-1 | For every address `w` where `nullifierOf[w] != 0`, `principalOf[nullifierOf[w]] == w` |
| HR-INV-2 | `usedNullifiers[n] == true` for all `n` that appear as a value in `nullifierOf` |
| HR-INV-3 | For every agent `a` where `principalForAgent[a] != address(0)`, `a` appears in `agentsOf[principalForAgent[a]]` |
| HR-INV-4 | No address is simultaneously a registered principal (via `nullifierOf`) and a registered agent (via `principalForAgent`) — a wallet occupies exactly one role |
| HR-INV-5 | `humanOf(w)` returns a non-zero address if and only if `w` is a registered principal or a registered agent |

---

### `registerHuman(root, nullifierHash, externalNullifierHash, proof)`

Verifies a World ID ZK proof and registers the caller as a human principal.

```solidity
function registerHuman(
    uint256 root,
    uint256 nullifierHash,
    uint256 externalNullifierHash,
    uint256[8] calldata proof
) external
```

**Preconditions**

| # | Condition | Error if violated |
|---|---|---|
| PRE-RH-1 | `usedNullifiers[nullifierHash] == false` | `"already registered"` |
| PRE-RH-2 | `msg.sender` is not already registered as an agent (`principalForAgent[msg.sender] == address(0)`) | `"caller is already an agent"` |
| PRE-RH-3 | `root` is a valid, recent World ID Merkle root accepted by the WorldIDRouter | reverts from WorldIDRouter |
| PRE-RH-4 | `proof` is a valid Groth16 proof for `(root, GROUP_ID=1, signalHash, nullifierHash, externalNullifierHash)` where `signalHash = abi.encodePacked(msg.sender).hashToField()` | reverts from WorldIDRouter |
| PRE-RH-5 | `externalNullifierHash` encodes the correct `app_id` and `action` string matching the on-chain app registration | reverts from WorldIDRouter |

**Postconditions**

| # | Condition |
|---|---|
| POST-RH-1 | `usedNullifiers[nullifierHash] == true` |
| POST-RH-2 | `principalOf[nullifierHash] == msg.sender` |
| POST-RH-3 | `nullifierOf[msg.sender] == nullifierHash` |
| POST-RH-4 | `humanOf(msg.sender)` returns `msg.sender` |

**Notes**
- The signal hash binding (`abi.encodePacked(msg.sender).hashToField()`) ensures a proof generated for wallet A cannot be replayed to register wallet B.
- Use `allow_legacy_proofs: true` in IDKit during World ID Phase 1 (until June 1, 2026).

---

### `registerAgent(agentWallet)`

Links an agent wallet to the caller's human principal identity.

```solidity
function registerAgent(address agentWallet) external
```

**Preconditions**

| # | Condition | Error if violated |
|---|---|---|
| PRE-RA-1 | `nullifierOf[msg.sender] != 0` (caller is a registered human principal) | `"not a registered human"` |
| PRE-RA-2 | `agentWallet != address(0)` | `"zero address"` |
| PRE-RA-3 | `principalForAgent[agentWallet] == address(0)` (agent wallet not already claimed) | `"agent already registered"` |
| PRE-RA-4 | `nullifierOf[agentWallet] == 0` (agent wallet is not itself a registered human principal) | `"wallet is a registered human"` |

**Postconditions**

| # | Condition |
|---|---|
| POST-RA-1 | `principalForAgent[agentWallet] == msg.sender` |
| POST-RA-2 | `agentWallet` is contained in `agentsOf[msg.sender]` |
| POST-RA-3 | `humanOf(agentWallet)` returns `msg.sender` |

---

### `humanOf(wallet)` → `address`

Read-only lookup: resolves any registered wallet to its human principal.

```solidity
function humanOf(address wallet) public view returns (address)
```

**Preconditions**

*(None — this is a pure view function with no access restrictions)*

**Postconditions**

| # | Condition |
|---|---|
| POST-HO-1 | Returns `wallet` if `wallet` is a registered human principal (`nullifierOf[wallet] != 0`) |
| POST-HO-2 | Returns `principalForAgent[wallet]` if `wallet` is a registered agent |
| POST-HO-3 | Returns `address(0)` if `wallet` is neither a principal nor an agent |

---

### `initialize(worldIdRouter, initialOwner)` *(proxy initializer)*

One-time initialization called by the ERC-1967 proxy constructor.

```solidity
function initialize(address worldIdRouter, address initialOwner) external initializer
```

**Preconditions**

| # | Condition | Error if violated |
|---|---|---|
| PRE-INIT-1 | Has not been called before (enforced by `initializer` modifier) | `"Initializable: contract is already initialized"` |
| PRE-INIT-2 | `worldIdRouter != address(0)` | `"zero address"` |
| PRE-INIT-3 | `initialOwner != address(0)` | `"zero address"` |

**Postconditions**

| # | Condition |
|---|---|
| POST-INIT-1 | `worldIdRouter` storage is set to the provided router address |
| POST-INIT-2 | Contract owner is set to `initialOwner` |

---

### `_authorizeUpgrade(newImplementation)` *(UUPS internal)*

```solidity
function _authorizeUpgrade(address newImplementation) internal override onlyOwner
```

**Preconditions**

| # | Condition | Error if violated |
|---|---|---|
| PRE-AU-1 | `msg.sender == owner()` | `"Ownable: caller is not the owner"` |

**Postconditions**

*(No state change — authorization only. The proxy's `upgradeToAndCall` finalizes the upgrade.)*

---

## 2. Smart Contract API — WorldMarket.sol

### System Invariants (WorldMarket)

| # | Invariant |
|---|---|
| WM-INV-1 | For any open market `m`, `sum(positions[m][YES]) + sum(positions[m][NO]) == totalLiquidity[m]` (AMM conservation) |
| WM-INV-2 | For any human `h` and market `m`, `humanExposure[m][h] <= perHumanCap` at all times |
| WM-INV-3 | A market can only transition: `OPEN → RESOLVED`. It cannot return to `OPEN` after resolution |
| WM-INV-4 | `registry.humanOf(caller)` is consulted on every state-mutating call; calls from unregistered wallets always revert |
| WM-INV-5 | Claimed winnings can only be claimed once per wallet per market |

---

### `bet(marketId, outcome, amount)`

Places a bet on a binary outcome for a given market.

```solidity
function bet(uint256 marketId, bool outcome, uint256 amount) external
```

**Preconditions**

| # | Condition | Error if violated |
|---|---|---|
| PRE-BET-1 | `registry.humanOf(msg.sender) != address(0)` | `"unregistered wallet"` |
| PRE-BET-2 | `markets[marketId].status == MarketStatus.OPEN` | `"market not open"` |
| PRE-BET-3 | `block.timestamp < markets[marketId].deadline` | `"market closed"` |
| PRE-BET-4 | `humanExposure[marketId][human] + amount <= perHumanCap` where `human = registry.humanOf(msg.sender)` | `"human cap exceeded"` |
| PRE-BET-5 | `amount > 0` | `"zero amount"` |
| PRE-BET-6 | Caller has approved the contract to spend at least `amount` USDC (`USDC.allowance(msg.sender, address(this)) >= amount`) | ERC-20 transfer revert |

**Postconditions**

| # | Condition |
|---|---|
| POST-BET-1 | `humanExposure[marketId][human]` increased by `amount` |
| POST-BET-2 | `positions[marketId][outcome][msg.sender]` increased by the shares received from the AMM |
| POST-BET-3 | `amount` USDC transferred from `msg.sender` to `address(this)` |
| POST-BET-4 | AMM pool balances updated to reflect the bet |

**Notes**
- `human cap exceeded` is an application-level error (HTTP 200 from the API). The x402 payment has already settled before the contract call. The agent must handle this in response body, not as a 402 error.

---

### `resolve(marketId, outcome)`

Resolves a market to its final outcome. Admin-only for hackathon.

```solidity
function resolve(uint256 marketId, bool outcome) external onlyOwner
```

**Preconditions**

| # | Condition | Error if violated |
|---|---|---|
| PRE-RES-1 | `msg.sender == owner()` | `"Ownable: caller is not the owner"` |
| PRE-RES-2 | `markets[marketId].status == MarketStatus.OPEN` | `"market not open"` |
| PRE-RES-3 | `block.timestamp >= markets[marketId].deadline` | `"market not yet closed"` |

**Postconditions**

| # | Condition |
|---|---|
| POST-RES-1 | `markets[marketId].status == MarketStatus.RESOLVED` |
| POST-RES-2 | `markets[marketId].winningOutcome == outcome` |

---

### `claim(marketId)`

Claims winnings for a resolved market.

```solidity
function claim(uint256 marketId) external
```

**Preconditions**

| # | Condition | Error if violated |
|---|---|---|
| PRE-CLM-1 | `markets[marketId].status == MarketStatus.RESOLVED` | `"market not resolved"` |
| PRE-CLM-2 | `positions[marketId][winningOutcome][msg.sender] > 0` | `"no winning position"` |
| PRE-CLM-3 | `claimed[marketId][msg.sender] == false` | `"already claimed"` |

**Postconditions**

| # | Condition |
|---|---|
| POST-CLM-1 | `claimed[marketId][msg.sender] == true` |
| POST-CLM-2 | Pro-rated USDC winnings transferred to `msg.sender` |

---

### `createMarket(question, deadline)` *(Owner only)*

Creates a new binary prediction market.

```solidity
function createMarket(string calldata question, uint256 deadline) external onlyOwner returns (uint256 marketId)
```

**Preconditions**

| # | Condition | Error if violated |
|---|---|---|
| PRE-CM-1 | `msg.sender == owner()` | `"Ownable: caller is not the owner"` |
| PRE-CM-2 | `deadline > block.timestamp` | `"deadline in past"` |
| PRE-CM-3 | `bytes(question).length > 0` | `"empty question"` |

**Postconditions**

| # | Condition |
|---|---|
| POST-CM-1 | New market appended with `status = OPEN`, `winningOutcome` unset |
| POST-CM-2 | Returns the new `marketId` |

---

## 3. HTTP REST API — Express Server

**Base URL:** `http://localhost:3001` (configurable via `PORT` env var)
**Protocol:** HTTP/1.1, JSON responses (`Content-Type: application/json`)
**Payment layer:** Coinbase x402 v2 (`@x402/express@2.8.0`)
**Network:** Base Sepolia, CAIP-2 `eip155:84532`
**Facilitator:** `https://x402.org/facilitator`

### x402 Payment Model

All paid endpoints follow the x402 protocol. When a client makes a request without payment:

1. Server responds with `HTTP 402 Payment Required`
2. Response includes `X-Payment-Required` header with payment details
3. Client (`@x402/fetch`) intercepts, signs payment via `ExactEvmScheme`, retries with `X-Payment` header
4. Server validates payment via facilitator and processes request

```
Client ──► Server: GET /markets
Server ──► Client: 402 Payment Required (X-Payment-Required: {...})
Client ──► Facilitator: sign payment
Client ──► Server: GET /markets (X-Payment: {...})
Server ──► Facilitator: verify payment
Server ──► Client: 200 OK {...}
```

### System Invariants (HTTP API)

| # | Invariant |
|---|---|
| API-INV-1 | Every paid endpoint returns `402` if and only if the x402 payment header is absent or invalid |
| API-INV-2 | Payment verification occurs before any business logic executes — no partial state changes happen on payment failure |
| API-INV-3 | All responses are JSON with at minimum `{ data }` on success or `{ error: string }` on failure |
| API-INV-4 | The `GET /stream` endpoint never charges; it is always free and does not require x402 headers |
| API-INV-5 | HTTP status codes are semantic: `200` success, `400` bad request, `402` payment required, `404` not found, `500` server error |

---

### `GET /markets`

Returns a list of all active prediction markets.

**x402 Payment:** `$0.001` USDC · `eip155:84532` · `payTo: PAYMENT_RECIPIENT`

**Preconditions**

| # | Condition | Error if violated |
|---|---|---|
| PRE-GM-1 | Valid x402 payment header present (`X-Payment`) | `402 Payment Required` |
| PRE-GM-2 | Payment amount exactly matches the configured price (`$0.001`) | `402 Payment Required` |
| PRE-GM-3 | Payment network matches `eip155:84532` | `402 Payment Required` |

**Postconditions**

| # | Condition |
|---|---|
| POST-GM-1 | Returns `200` with array of market objects |
| POST-GM-2 | Each market object contains `id`, `question`, `deadline`, `status`, `yesPool`, `noPool`, `currentPrice` |
| POST-GM-3 | Payment of `$0.001` USDC is debited from caller's wallet |

**Response Schema**

```typescript
// 200 OK
{
  data: Array<{
    id: number;
    question: string;
    deadline: number;       // Unix timestamp
    status: "open" | "resolved";
    yesPool: string;        // USDC amount, wei string
    noPool: string;         // USDC amount, wei string
    currentPrice: {
      yes: number;          // 0.0–1.0
      no: number;           // 0.0–1.0
    };
    perHumanCap: string;    // USDC amount, wei string
  }>
}

// 402 Payment Required
// (standard x402 protocol response — no JSON body)
```

---

### `GET /markets/:id`

Returns detail for a single market.

**x402 Payment:** `$0.001` USDC · `eip155:84532`

**Preconditions**

| # | Condition | Error if violated |
|---|---|---|
| PRE-GMS-1 | Valid x402 payment header present | `402 Payment Required` |
| PRE-GMS-2 | `:id` is a valid non-negative integer | `400 Bad Request` `{ error: "invalid market id" }` |
| PRE-GMS-3 | Market with `id` exists on-chain | `404 Not Found` `{ error: "market not found" }` |

**Postconditions**

| # | Condition |
|---|---|
| POST-GMS-1 | Returns `200` with full market detail object |
| POST-GMS-2 | Payment of `$0.001` USDC is debited |

**Response Schema**

```typescript
// 200 OK
{
  data: {
    id: number;
    question: string;
    deadline: number;
    status: "open" | "resolved";
    winningOutcome?: boolean;   // only present when status == "resolved"
    yesPool: string;
    noPool: string;
    currentPrice: { yes: number; no: number };
    perHumanCap: string;
    totalVolume: string;
  }
}
```

---

### `GET /markets/:id/price`

Returns the current AMM price for both outcomes without placing a bet.

**x402 Payment:** `$0.0001` USDC · `eip155:84532`

**Preconditions**

| # | Condition | Error if violated |
|---|---|---|
| PRE-GMP-1 | Valid x402 payment header present | `402 Payment Required` |
| PRE-GMP-2 | `:id` is a valid non-negative integer | `400` `{ error: "invalid market id" }` |
| PRE-GMP-3 | Market with `id` exists | `404` `{ error: "market not found" }` |
| PRE-GMP-4 | Market `status == "open"` | `400` `{ error: "market not open" }` |

**Postconditions**

| # | Condition |
|---|---|
| POST-GMP-1 | Returns `200` with current price snapshot |
| POST-GMP-2 | No on-chain state is mutated |
| POST-GMP-3 | Payment of `$0.0001` USDC is debited |

**Response Schema**

```typescript
// 200 OK
{
  data: {
    marketId: number;
    price: {
      yes: number;    // 0.0–1.0 implied probability
      no: number;     // 0.0–1.0 implied probability
    };
    pools: {
      yes: string;    // USDC wei
      no: string;     // USDC wei
    };
    timestamp: number;
  }
}
```

---

### `POST /markets/:id/bet`

Places a bet on a binary market outcome on-chain, on behalf of the calling wallet.

**x402 Payment:** `$0.01` USDC · `eip155:84532`

**Preconditions**

| # | Condition | Error if violated |
|---|---|---|
| PRE-BET-API-1 | Valid x402 payment header present | `402 Payment Required` |
| PRE-BET-API-2 | `:id` is a valid non-negative integer | `400` `{ error: "invalid market id" }` |
| PRE-BET-API-3 | Request body is valid JSON | `400` `{ error: "invalid request body" }` |
| PRE-BET-API-4 | `body.outcome` is `true` or `false` | `400` `{ error: "outcome must be boolean" }` |
| PRE-BET-API-5 | `body.amount` is a positive integer string representing USDC wei | `400` `{ error: "amount must be positive integer string" }` |
| PRE-BET-API-6 | `body.wallet` is a valid EVM address (checksummed) | `400` `{ error: "invalid wallet address" }` |
| PRE-BET-API-7 | Market exists and `status == "open"` and `block.timestamp < deadline` | `400` `{ error: "market not open" }` |
| PRE-BET-API-8 | `wallet` is registered in HumanRegistry (principal or agent) | `400` `{ error: "unregistered wallet" }` |
| PRE-BET-API-9 | `humanExposure[id][humanOf(wallet)] + amount <= perHumanCap` | `200` `{ error: "human cap exceeded" }` *(see note)* |

> **⚠️ Note on PRE-BET-API-9:** The `"human cap exceeded"` error is returned as `HTTP 200` with an error field, **not** as a 4xx. This is intentional — the x402 payment has already been settled by the time the contract logic runs. The agent must inspect the response body for this error.

**Postconditions**

| # | Condition |
|---|---|
| POST-BET-API-1 | Returns `200` with transaction receipt and updated position |
| POST-BET-API-2 | `humanExposure[id][humanOf(wallet)]` increased on-chain |
| POST-BET-API-3 | `$0.01` USDC payment debited from calling wallet (x402) |
| POST-BET-API-4 | `amount` USDC transferred from `wallet` to market contract (requires pre-approval) |

**Request Body**

```typescript
{
  wallet: string;     // "0x..." — the betting wallet (must be registered)
  outcome: boolean;   // true = YES, false = NO
  amount: string;     // USDC amount in wei (e.g., "1000000" = $1.00)
}
```

**Response Schema**

```typescript
// 200 OK (success)
{
  data: {
    txHash: string;
    marketId: number;
    outcome: boolean;
    amount: string;
    sharesReceived: string;
    humanExposureAfter: string;
    humanCap: string;
    remainingCap: string;
  }
}

// 200 OK (cap exceeded — NOT a 4xx)
{
  error: "human cap exceeded",
  humanExposure: string;
  humanCap: string;
}

// 4xx errors
{ error: string }
```

---

### `POST /markets/:id/simulate`

Simulates a bet and returns the expected shares and price impact without executing any on-chain transaction.

**x402 Payment:** `$0.001` USDC · `eip155:84532`

**Preconditions**

| # | Condition | Error if violated |
|---|---|---|
| PRE-SIM-1 | Valid x402 payment header present | `402 Payment Required` |
| PRE-SIM-2 | `:id` is a valid non-negative integer | `400` `{ error: "invalid market id" }` |
| PRE-SIM-3 | `body.outcome` is `true` or `false` | `400` `{ error: "outcome must be boolean" }` |
| PRE-SIM-4 | `body.amount` is a positive integer string | `400` `{ error: "amount must be positive integer string" }` |
| PRE-SIM-5 | Market exists and `status == "open"` | `400` `{ error: "market not open" }` |

**Postconditions**

| # | Condition |
|---|---|
| POST-SIM-1 | Returns `200` with simulation result |
| POST-SIM-2 | **No on-chain state is mutated** |
| POST-SIM-3 | `$0.001` USDC payment debited (x402) |

**Request Body**

```typescript
{
  outcome: boolean;
  amount: string;      // USDC wei
}
```

**Response Schema**

```typescript
// 200 OK
{
  data: {
    marketId: number;
    outcome: boolean;
    amountIn: string;
    sharesOut: string;
    priceImpact: number;   // 0.0–1.0 (fraction of pool moved)
    priceBefore: { yes: number; no: number };
    priceAfter:  { yes: number; no: number };
  }
}
```

---

### `GET /stream`

Server-Sent Events stream of real-time market activity (bets, resolutions, price updates).

**x402 Payment:** **FREE — no payment required**

**Preconditions**

| # | Condition | Error if violated |
|---|---|---|
| PRE-STR-1 | Client must accept `text/event-stream` content type | `406 Not Acceptable` |
| PRE-STR-2 | *(No payment required)* | — |

**Postconditions**

| # | Condition |
|---|---|
| POST-STR-1 | Connection upgraded to SSE (`Content-Type: text/event-stream`) |
| POST-STR-2 | Server pushes events without client polling |
| POST-STR-3 | Connection stays open until client disconnects or server restarts |

**Event Schema**

```typescript
// Emitted on every new bet
event: bet
data: {
  "marketId": number,
  "wallet": string,
  "human": string,       // humanOf(wallet) — the principal
  "outcome": boolean,
  "amount": string,
  "sharesReceived": string,
  "txHash": string,
  "humanExposure": string,
  "humanCap": string,
  "timestamp": number
}

// Emitted when human cap is hit
event: cap_hit
data: {
  "marketId": number,
  "human": string,
  "humanExposure": string,
  "humanCap": string,
  "timestamp": number
}

// Emitted on market resolution
event: resolution
data: {
  "marketId": number,
  "winningOutcome": boolean,
  "txHash": string,
  "timestamp": number
}

// Heartbeat (every 30s to prevent proxy timeout)
event: ping
data: { "timestamp": number }
```

**Client Usage**

```typescript
const sse = new EventSource("/stream");
sse.addEventListener("bet", (e) => console.log(JSON.parse(e.data)));
sse.addEventListener("cap_hit", (e) => console.log("Cap hit!", JSON.parse(e.data)));
```

---

## 4. Frontend API Route — rp-signature

**Route:** `POST /api/rp-signature`
**Location:** `frontend/app/api/rp-signature/route.ts` (Next.js App Router)
**Purpose:** Generates and signs an `rp_context` object required by IDKit v4.x for every World ID verification request. This is a **required backend step** — it cannot run in the browser because it uses `RP_SIGNING_KEY`.

### System Invariants (rp-signature)

| # | Invariant |
|---|---|
| RPS-INV-1 | `RP_SIGNING_KEY` is never exposed to the client or included in any response |
| RPS-INV-2 | Every generated `rp_context` has a unique `nonce` |
| RPS-INV-3 | `expiresAt` is always strictly greater than `createdAt` |

---

### `POST /api/rp-signature`

Generates a signed `rp_context` for use as the `rp_context` prop on `IDKitRequestWidget`.

```typescript
// frontend/app/api/rp-signature/route.ts
import { signRequest } from "@worldcoin/idkit/signing";

export async function POST(request: Request) {
  const { action } = await request.json();
  const { sig, nonce, createdAt, expiresAt } = signRequest(
    action,
    process.env.RP_SIGNING_KEY!
  );
  return Response.json({ sig, nonce, created_at: createdAt, expires_at: expiresAt });
}
```

**Preconditions**

| # | Condition | Error if violated |
|---|---|---|
| PRE-RPS-1 | Request body is valid JSON | `400` `{ error: "invalid request body" }` |
| PRE-RPS-2 | `body.action` is a non-empty string matching a registered World ID action | `400` `{ error: "action is required" }` |
| PRE-RPS-3 | `process.env.RP_SIGNING_KEY` is set in the server environment | `500` `{ error: "server misconfiguration" }` |

**Postconditions**

| # | Condition |
|---|---|
| POST-RPS-1 | Returns `200` with `{ sig, nonce, created_at, expires_at }` |
| POST-RPS-2 | `sig` is a valid HMAC signature over the `action` using `RP_SIGNING_KEY` |
| POST-RPS-3 | `nonce` is a cryptographically random value unique to this request |
| POST-RPS-4 | `expires_at` is a future timestamp (typically ~5 minutes from `created_at`) |

**Request Body**

```typescript
{ action: string }   // e.g., "register-human"
```

**Response Schema**

```typescript
// 200 OK
{
  sig: string;         // HMAC signature
  nonce: string;       // unique random value
  created_at: number;  // Unix timestamp
  expires_at: number;  // Unix timestamp
}
```

**Frontend Usage**

```tsx
import { IDKitRequestWidget, orbLegacy } from "@worldcoin/idkit";

// Before rendering widget:
const rpContext = await fetch("/api/rp-signature", {
  method: "POST",
  body: JSON.stringify({ action: "register-human" })
}).then(r => r.json());

// In JSX:
<IDKitRequestWidget
  open={open}
  onOpenChange={setOpen}
  app_id={process.env.NEXT_PUBLIC_WLD_APP_ID!}
  action="register-human"
  rp_context={rpContext}               // ← required in IDKit v4.x
  allow_legacy_proofs={true}           // ← required during Phase 1 (until June 1, 2026)
  preset={orbLegacy({ signal: walletAddress })}
  onSuccess={(result) => handleVerify(result)}
  handleVerify={async (result) => { /* call registerHuman() */ }}
/>
```

---

## 5. Agent Client API — x402 Wrapped Fetch

**Package:** `@x402/fetch@2.8.0`
**Location:** `agent/src/x402Client.ts`

The agent client wraps the native `fetch` API with automatic x402 payment handling. The wrapped function has the same signature as `fetch` but intercepts `402` responses, signs payments, and retries transparently.

### System Invariants (Agent Client)

| # | Invariant |
|---|---|
| AC-INV-1 | `agentFetch` has the same call signature as the global `fetch` function |
| AC-INV-2 | Payment is only attempted when the server returns `402 Payment Required` |
| AC-INV-3 | No payment is made if the server returns any status other than `402` on the first request |
| AC-INV-4 | The `"human cap exceeded"` error appears in the response body (HTTP 200), never as a thrown exception |

---

### Client Setup

```typescript
// agent/src/x402Client.ts
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`);
// NOTE: privateKeyToAccount only — NOT createWalletClient. No chain/transport needed.

const client = new x402Client();
client.register("eip155:*", new ExactEvmScheme(signer));
// "eip155:*" wildcard covers all EVM chains including Base Sepolia (eip155:84532)

export const agentFetch = wrapFetchWithPayment(fetch, client);
```

**Preconditions for `new x402Client()` + `client.register()`**

| # | Condition | Error if violated |
|---|---|---|
| PRE-AC-1 | `process.env.AGENT_PRIVATE_KEY` is a valid 32-byte hex private key prefixed with `0x` | `privateKeyToAccount` throws |
| PRE-AC-2 | Agent wallet is pre-funded with testnet USDC on Base Sepolia (sufficient for expected bets + buffer) | `agentFetch` throws on first 402 |
| PRE-AC-3 | Agent wallet has approved the x402 facilitator to spend USDC (`MockUSDC.approve(facilitatorAddress, MaxUint256)`) | Payment signing fails silently or throws |

---

### `agentFetch(url, init?)` → `Promise<Response>`

Drop-in replacement for `fetch` with automatic x402 payment.

```typescript
const response = await agentFetch(url, init?);
```

**Preconditions**

| # | Condition | Error if violated |
|---|---|---|
| PRE-AF-1 | `url` is a valid HTTP/HTTPS URL string | `TypeError` thrown |
| PRE-AF-2 | Agent wallet has sufficient USDC balance for the endpoint price | `agentFetch` throws (no built-in retry) |
| PRE-AF-3 | No payment is currently in-flight for the same endpoint (avoid concurrent calls to the same paid endpoint) | `"Payment already attempted"` thrown |

**Postconditions**

| # | Condition |
|---|---|
| POST-AF-1 | Returns a `Response` object identical to native `fetch` on success |
| POST-AF-2 | If server returned `402`, payment was signed and deducted before the `Response` is returned |
| POST-AF-3 | The returned `Response` always reflects the *second* (post-payment) response from the server |

**Error Handling**

```typescript
// Correct error handling pattern for the agent loop:
try {
  const res = await agentFetch(`${API_URL}/markets/${marketId}/bet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, outcome, amount }),
  });

  const data = await res.json();

  // Check application-level errors in body (HTTP 200 responses)
  if (data.error === "human cap exceeded") {
    console.log("🛑 Human cap hit — stopping");
    process.exit(0);
  }
  if (data.error) {
    throw new Error(`API error: ${data.error}`);
  }

  return data;

} catch (err: any) {
  if (err.message === "Payment already attempted") {
    // Network retry race condition — wait before retrying
    await new Promise(r => setTimeout(r, 2000));
    // retry once...
  }
  if (err.message?.includes("insufficient")) {
    console.error("Insufficient USDC balance — top up agent wallet");
    process.exit(1);
  }
  throw err;
}
```

---

### Known Limitations (Agent Client)

| # | Limitation | Mitigation |
|---|---|---|
| LIM-1 | No built-in retry on insufficient USDC balance | Pre-fund agent wallet; handle thrown error in loop |
| LIM-2 | `"Payment already attempted"` thrown on retry during in-flight payment | Add `try/catch` with 2s delay before retry |
| LIM-3 | v2 client is incompatible with v1 servers (`x402Version` header mismatch) | Build all services with v2 packages from the start |
| LIM-4 | USDC mock approval required on first use of a new agent wallet | Call `MockUSDC.approve(facilitatorAddress, MaxUint256)` in setup script |

---

## 6. System-Wide Invariants

The following invariants hold across the entire WorldMarket system at all times:

| # | Invariant | Enforced By |
|---|---|---|
| SYS-INV-1 | Every wallet that places a bet is traceable to exactly one Orb-verified human | `HumanRegistry.humanOf()` called in `WorldMarket.bet()` |
| SYS-INV-2 | The total position any single human can hold in any single market is bounded by `perHumanCap`, regardless of how many agent wallets they operate | `WorldMarket.humanExposure[marketId][human]` |
| SYS-INV-3 | A World ID nullifier is used at most once for registration | `usedNullifiers[nullifierHash]` in `HumanRegistry` |
| SYS-INV-4 | A ZK proof is bound to the registering wallet's address; it cannot be replayed for a different wallet | Signal hash = `abi.encodePacked(msg.sender).hashToField()` |
| SYS-INV-5 | x402 payment is settled before any business logic executes on paid API endpoints | `@x402/express paymentMiddleware` runs before route handlers |
| SYS-INV-6 | The `RP_SIGNING_KEY` is never transmitted to or accessible by any client-side code | Signature happens server-side in `POST /api/rp-signature` |
| SYS-INV-7 | Market contracts are upgradeable (UUPS) without losing existing state | ERC-1967 proxy storage layout, storage gaps, `_authorizeUpgrade` |

---

## 7. Environment Variables

```bash
# ── Contracts (Foundry deploy) ──────────────────────────────────────
PRIVATE_KEY=0x...                    # deployer wallet
BASE_SEPOLIA_RPC=https://sepolia.base.org

# ── API Server ───────────────────────────────────────────────────────
REGISTRY_ADDRESS=0x...               # deployed HumanRegistry proxy
MARKET_ADDRESS=0x...                 # deployed WorldMarket proxy
PAYMENT_RECIPIENT=0x...              # wallet that receives x402 fees
PORT=3001

# ── Agent ────────────────────────────────────────────────────────────
AGENT_PRIVATE_KEY=0x...              # pre-funded with testnet USDC
API_URL=http://localhost:3001

# ── Frontend (Next.js) ───────────────────────────────────────────────
NEXT_PUBLIC_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_MARKET_ADDRESS=0x...
NEXT_PUBLIC_WLD_APP_ID=app_...       # from World Developer Portal
NEXT_PUBLIC_API_URL=http://localhost:3001
RP_SIGNING_KEY=...                   # from World Developer Portal (server-only, never NEXT_PUBLIC_)
```

---

## 8. Error Code Reference

### HTTP API Errors

| HTTP Status | Error Body | Meaning |
|---|---|---|
| `402` | *(x402 protocol body)* | Payment required; x402 client should intercept and retry |
| `400` | `{ error: "invalid market id" }` | `:id` param is not a valid integer |
| `400` | `{ error: "market not open" }` | Market is resolved or deadline passed |
| `400` | `{ error: "invalid request body" }` | Malformed JSON or missing required fields |
| `400` | `{ error: "outcome must be boolean" }` | `outcome` field is not `true` or `false` |
| `400` | `{ error: "amount must be positive integer string" }` | `amount` field is not a positive integer string |
| `400` | `{ error: "invalid wallet address" }` | `wallet` is not a valid EVM address |
| `400` | `{ error: "unregistered wallet" }` | Wallet is not in HumanRegistry |
| `404` | `{ error: "market not found" }` | No market exists at given `:id` |
| `200` | `{ error: "human cap exceeded", ... }` | Per-human exposure cap reached (x402 already paid) |
| `500` | `{ error: "server misconfiguration" }` | Required env var missing |
| `500` | `{ error: "internal server error" }` | Unexpected contract or server error |

### Smart Contract Revert Strings

| Revert Message | Contract | Trigger |
|---|---|---|
| `"already registered"` | HumanRegistry | `nullifierHash` already used |
| `"caller is already an agent"` | HumanRegistry | `msg.sender` is registered as an agent |
| `"not a registered human"` | HumanRegistry | `registerAgent` called by non-principal |
| `"zero address"` | HumanRegistry / WorldMarket | Address(0) passed where not allowed |
| `"agent already registered"` | HumanRegistry | Agent wallet already linked to a principal |
| `"wallet is a registered human"` | HumanRegistry | Trying to register a human principal as an agent |
| `"unregistered wallet"` | WorldMarket | `humanOf(msg.sender) == address(0)` |
| `"market not open"` | WorldMarket | Market is resolved or `:id` invalid |
| `"market closed"` | WorldMarket | `block.timestamp >= deadline` |
| `"human cap exceeded"` | WorldMarket | Cumulative exposure would exceed `perHumanCap` |
| `"zero amount"` | WorldMarket | `amount == 0` |
| `"market not resolved"` | WorldMarket | `claim` called before resolution |
| `"no winning position"` | WorldMarket | Caller has no shares in winning outcome |
| `"already claimed"` | WorldMarket | Caller already claimed winnings for this market |
| `"deadline in past"` | WorldMarket | `createMarket` with past deadline |
| `"empty question"` | WorldMarket | Empty string passed to `createMarket` |
| `"Ownable: caller is not the owner"` | Both | Admin function called by non-owner |
| `"Initializable: contract is already initialized"` | HumanRegistry | `initialize` called twice |

---

## Stack Reference

| Layer | Package | Version | Notes |
|---|---|---|---|
| Contracts | Solidity + Foundry | — | Base Sepolia, UUPS proxy |
| World ID (frontend) | `@worldcoin/idkit` | 4.x | Use `IDKitRequestWidget`, not `IDKitWidget` |
| World ID (on-chain) | World ID Solidity lib | v3 legacy | `WorldIDRouter` at `0x42FF98C4...C02` |
| x402 (API) | `@x402/express` | 2.8.0 | NOT `x402-express` (dead v1) |
| x402 (agent) | `@x402/fetch` | 2.8.0 | NOT `x402-fetch` (dead v1) |
| x402 (core) | `@x402/core`, `@x402/evm` | 2.8.0 | Required for v2 setup |
| API | Express + ethers.js | — | |
| Frontend | Next.js + wagmi + viem | — | |
| Testnet USDC | MockUSDC.sol | — | Do not use real funds |

---

*WorldMarket — Hackathon build · Coinbase x402 v2 + World ID v3 legacy · Base Sepolia*
*Research baseline: March 27, 2026 · [RESEARCH.md](./RESEARCH.md)*

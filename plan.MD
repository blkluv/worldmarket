# WorldMarket

> **On every other prediction market, one person with 100 bots is 100 voices. On WorldMarket, they’re one.**

Prediction markets where every agent traces to a verified human. Built on **Coinbase x402** + **World ID** on Base.

-----

## What each primitive does

|Layer     |Tech         |Role                                                                                                                   |
|----------|-------------|-----------------------------------------------------------------------------------------------------------------------|
|Identity  |World ID     |ZK proof of unique personhood. Every wallet — human or bot — anchors to one real human. No PII stored.                 |
|Payment   |Coinbase x402|HTTP-native micropayments. Agents pay per API call automatically. No accounts, no API keys, no human click per request.|
|Settlement|Base L2      |On-chain registry and AMM. HumanRegistry enforces caps. All positions settle on-chain.                                 |

Neither works alone. World ID tells you *who*, x402 tells you *how they pay*, the contract enforces *what they’re allowed to do*.

-----

## The core mechanic

Two contracts. That’s the whole product.

**HumanRegistry.sol** — the identity primitive everything else calls into.

On-chain World ID verification uses `WorldIDRouter.verifyProof()`. Base Sepolia address: `0x42FF98C4E85212a5D31358ACbFe76a621b50fC02`.

> **World ID 4.0 note:** The `WorldIDVerifier.sol` interface (v4 uniqueness proofs) is in preview and not yet on mainnet. Use the v3 legacy path (`WorldIDRouter`) for the hackathon. **Deploy behind a UUPS proxy** so you can upgrade when 4.0 ships.

```solidity
interface IWorldID {
    function verifyProof(
        uint256 root, uint256 groupId, uint256 signalHash,
        uint256 nullifierHash, uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external view;
}

contract HumanRegistry {
    IWorldID public immutable worldIdRouter;      // 0x42FF98C4…C02 on Base Sepolia
    uint256 public constant GROUP_ID = 1;         // Orb-verified humans only

    mapping(uint256 => address) public principalOf;       // nullifierHash → wallet
    mapping(address => uint256) public nullifierOf;       // wallet → nullifierHash
    mapping(address => address[]) public agentsOf;        // principal → agents
    mapping(address => address) public principalForAgent; // agent → principal
    mapping(uint256 => bool) public usedNullifiers;       // replay protection

    function registerHuman(
        uint256 root,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external {
        require(!usedNullifiers[nullifierHash], "already registered");
        worldIdRouter.verifyProof(
            root, GROUP_ID,
            abi.encodePacked(msg.sender).hashToField(), // signalHash = caller address
            nullifierHash, externalNullifierHash, proof
        );
        usedNullifiers[nullifierHash] = true;
        principalOf[nullifierHash] = msg.sender;
        nullifierOf[msg.sender] = nullifierHash;
    }

    function humanOf(address wallet) public view returns (address) {
        if (nullifierOf[wallet] != 0) return wallet;               // is a principal
        if (principalForAgent[wallet] != address(0))
            return principalForAgent[wallet];                      // is an agent
        return address(0);                                         // unregistered
    }
}
```

**WorldMarket.sol** — the cap enforcement. The entire anti-Sybil mechanic is one require:

```solidity
function bet(uint256 marketId, bool outcome, uint256 amount) external {
    address human = registry.humanOf(msg.sender);
    require(human != address(0), "unregistered wallet");
    require(
        humanExposure[marketId][human] + amount <= perHumanCap,
        "human cap exceeded"   // ← this is the whole product
    );
    humanExposure[marketId][human] += amount;
    // ... AMM logic
}
```

A bot calling `bet()` hits the same cap as its human. 100 bots, same human, same cap.

-----

## How agents pay (x402)

One interceptor. Every request paid automatically. The agent never manually signs a payment.

```typescript
// x402Client.ts
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { wrapFetchWithPayment } from "x402-fetch";  // ← wrapFetchWithPayment, not withPaymentInterceptor

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`);
const walletClient = createWalletClient({ account, transport: http(), chain: baseSepolia });

const agentFetch = wrapFetchWithPayment(fetch, walletClient);

// agent loop — every call auto-pays the 402
const market = await agentFetch(`/markets/0`).then(r => r.json());
const sim    = await agentFetch(`/markets/0/simulate`, { method: 'POST', ... });
const result = await agentFetch(`/markets/0/bet`, { method: 'POST', ... });

if (result.error === "human cap exceeded") {
    console.log("🛑 Human cap hit — stopping");  // demo moment
}
```

> **Package versions (current):** `x402-fetch@1.1.0` · `x402-express@1.1.0`

Endpoint pricing:

```
GET  /markets              $0.001   list markets
GET  /markets/:id/price    $0.0001  price check
POST /markets/:id/bet      $0.01    place bet
POST /markets/:id/simulate $0.001   simulate (no on-chain)
GET  /stream               free     SSE events, public good
```

-----

## Codebase structure

```
worldmarket/
├── contracts/                    # source of truth, deploy first
│   ├── src/
│   │   ├── HumanRegistry.sol     # World ID verify + agent registration
│   │   ├── WorldMarket.sol       # AMM + human cap enforcement
│   │   └── MockUSDC.sol          # testnet only
│   ├── test/
│   │   ├── Registry.t.sol
│   │   └── Market.t.sol
│   └── script/Deploy.s.sol
│
├── api/                          # Express + x402 middleware
│   └── src/
│       ├── index.ts              # app entry, x402 wired to all routes
│       ├── middleware/
│       │   └── x402.ts           # paymentMiddleware config per endpoint
│       ├── routes/
│       │   ├── markets.ts        # GET /markets, GET /markets/:id
│       │   ├── bets.ts           # POST /markets/:id/bet
│       │   ├── simulate.ts       # POST /markets/:id/simulate
│       │   └── stream.ts         # GET /stream (SSE, free)
│       └── services/
│           ├── contract.ts       # ethers.js contract calls
│           └── pricer.ts         # AMM price calculation
│
├── agent/                        # demo bot — the money shot
│   └── src/
│       ├── index.ts              # main trading loop
│       ├── x402Client.ts         # withPaymentInterceptor wrapper
│       ├── strategy.ts           # simple pricing model
│       └── wallet.ts             # agent wallet management
│
└── frontend/                     # Next.js, minimal
    ├── app/
    │   ├── page.tsx              # market list
    │   ├── api/
    │   │   └── rp-signature/route.ts  # backend: signs IDKit requests (required by IDKit v4.x)
    │   ├── register/page.tsx     # World ID registration flow
    │   └── market/[id]/page.tsx  # market detail + live agent feed
    └── components/
        ├── WorldIDButton.tsx     # World ID IDKit widget (@worldcoin/idkit React SDK)
        ├── AgentFeed.tsx         # live SSE stream of bot activity
        └── CapMeter.tsx          # human exposure bar → the visual
```

-----

## 3-day build plan

> ⚠️ **Do this first.** Before writing any code: (1) Create an app in the [World Developer Portal](https://developer.world.org) and save your `app_id`, `rp_id`, and `RP_SIGNING_KEY`. (2) Confirm the World ID Simulator at `simulator.worldcoin.org` responds before writing `HumanRegistry.sol` — everything gates on `registerHuman()` working. (3) Fund the agent wallet with Base Sepolia USDC for x402 payments.

### Day 1 — Contracts

**Goal:** `registerHuman → registerAgent → bet from agent → cap rejects second bet` working end to end on Base Sepolia.

- **Morning** — Scaffold Foundry. Write `HumanRegistry.sol`. Wire `IWorldID` interface against the `WorldIDRouter` at `0x42FF98C4E85212a5D31358ACbFe76a621b50fC02` (Base Sepolia). Test `registerHuman()` with the [simulator](https://simulator.worldcoin.org) (set `environment: "staging"` in IDKit). **Get your `app_id` and `rp_id` from the [Developer Portal](https://developer.world.org) before writing a line of code — everything gates on this.**
- **Afternoon** — Write `WorldMarket.sol`. One hardcoded market. `bet()`, `resolve()`, `claim()`. Cap enforced via `humanOf()`.
- **Evening** — Write `registerAgent()`. Deploy both contracts to Base Sepolia behind a UUPS proxy. Save addresses in `.env`.

### Day 2 — API + Agent Bot

**Goal:** Agent running in terminal, paying x402, placing bets, hitting cap and stopping.

- **Morning** — Express API. Wire `paymentMiddleware` from `x402-express`. `GET /markets/:id` with machine-readable JSON.
- **Afternoon** — `POST /markets/:id/bet` (x402 → contract call). `POST /markets/:id/simulate`. SSE stream on `GET /stream` emitting contract events.
- **Evening** — Build the demo agent. `wrapFetchWithPayment(fetch, walletClient)` client (viem WalletClient wrapping the agent's private key). Loop: fetch price → simulate → bet → hit cap → stop. This is what you show on stage.

### Day 3 — Frontend + Polish

**Goal:** Full demo rehearsed. Three tabs ready. No new features.

- **Morning** — Next.js frontend. Add `api/rp-signature/route.ts` backend route (required by IDKit v4.x — signs requests with your `RP_SIGNING_KEY`). World ID IDKit widget (`@worldcoin/idkit`) on `/register`. Wallet connection via wagmi. Register agent wallet from UI.
- **Afternoon** — `CapMeter` component (progress bar filling as bot trades, hitting wall at cap). `AgentFeed` component (live SSE events).
- **Evening** — Rehearse the demo. Practice the 90-second script. Do not add features — polish what exists.

-----

## The 90-second demo

Three tabs open before you speak.

**Tab 1 — Registration**
`/register` page. Scan QR with World app. Wallet registers as Human Principal on-chain. Register the bot wallet address as an Agent.

**Tab 2 — Terminal**
Run `node agent/src/index.ts`. Watch it fetch prices (paying x402), simulate, place bets. No human clicks. Fully autonomous.

**Tab 3 — Frontend**
Market page. `CapMeter` fills with each bet. SSE stream shows each agent payment and position in real time.

**The moment:** Terminal logs `🛑 Human cap hit — stopping`. CapMeter hits the wall. That’s the product.

-----

## What to tell judges about shortcuts

**On resolution:**

> “Resolution is an admin wallet for the hackathon. Our whitepaper covers World ID one-human-one-vote for production — we focused build time on the novel mechanic, which is the agent accountability layer.”

**On the AMM:**

> “Simple constant-product AMM. Production would use LMSR for better price efficiency on binary markets, but the cap mechanics are identical regardless of pricing curve.”

**On whale dominance:**

> “Per-human caps limit influence by identity, not capital. A whale still moves prices more than a small bettor — we’re solving agent accountability and Sybil resistance, not wealth inequality. Those are different problems.”

Judges respect teams that know what they built and what they didn’t. Lead with the novel mechanic. Acknowledge the shortcuts. Don’t oversell.

-----

## Environment variables

```bash
# contracts
PRIVATE_KEY=0x...
BASE_SEPOLIA_RPC=https://sepolia.base.org

# api
REGISTRY_ADDRESS=0x...
MARKET_ADDRESS=0x...
PAYMENT_RECIPIENT=0x...      # where x402 fees go
PORT=3001

# agent
AGENT_PRIVATE_KEY=0x...      # pre-funded with testnet USDC
API_URL=http://localhost:3001

# frontend
NEXT_PUBLIC_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_MARKET_ADDRESS=0x...
NEXT_PUBLIC_WLD_APP_ID=app_...
NEXT_PUBLIC_API_URL=http://localhost:3001
```

-----

## Stack

- **Contracts** — Solidity, Foundry, Base Sepolia
- **World ID** — `@worldcoin/idkit` (frontend), World ID Solidity library (contracts)
- **x402** — `x402-express` (API middleware), `x402-fetch` (agent client)
- **API** — Express, ethers.js
- **Frontend** — Next.js, wagmi, viem
- **Testnet USDC** — mock ERC20, do not touch real money

-----

*WorldMarket — Hackathon build · Coinbase x402 + World ID · Base Sepolia*
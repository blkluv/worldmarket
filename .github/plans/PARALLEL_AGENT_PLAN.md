# WorldMarket — Parallel Agent Execution Plan

> All four tracks below are independent and can run simultaneously the moment env vars are available. Track 0 is the only blocker — everything else depends on its outputs.
>
> **Two modes available — pick one before starting:**
> - **Demo mode (no money, no testnet)** — uses `anvil` local chain + MockUSDC + `DEMO_MODE=true` to skip x402. Zero cost, works offline. Start here.
> - **Testnet mode** — deploys to Base Sepolia, requires funded wallet + real x402 payments.

---

## Demo Mode Quick-Start (no money required)

> Use this path to get the full stack running locally in ~5 minutes with no wallets, no testnet ETH, and no real USDC.

### How it works
- `anvil` provides a local EVM chain with 10 pre-funded accounts (10 000 ETH each, no cost)
- `MockUSDC.sol` (already in repo) is deployed in place of real USDC — `mint()` is public
- `DEMO_MODE=true` in `api/.env` bypasses the x402 `paymentMiddleware` so agents call the API for free
- World ID verification is **skipped** in demo mode — any address can register as a human directly via `cast send`
- Anvil private keys are public/well-known — safe to commit for demo purposes

### Pre-requisites
- `anvil` installed (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- Foundry `forge` and `cast` available
- No funded wallet, no faucet, no cloud accounts needed

### Anvil well-known accounts (use these for demo)
| Role | Index | Private Key | Address |
|---|---|---|---|
| Deployer | 0 | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Human 1 | 1 | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| Human 2 | 2 | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |
| Agent 1  | 3 | `0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6` | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` |
| Agent 2  | 4 | `0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926b` | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` |

### Code change required — implement `DEMO_MODE`
The agent running Track 0-Demo must make two code changes:

**1. `api/src/index.ts` — skip x402 middleware when `DEMO_MODE=true`:**
```ts
if (process.env.DEMO_MODE !== "true") {
  app.use(paymentMiddleware(x402Routes, resourceServer));
}
```

**2. `api/src/routes/bets.ts` — skip `humanOf` registry check when `DEMO_MODE=true`:**
```ts
// In POST /markets/:id/bet, replace the humanOf check with:
let human = wallet;
if (process.env.DEMO_MODE !== "true") {
  human = await humanOf(wallet);
  if (!human || human === "0x0000000000000000000000000000000000000000") {
    res.status(400).json({ error: "Wallet is not registered with HumanRegistry" });
    return;
  }
}
```

**3. `agent/src/x402Client.ts` — use plain fetch when `DEMO_MODE=true`:**
```ts
export const agentFetch = process.env.DEMO_MODE === "true"
  ? fetch
  : wrapFetchWithPayment(fetch, client);
```

### Demo env files to create

**`api/.env` (demo)**
```
WORLD_MARKET_ADDRESS=<from deploy output>
HUMAN_REGISTRY_ADDRESS=<from deploy output>
MOCK_USDC_ADDRESS=<from deploy output>
BASE_SEPOLIA_RPC=http://localhost:8545
ADMIN_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
PORT=3001
DEMO_MODE=true
```

**`frontend/.env.local` (demo)**
```
NEXT_PUBLIC_REGISTRY_ADDRESS=<from deploy output>
NEXT_PUBLIC_MARKET_ADDRESS=<from deploy output>
NEXT_PUBLIC_WLD_APP_ID=app_staging_demo
NEXT_PUBLIC_WLD_ACTION=register-human
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<already set>
```

**`agent/.env` (demo — run 2 copies with different keys for parallel agents)**
```
AGENT_PRIVATE_KEY=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
API_URL=http://localhost:3001
DEMO_MODE=true
```

### Demo boot sequence (all steps for one agent to execute in order)
```bash
# Step 1 — start local chain (background)
anvil &

# Step 2 — deploy contracts
cd contracts
forge script script/Deploy.s.sol \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast
# Note addresses from output → write api/.env + frontend/.env.local

# Step 3 — seed markets (replace $MARKET_ADDR with deployed address)
cast send $MARKET_ADDR "createMarket(string,uint256)" \
  "Will BTC exceed $100k by end of Q2 2026?" \
  $(($(date +%s) + 604800)) \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --rpc-url http://localhost:8545

cast send $MARKET_ADDR "createMarket(string,uint256)" \
  "Will ETH re-test $4k before July 2026?" \
  $(($(date +%s) + 1209600)) \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --rpc-url http://localhost:8545

# Step 4 — mint MockUSDC to agent wallets (replace $USDC_ADDR)
cast send $USDC_ADDR "mint(address,uint256)" \
  0x90F79bf6EB2c4f870365E785982E1f101E93b906 1000000000000 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --rpc-url http://localhost:8545

# Step 5 — approve WorldMarket to spend agent USDC (replace $MARKET_ADDR)
cast send $USDC_ADDR "approve(address,uint256)" \
  $MARKET_ADDR 1000000000000 \
  --private-key 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6 \
  --rpc-url http://localhost:8545

# Step 6 — start API (apply DEMO_MODE code changes first)
npm --prefix /path/to/api run dev &

# Step 7 — start frontend
npm --prefix /path/to/frontend run dev &

# Step 8 — run agent
npm --prefix /path/to/agent run dev
```

---

## Track 0 — Contracts & Infra (BLOCKER)
**Runs first. All other tracks wait on its outputs.**

### Goal
Deploy HumanRegistry + WorldMarket UUPS proxies and MockUSDC. Seed initial markets.
**In demo mode:** deploy to `anvil` (local). **In testnet mode:** deploy to Base Sepolia.

### Steps — Demo mode (recommended)
1. Start anvil: `anvil` (uses well-known accounts, no funding needed)
2. Run deploy script against `http://localhost:8545` with anvil account 0 private key
3. Record deployed addresses from forge output
4. Call `createMarket()` 2–3 times via `cast send`
5. Mint MockUSDC to agent wallet addresses via `cast send`
6. Approve WorldMarket to spend agent USDC via `cast send`
7. Apply the three `DEMO_MODE` code changes (see Demo Mode section above)
8. Write `api/.env`, `frontend/.env.local`, `agent/.env` with deployed addresses

### Steps — Testnet mode
1. Fund deployer wallet with Base Sepolia ETH (faucet.base.org)
2. `forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC --private-key $DEPLOYER_KEY --broadcast --verify`
3. Record deployed addresses: `HUMAN_REGISTRY_ADDRESS`, `WORLD_MARKET_ADDRESS`, `MOCK_USDC_ADDRESS`
4. Call `createMarket()` 2–3 times to seed test markets with real questions
5. Mint MockUSDC to agent wallets for testing

### Outputs emitted to all other tracks
```
HUMAN_REGISTRY_ADDRESS=0x...
WORLD_MARKET_ADDRESS=0x...
MOCK_USDC_ADDRESS=0x...
BASE_SEPOLIA_RPC=http://localhost:8545   # or https://sepolia.base.org for testnet
```

### Agent
**DevOps Automator** or **Solidity Smart Contract Engineer**

### MCP Servers / Skills
| Tool | Purpose |
|---|---|
| `run_in_terminal` | Start anvil, run forge deploy, cast send calls |
| `read_file` / `grep_search` | Read Deploy.s.sol, foundry.toml |
| `replace_string_in_file` | Apply DEMO_MODE changes to api/src/index.ts, bets.ts, agent/src/x402Client.ts |
| `create_file` | Write `api/.env`, `frontend/.env.local`, `agent/.env` |
| `get_errors` | Validate TypeScript after code changes |
| No external MCP needed | Forge/cast handle RPC interaction directly |

### Env vars needed to START
**Demo:** none — all keys are well-known anvil defaults above.
**Testnet:**
```
DEPLOYER_KEY=0x...          # Base Sepolia funded wallet
INITIAL_OWNER=0x...         # Can be same as deployer
```

---

## Track 1 — API Server Configuration
**Depends on: Track 0 addresses**

### Goal
Wire the Express API to the live contracts, verify all routes respond correctly.

### Steps
1. Create `api/.env`:
   ```
   WORLD_MARKET_ADDRESS=<from Track 0>
   HUMAN_REGISTRY_ADDRESS=<from Track 0>
   ADMIN_PRIVATE_KEY=0x...
   BASE_SEPOLIA_RPC=https://sepolia.base.org
   PORT=3001
   ALLOWED_ORIGINS=http://localhost:3000
   ```
2. Restart API: `npm --prefix api run dev`
3. Smoke test all public routes:
   - `GET /markets/public` → returns seeded markets
   - `GET /markets/:id/public` → returns single market
   - `POST /markets/:id/simulate` → returns price impact
4. Verify x402 middleware is correctly gating paid routes (`POST /bet`, `GET /markets`)
5. Test SSE stream (`GET /stream`) holds connection open

### Agent
**Backend Architect**

### MCP Servers / Skills
| Tool | Purpose |
|---|---|
| `create_file` | Write `api/.env` |
| `run_in_terminal` | Restart server, run curl smoke tests |
| `read_file` | Inspect `api/src/routes/*`, `api/src/middleware/x402.ts` |
| `get_errors` | Catch TypeScript errors after any edits |

### Env vars needed to START
Outputs from Track 0.

---

## Track 2 — Frontend Configuration & UX Fixes
**Depends on: Track 0 addresses. Can start wallet UX fix immediately (no dependency).**

### Goal
Populate frontend env, fix the silent wallet connection failure, surface errors to users.

### Sub-task A (no dependency — start immediately)
Fix `ConnectWalletButton` silent failure — add error state from `useConnect`:
```tsx
const { connect, connectors, isPending, error } = useConnect();
// render error below buttons if error is set
```

### Sub-task B (depends on Track 0)
Populate `frontend/.env.local`:
```
NEXT_PUBLIC_REGISTRY_ADDRESS=<from Track 0>
NEXT_PUBLIC_MARKET_ADDRESS=<from Track 0>
NEXT_PUBLIC_WLD_APP_ID=app_staging_...
NEXT_PUBLIC_WLD_ACTION=register-human
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<already set>
```

### Sub-task C (no dependency — start immediately)
Add `localhost` to Allowed Domains on cloud.reown.com so WalletConnect relay accepts connections.
*(Manual step — cannot be automated)*

### Agent
**Frontend Developer**

### MCP Servers / Skills
| Tool | Purpose |
|---|---|
| `read_file` / `replace_string_in_file` | Edit ConnectWalletButton error handling |
| `create_file` | Write `frontend/.env.local` if not present |
| `replace_string_in_file` | Update `.env.local` with contract addresses |
| `get_errors` | TypeScript validation after edits |
| `run_in_terminal` | Restart Next.js dev server after env change |

---

## Track 3 — Agent Runner Configuration & Testing
**Depends on: Track 0 addresses + Track 1 API running**

### Goal
Configure and run the betting agent, verify x402 payment flow end-to-end.

### Steps
1. Create `agent/.env`:
   ```
   AGENT_PRIVATE_KEY=0x...         # Wallet pre-loaded with MockUSDC + ETH
   API_URL=http://localhost:3001
   ```
2. Approve MockUSDC spend for the agent wallet (cast or ethers script)
3. Run agent: `npm --prefix agent run dev`
4. Verify agent:
   - Fetches markets (pays x402 micro-fee)
   - Evaluates strategy (`shouldBet`)
   - Posts bet (pays x402 fee, USDC transferred on-chain)
   - Respects per-human cap
5. Watch `GET /stream` SSE to confirm bet events emit
6. Run 2–3 agents in parallel with different `AGENT_PRIVATE_KEY` values to test cap enforcement

### Agent
**AI Engineer** (understands agent loops) or **Backend Architect**

### MCP Servers / Skills
| Tool | Purpose |
|---|---|
| `create_file` | Write `agent/.env` |
| `run_in_terminal` | Start agent process, watch logs |
| `read_file` | Inspect `agent/src/index.ts`, `strategy.ts`, `x402Client.ts` |
| `get_errors` | TypeScript validation |

### Env vars needed to START
```
AGENT_PRIVATE_KEY=0x...     # Must be registered as a human OR registered as agent of a human
API_URL=http://localhost:3001
```

---

## Track 4 — World ID Registration Testing
**Depends on: Track 0 addresses + Track 2 frontend running**

### Goal
Verify the full human registration flow: World ID ZK proof → `registerHuman()` on-chain.

### Steps
1. Open frontend at `http://localhost:3000/register`
2. Connect wallet (MetaMask on Base Sepolia)
3. Trigger World ID widget (requires `NEXT_PUBLIC_WLD_APP_ID` set to a valid Staging app)
4. Complete World ID verification in the widget
5. Confirm `registerHuman()` transaction lands on Base Sepolia
6. Verify `humanOf(walletAddress)` returns non-zero in Basescan

### Agent
**Frontend Developer** (verifying UX) or manual step

### MCP Servers / Skills
| Tool | Purpose |
|---|---|
| `browser_navigate` / `browser_snapshot` | Automate the registration UI flow |
| `browser_take_screenshot` | Capture proof of successful registration |
| `run_in_terminal` | `cast call` to verify `humanOf()` on-chain |
| World ID Developer Portal | Get staging app ID configured (manual) |

### Env vars needed to START
```
NEXT_PUBLIC_WLD_APP_ID=app_staging_...    # from developer.worldcoin.org
NEXT_PUBLIC_REGISTRY_ADDRESS=<from Track 0>
```

---

## Dependency Graph

```
Track 0 (Deploy — demo: anvil / testnet: Base Sepolia)
    │
    ├──► Track 1 (API Config + DEMO_MODE code changes)
    │         │
    │         └──► Track 3 (Agent Testing — 2+ agents in parallel)
    │
    └──► Track 2B (Frontend .env)
              │
              └──► Track 4 (World ID Registration — skipped in demo mode)

Track 2A (Wallet UX fix) ──► no dependency, start now
Track 2C (Reown domains) ──► no dependency, start now (manual, testnet only)
```

---

## Minimum to get the app working end-to-end

### Demo mode (no money)
| # | What | Who/How |
|---|---|---|
| 1 | Apply 3 DEMO_MODE code changes | Agent: Track 0 |
| 2 | Start anvil | Agent: Track 0 (`anvil` in background) |
| 3 | Run forge deploy to localhost | Agent: Track 0 |
| 4 | Seed markets + mint MockUSDC via `cast send` | Agent: Track 0 |
| 5 | Write all 3 env files with deployed addresses | Agent: Track 0 |
| 6 | Restart API + frontend servers | Agent: Track 1 |
| 7 | Run agent(s) | Agent: Track 3 |

### Testnet mode (Base Sepolia)
| # | What | Who/How |
|---|---|---|
| 1 | Fund deployer wallet on Base Sepolia | Manual (faucet.base.org) |
| 2 | Run Track 0 deploy script | Agent: DevOps Automator |
| 3 | Fill `api/.env` + `frontend/.env.local` with addresses | Agent: Backend Architect (automatically after Track 0) |
| 4 | Restart API + frontend servers | Agent: any |
| 5 | Add `localhost` to Reown allowed domains | Manual |
| 6 | Connect MetaMask on Base Sepolia and place a bet | Human tester |

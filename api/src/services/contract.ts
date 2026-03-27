import { ethers } from "ethers";

const HUMAN_REGISTRY_ABI = [
  "function humanOf(address wallet) view returns (address)",
];

const WORLD_MARKET_ABI = [
  "function marketCount() view returns (uint256)",
  "function markets(uint256) view returns (string question, uint256 deadline, uint8 status, bool winningOutcome, bool winningOutcomeSet, uint256 yesPool, uint256 noPool)",
  "function perHumanCap() view returns (uint256)",
  "function humanExposure(uint256 marketId, address human) view returns (uint256)",
  "function positions(uint256 marketId, bool outcome, address wallet) view returns (uint256)",
  "function bet(uint256 marketId, bool outcome, uint256 amount)",
];

export interface MarketData {
  id: number;
  question: string;
  deadline: bigint;
  status: number;
  winningOutcome: boolean;
  winningOutcomeSet: boolean;
  yesPool: bigint;
  noPool: bigint;
}

// --- DEMO MODE in-memory state ---
const DEMO_CAP = BigInt("10000000000"); // $10,000 USDC per human

const DEMO_MARKETS: MarketData[] = [
  {
    id: 0,
    question: "Will BTC exceed $150k by end of 2026?",
    deadline: BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600),
    status: 0,
    winningOutcome: false,
    winningOutcomeSet: false,
    yesPool: BigInt("5000000000"),
    noPool: BigInt("3000000000"),
  },
  {
    id: 1,
    question: "Will the Fed cut rates to below 3% before Jan 2027?",
    deadline: BigInt(Math.floor(Date.now() / 1000) + 180 * 24 * 3600),
    status: 0,
    winningOutcome: false,
    winningOutcomeSet: false,
    yesPool: BigInt("2000000000"),
    noPool: BigInt("4000000000"),
  },
  {
    id: 2,
    question: "Will Ethereum EIP-7702 be live on mainnet before 2027?",
    deadline: BigInt(Math.floor(Date.now() / 1000) + 270 * 24 * 3600),
    status: 0,
    winningOutcome: false,
    winningOutcomeSet: false,
    yesPool: BigInt("1500000000"),
    noPool: BigInt("1000000000"),
  },
];

const demoExposure: Record<string, bigint> = {};

// --- Stats counters (DEMO_MODE) ---
let demoTotalBets = 0;
let demoTotalVolume = 0n;
const demoActiveWallets = new Set<string>();

export function getDemoStats(): {
  totalBets: number;
  totalVolume: bigint;
  activeAgents: number;
  marketsOpen: number;
} {
  const marketsOpen = DEMO_MARKETS.filter((m) => m.status === 0).length;
  return {
    totalBets: demoTotalBets,
    totalVolume: demoTotalVolume,
    activeAgents: demoActiveWallets.size,
    marketsOpen,
  };
}

function demoKey(marketId: number, wallet: string): string {
  return `${marketId}:${wallet.toLowerCase()}`;
}
export function resolveMarket(marketId: number, winningOutcome: boolean): void {
  const m = DEMO_MARKETS[marketId];
  if (!m) throw new Error(`Market ${marketId} not found`);
  m.status = 1;
  m.winningOutcome = winningOutcome;
  m.winningOutcomeSet = true;
}

// --- end DEMO MODE state ---

let _provider: ethers.JsonRpcProvider | null = null;

export function getProvider(): ethers.JsonRpcProvider {
  if (!_provider) {
    const rpc =
      process.env.BASE_SEPOLIA_RPC ||
      "https://sepolia.base.org";
    _provider = new ethers.JsonRpcProvider(rpc);
  }
  return _provider;
}

export function getRegistryContract(): ethers.Contract {
  const address =
    process.env.HUMAN_REGISTRY_ADDRESS ||
    "0x0000000000000000000000000000000000000001";
  return new ethers.Contract(address, HUMAN_REGISTRY_ABI, getProvider());
}

export function getMarketContract(): ethers.Contract {
  const address =
    process.env.WORLD_MARKET_ADDRESS ||
    "0x0000000000000000000000000000000000000002";
  const privateKey = process.env.ADMIN_PRIVATE_KEY;
  if (privateKey) {
    const signer = new ethers.Wallet(privateKey, getProvider());
    return new ethers.Contract(address, WORLD_MARKET_ABI, signer);
  }
  return new ethers.Contract(address, WORLD_MARKET_ABI, getProvider());
}

export async function getMarket(id: number): Promise<MarketData> {
  if (process.env.DEMO_MODE === "true") {
    const m = DEMO_MARKETS[id];
    if (!m) throw new Error(`Market ${id} not found`);
    return { ...m };
  }
  const contract = getMarketContract();
  const m = await contract.markets(id);
  return {
    id,
    question: m.question,
    deadline: m.deadline,
    status: Number(m.status),
    winningOutcome: m.winningOutcome,
    winningOutcomeSet: m.winningOutcomeSet,
    yesPool: m.yesPool,
    noPool: m.noPool,
  };
}

export async function getAllMarkets(): Promise<MarketData[]> {
  if (process.env.DEMO_MODE === "true") {
    return DEMO_MARKETS.map((m) => ({ ...m }));
  }
  const contract = getMarketContract();
  const count: bigint = await contract.marketCount();
  const total = Number(count);
  const markets: MarketData[] = [];
  for (let i = 0; i < total; i++) {
    markets.push(await getMarket(i));
  }
  return markets;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function placeBet(
  marketId: number,
  outcome: boolean,
  amount: bigint,
  wallet: string
): Promise<any> {
  if (process.env.DEMO_MODE === "true") {
    const m = DEMO_MARKETS[marketId];
    if (!m) throw new Error(`Market ${marketId} not found`);
    if (outcome) {
      m.yesPool += amount;
    } else {
      m.noPool += amount;
    }
    const key = demoKey(marketId, wallet);
    demoExposure[key] = (demoExposure[key] ?? 0n) + amount;
    // Track stats
    demoTotalBets += 1;
    demoTotalVolume += amount;
    demoActiveWallets.add(wallet.toLowerCase());
    const fakeTxHash = `0x${Buffer.from(
      `demo-${Date.now()}-${Math.random()}`
    ).toString("hex").slice(0, 62)}`;
    return {
      hash: fakeTxHash,
      wait: async () => ({ hash: fakeTxHash }),
    };
  }
  const contract = getMarketContract();
  const tx: ethers.TransactionResponse = await contract.bet(
    marketId,
    outcome,
    amount,
    { from: wallet }
  );
  return tx;
}

export async function humanOf(wallet: string): Promise<string> {
  const contract = getRegistryContract();
  return contract.humanOf(wallet) as Promise<string>;
}

export async function getPerHumanCap(): Promise<bigint> {
  if (process.env.DEMO_MODE === "true") {
    return DEMO_CAP;
  }
  const contract = getMarketContract();
  return contract.perHumanCap() as Promise<bigint>;
}

export async function getHumanExposure(
  marketId: number,
  human: string
): Promise<bigint> {
  if (process.env.DEMO_MODE === "true") {
    return demoExposure[demoKey(marketId, human)] ?? 0n;
  }
  const contract = getMarketContract();
  return contract.humanExposure(marketId, human) as Promise<bigint>;
}


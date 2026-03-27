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
  const contract = getMarketContract();
  const count: bigint = await contract.marketCount();
  const total = Number(count);
  const markets: MarketData[] = [];
  for (let i = 0; i < total; i++) {
    markets.push(await getMarket(i));
  }
  return markets;
}

export async function placeBet(
  marketId: number,
  outcome: boolean,
  amount: bigint,
  wallet: string
): Promise<ethers.TransactionResponse> {
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
  const contract = getMarketContract();
  return contract.perHumanCap() as Promise<bigint>;
}

export async function getHumanExposure(
  marketId: number,
  human: string
): Promise<bigint> {
  const contract = getMarketContract();
  return contract.humanExposure(marketId, human) as Promise<bigint>;
}

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

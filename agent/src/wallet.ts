import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";

const DEMO_KEY = "0x0000000000000000000000000000000000000000000000000000000000000001";

if (!process.env.DEMO_MODE && !process.env.AGENT_PRIVATE_KEY) {
  throw new Error("AGENT_PRIVATE_KEY is required");
}

const account = privateKeyToAccount((process.env.AGENT_PRIVATE_KEY ?? DEMO_KEY) as `0x${string}`);

export const walletAddress: `0x${string}` = account.address;
export const privateKey: `0x${string}` = (process.env.AGENT_PRIVATE_KEY ?? DEMO_KEY) as `0x${string}`;

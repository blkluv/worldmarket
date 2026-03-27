import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

function buildAgentFetch() {
  if (process.env.DEMO_MODE === "true") {
    return fetch;
  }
  const signer = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`);
  const client = new x402Client();
  client.register("eip155:*", new ExactEvmScheme(signer));
  return wrapFetchWithPayment(fetch, client);
}

export const agentFetch = buildAgentFetch();

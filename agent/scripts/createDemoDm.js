import { Client, IdentifierKind } from "@xmtp/node-sdk";
import { createWalletClient, http, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import "dotenv/config";

const DEMO_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

async function createDm() {
  const privateKey = process.env.XMTP_WALLET_KEY || process.env.AGENT_PRIVATE_KEY;
  
  try {
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      transport: http(),
      chain: baseSepolia,
    });

    const signer = {
      type: "EOA",
      getIdentifier: () => ({
        identifier: account.address,
        identifierKind: IdentifierKind.Ethereum,
      }),
      signMessage: async (message) => {
        const sig = await walletClient.signMessage({ message });
        return toBytes(sig);
      },
    };

    console.log("🚀 Initializing Agent XMTP client...");
    const client = await Client.create(signer, { env: "dev" });
    
    console.log("Creating DM with Demo Wallet:", DEMO_ADDRESS);
    const dm = await client.conversations.createDm(DEMO_ADDRESS);
    
    console.log("\n✅ SUCCESS! DM Created.");
    console.log("----------------------------------------------");
    console.log("CONVERSATION ID:", dm.id);
    console.log("----------------------------------------------");
    console.log("\nUpdate your .env files with this ID:");
    console.log(`XMTP_GROUP_ID=${dm.id}`);
    console.log(`NEXT_PUBLIC_XMTP_GROUP_ID=${dm.id}`);
    
  } catch (err) {
    console.error("❌ Failed to create DM:", err.message);
  }
}

createDm();

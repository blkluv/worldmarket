import { Client, IdentifierKind } from "@xmtp/node-sdk";
import { createWalletClient, http, toBytes } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import "dotenv/config";

async function createGroup() {
  // Generate a fresh key for the agent to avoid registration issues
  const privateKey = generatePrivateKey();
  const ownerAddress = process.env.OWNER_ADDRESS || "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  
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

    console.log("🚀 Initializing XMTP client with FRESH key:", account.address);
    const client = await Client.create(signer, { 
      env: "dev",
      dbPath: `./xmtp-fresh-${Date.now()}.db` 
    });
    
    console.log("Creating group and adding owner:", ownerAddress);
    const group = await client.conversations.createGroup([ownerAddress.toLowerCase()]);
    
    console.log("\n✅ SUCCESS! Group Created.");
    console.log("----------------------------------------------");
    console.log("GROUP ID:", group.id);
    console.log("AGENT NEW PRIVATE KEY:", privateKey);
    console.log("----------------------------------------------");
    console.log("\nUPDATE YOUR .env FILES WITH THESE:");
    console.log(`AGENT_PRIVATE_KEY=${privateKey}`);
    console.log(`XMTP_WALLET_KEY=${privateKey}`);
    console.log(`XMTP_GROUP_ID=${group.id}`);
    console.log(`NEXT_PUBLIC_XMTP_GROUP_ID=${group.id}`);
    
  } catch (err) {
    console.error("❌ Failed to create group:", err);
  }
}

createGroup();

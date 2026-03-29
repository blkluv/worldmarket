import { Client, IdentifierKind } from "@xmtp/node-sdk";
import { createWalletClient, http, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import "dotenv/config";

const DEMO_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const DEMO_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function setupDemoGroup() {
  const agentPrivateKey = process.env.XMTP_WALLET_KEY || process.env.AGENT_PRIVATE_KEY;
  if (!agentPrivateKey) {
    console.error("❌ No agent private key found in .env");
    return;
  }

  try {
    // 1. Register the Demo Wallet on XMTP (if not already)
    console.log("🛠 Registering Demo Wallet on XMTP...");
    const demoAccount = privateKeyToAccount(DEMO_PRIVATE_KEY);
    const demoWalletClient = createWalletClient({
      account: demoAccount,
      transport: http(),
      chain: baseSepolia,
    });
    const demoSigner = {
      type: "EOA",
      getIdentifier: () => ({
        identifier: demoAccount.address,
        identifierKind: IdentifierKind.Ethereum,
      }),
      signMessage: async (message) => {
        const sig = await demoWalletClient.signMessage({ message });
        return toBytes(sig);
      },
    };
    const demoClient = await Client.create(demoSigner, { env: "dev" });
    console.log("✅ Demo Wallet registered:", demoClient.address);

    // 2. Initialize Agent Client
    console.log("\n🚀 Initializing Agent client...");
    const agentAccount = privateKeyToAccount(agentPrivateKey);
    const agentWalletClient = createWalletClient({
      account: agentAccount,
      transport: http(),
      chain: baseSepolia,
    });
    const agentSigner = {
      type: "EOA",
      getIdentifier: () => ({
        identifier: agentAccount.address,
        identifierKind: IdentifierKind.Ethereum,
      }),
      signMessage: async (message) => {
        const sig = await agentWalletClient.signMessage({ message });
        return toBytes(sig);
      },
    };
    const agentClient = await Client.create(agentSigner, { env: "dev" });
    console.log("✅ Agent client ready:", agentClient.address);

    // 3. Create a NEW group with the Demo Wallet
    console.log("\n📦 Creating fresh group with Agent and Demo Wallet...");
    const group = await agentClient.conversations.createGroup([demoAccount.address]);
    
    console.log("\n🎉 SUCCESS! Fresh Group Created.");
    console.log("----------------------------------------------");
    console.log("NEW GROUP ID:", group.id);
    console.log("----------------------------------------------");
    console.log("\nUpdate your .env files with this NEW ID:");
    console.log(`XMTP_GROUP_ID=${group.id}`);
    console.log(`NEXT_PUBLIC_XMTP_GROUP_ID=${group.id}`);
    
  } catch (err) {
    console.error("❌ Setup failed:", err);
  }
}

setupDemoGroup();

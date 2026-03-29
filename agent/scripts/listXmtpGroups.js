import { Client, IdentifierKind } from "@xmtp/node-sdk";
import { createWalletClient, http, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import "dotenv/config";

async function createGroup() {
  const privateKey = process.env.XMTP_WALLET_KEY || process.env.AGENT_PRIVATE_KEY;
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

    console.log("🚀 Initializing XMTP client...");
    const client = await Client.create(signer, { env: "dev" });
    
    console.log("Syncing conversations...");
    await client.conversations.sync();
    
    console.log("Listing existing groups...");
    const groups = await client.conversations.listGroups();
    
    if (groups.length > 0) {
      console.log("\n✅ Found existing groups:");
      groups.forEach(g => console.log(`- ID: ${g.id} (Name: ${g.name || 'Unnamed'})`));
      console.log("\nYou can use one of these IDs in your .env");
    } else {
      console.log("\nNo existing groups found. Attempting to create a new one...");
      const group = await client.conversations.createGroup([ownerAddress.toLowerCase()]);
      console.log("\n✅ SUCCESS! Group Created.");
      console.log("GROUP ID:", group.id);
    }
    
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

createGroup();

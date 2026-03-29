import { Client, IdentifierKind } from "@xmtp/node-sdk";
import { createWalletClient, http, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import "dotenv/config";

const DEMO_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

async function manageGroups() {
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

    console.log("🚀 Initializing XMTP client...");
    const client = await Client.create(signer, { env: "dev" });
    
    console.log("Syncing conversations...");
    await client.conversations.sync();
    
    const groups = await client.conversations.listGroups();
    console.log(`\nFound ${groups.length} existing groups.`);

    for (const group of groups) {
      console.log(`\nChecking Group: ${group.id}`);
      const members = await group.members();
      const isDemoMember = members.some(m => 
        m.inboxId.toLowerCase() === DEMO_ADDRESS.toLowerCase() || 
        m.accountAddresses.some(a => a.toLowerCase() === DEMO_ADDRESS.toLowerCase())
      );

      if (isDemoMember) {
        console.log("✅ Demo Wallet is already a member of this group.");
      } else {
        console.log("➕ Adding Demo Wallet to this group...");
        try {
          await group.addMembers([DEMO_ADDRESS]);
          console.log("✅ Successfully added Demo Wallet!");
        } catch (e) {
          console.error("❌ Failed to add member:", e.message);
        }
      }
    }
    
  } catch (err) {
    console.error("❌ Error:", err);
  }
}

manageGroups();

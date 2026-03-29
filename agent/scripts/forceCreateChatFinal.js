import { Client, IdentifierKind } from "@xmtp/node-sdk";
import { createWalletClient, http, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import "dotenv/config";

const DEMO_ADDRESS = "0x287A2bb05CFfd1093B9ea1816118fcCf81A142d7";
const DEMO_PRIVATE_KEY = "0xa1ce56f6102a4acd7d6846499fbedc0bfbb3445da4a981da957a03d0d922c437";

async function forceCreateChat() {
  const privateKey = process.env.XMTP_WALLET_KEY;
  if (!privateKey) {
    console.error("❌ No XMTP_WALLET_KEY found in .env");
    return;
  }

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
        identifier: account.address.toLowerCase(),
        identifierKind: IdentifierKind.Ethereum,
      }),
      signMessage: async (message) => {
        const sig = await walletClient.signMessage({ message });
        return toBytes(sig);
      },
    };

    console.log(`🚀 Agent (${account.address}): Initializing XMTP...`);
    // Use a fresh DB to avoid any local corruption
    const client = await Client.create(signer, { 
        env: "dev",
        dbPath: `./xmtp-agent-force-v5.db` 
    });
    
    console.log(`📨 Agent: Establishing chat with Demo Wallet (${DEMO_ADDRESS})...`);
    
    // In v5.1.0 it's createDm
    let dm;
    try {
        dm = await client.conversations.createDm(DEMO_ADDRESS);
    } catch (e) {
        console.log("createDm failed, trying sync and list...");
        await client.conversations.sync();
        const all = await client.conversations.list();
        dm = all.find(c => c.dmPeerInboxId?.toLowerCase() === DEMO_ADDRESS.toLowerCase());
        if (!dm) throw e;
    }

    await dm.sendText("🤖 Hello! I am your trading agent. I'm now using the NEW keys you provided and I've established this connection.");
    
    console.log("\n✅ SUCCESS! Chat established.");
    console.log("----------------------------------------------");
    console.log("CONVERSATION ID:", dm.id);
    console.log("----------------------------------------------");
    
  } catch (err) {
    console.error("❌ Failed:", err.message);
  }
}

forceCreateChat();

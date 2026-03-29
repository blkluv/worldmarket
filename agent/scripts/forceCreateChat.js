import { Client, IdentifierKind } from "@xmtp/node-sdk";
import { createWalletClient, http, toBytes } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import "dotenv/config";

const DEMO_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

async function forceCreateChat() {
  const freshKey = generatePrivateKey();
  const account = privateKeyToAccount(freshKey);
  
  console.log(`🆕 Generated FRESH Agent Address: ${account.address}`);

  try {
    const walletClient = createWalletClient({
      account,
      transport: http(),
      chain: baseSepolia,
    });

    const signer = {
      type: "EOA",
      getIdentifier: () => ({
        // TRYING WITHOUT 0x PREFIX IN IDENTIFIER
        identifier: account.address.toLowerCase(),
        identifierKind: IdentifierKind.Ethereum,
      }),
      signMessage: async (message) => {
        const sig = await walletClient.signMessage({ message });
        return toBytes(sig);
      },
    };

    console.log("🚀 Agent: Initializing XMTP...");
    const client = await Client.create(signer, { 
        env: "dev",
        dbPath: `./xmtp-agent-fresh-${Date.now()}.db` 
    });
    
    console.log(`📨 Agent: Establishing chat with Demo Wallet (${DEMO_ADDRESS})...`);
    
    let dm;
    if (typeof client.conversations.createDm === 'function') {
        dm = await client.conversations.createDm(DEMO_ADDRESS);
    } else {
        throw new Error("No DM creation method found");
    }

    await dm.sendText("🤖 Hello! I am your NEW trading agent.");
    
    console.log("\n✅ SUCCESS!");
    console.log("NEW AGENT PRIVATE KEY:", freshKey);
    console.log("CONVERSATION ID:", dm.id);
    
  } catch (err) {
    console.error("❌ Failed:", err.message);
  }
}

forceCreateChat();

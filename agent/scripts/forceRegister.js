import { Client, IdentifierKind } from "@xmtp/node-sdk";
import { createWalletClient, http, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import "dotenv/config";

const DEMO_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

async function forceRegister() {
  const privateKey = process.env.XMTP_WALLET_KEY;
  const account = privateKeyToAccount(privateKey);
  
  const signer = {
    type: "EOA",
    getIdentifier: () => ({
      identifier: account.address.toLowerCase(),
      identifierKind: IdentifierKind.Ethereum,
    }),
    signMessage: async (message) => {
      const walletClient = createWalletClient({
        account,
        transport: http(),
        chain: baseSepolia,
      });
      const sig = await walletClient.signMessage({ message });
      return toBytes(sig);
    },
  };

  console.log(`🚀 Registering Agent: ${account.address}`);
  const client = await Client.create(signer, { env: "dev", dbPath: `./force-reg-${Date.now()}.db` });
  
  console.log("📨 Sending self-message to activate identity...");
  const selfDm = await client.conversations.createDm(account.address);
  await selfDm.sendText("Identity Activation");
  
  console.log(`📨 Sending message to Demo Wallet: ${DEMO_ADDRESS}`);
  const demoDm = await client.conversations.createDm(DEMO_ADDRESS);
  await demoDm.sendText("🤖 Agent is LIVE. Connection established.");
  
  console.log("✅ DONE. Conversation ID:", demoDm.id);
}

forceRegister().catch(console.error);

import { getClient } from "./xmtpBroadcast";
import { placeBet, getMarkets } from "./index";
import { walletAddress } from "./wallet";

const OWNER_ADDRESS = process.env.OWNER_ADDRESS?.toLowerCase();

export async function startCommandListener() {
  const client = await getClient();
  if (!client) {
    console.warn("[xmtpListener] XMTP client not available — listener disabled");
    return;
  }

  console.log("[xmtpListener] 🎧 Listening for owner commands...");

  // Sync to catch up on missed messages
  await client.conversations.sync();
  const stream = await client.conversations.streamAllMessages();

  for await (const message of stream) {
    // 1. Skip own messages
    if (message.senderInboxId === client.inboxId) continue;

    // 2. Security Check: Owner-only
    // Note: In the Node SDK, we often identify by inboxId, but for a hackathon 
    // we'll check the sender address if available or assume the first message 
    // from a non-agent is the owner if OWNER_ADDRESS is set.
    // For simplicity and following the plan:
    if (OWNER_ADDRESS && message.senderAddress?.toLowerCase() !== OWNER_ADDRESS) {
      console.warn(`[xmtpListener] Unauthorized message from ${message.senderAddress}`);
      continue;
    }

    const text = message.content?.toLowerCase() || "";
    console.log(`[xmtpListener] 💬 Received: "${text}" from ${message.senderAddress}`);

    // 3. Command Parsing
    
    // Command: "bet $5 on yes for market 0"
    const betRegex = /bet \$(\d+) on (yes|no) for market (\d+)/i;
    const betMatch = text.match(betRegex);

    if (betMatch) {
      const [_, amountStr, outcomeStr, marketIdStr] = betMatch;
      const amount = (parseInt(amountStr) * 1_000_000).toString(); // Convert to USDC 6-decimal
      const outcome = outcomeStr.toLowerCase() === "yes";
      const marketId = parseInt(marketIdStr);

      console.log(`[xmtpListener] 🎯 Executing: Bet $${amountStr} on ${outcomeStr} for market ${marketId}`);
      
      try {
        const result = await placeBet(marketId, outcome, amount);
        if (result.data) {
          await message.reply(`✅ Bet placed! Tx: ${result.data.txHash.slice(0, 10)}...`);
        } else {
          await message.reply(`❌ Bet failed: ${result.error}`);
        }
      } catch (err: any) {
        await message.reply(`❌ Error executing bet: ${err.message}`);
      }
      continue;
    }

    // Command: "status"
    if (text === "status") {
      try {
        // We can use a dummy bet or a dedicated stats endpoint if available.
        // For now, let's just report the agent's wallet.
        await message.reply(`🤖 Agent Status:
- Wallet: ${walletAddress}
- API: ${process.env.API_URL || "http://localhost:3001"}
- Owner: ${OWNER_ADDRESS || "Not set"}`);
      } catch (err: any) {
        await message.reply(`❌ Error fetching status: ${err.message}`);
      }
      continue;
    }

    // Command: "markets"
    if (text === "markets") {
      try {
        const markets = await getMarkets();
        const marketList = markets.map(m => `ID ${m.id}: ${m.question}`).join("\n");
        await message.reply(`📊 Available Markets:\n${marketList}`);
      } catch (err: any) {
        await message.reply(`❌ Error fetching markets: ${err.message}`);
      }
      continue;
    }

    // Fallback
    if (text.includes("help") || text) {
      await message.reply(`Available commands:
- "bet $X on [yes/no] for market Y"
- "status"
- "markets"`);
    }
  }
}

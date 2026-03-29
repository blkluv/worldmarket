import Link from "next/link";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { AgentChatClient } from "@/components/AgentChatClient";

const XMTP_GROUP_ID = process.env.NEXT_PUBLIC_XMTP_GROUP_ID ?? "";
const AGENT_XMTP_ADDRESS = process.env.NEXT_PUBLIC_AGENT_XMTP_ADDRESS ?? "";

export default function ChatPage() {
  return (
    <div className="page-shell">
      <header className="site-header">
        <div className="site-header__brand">
          <span className="site-header__mark">◈</span>
          <span className="site-header__name">WorldMarket</span>
        </div>
        <nav className="site-header__nav">
          <Link href="/" className="nav-link">
            Markets
          </Link>
          <Link href="/agents" className="nav-link">
            Agent Battle
          </Link>
          <Link href="/chat" className="nav-link">
            Agent Chat
          </Link>
          <Link href="/trades" className="nav-link">
            Your Trades
          </Link>
          <ConnectWalletButton />
        </nav>
      </header>

      <main className="chat-page">
        <div className="chat-page__header">
          <h1 className="chat-page__title font-sans">Agent Broadcast</h1>
          <p className="chat-page__subtitle font-mono">
            Live XMTP feed of agent bets and cap events.
          </p>
        </div>

        <AgentChatClient groupId={XMTP_GROUP_ID} agentAddress={AGENT_XMTP_ADDRESS} />
      </main>
    </div>
  );
}

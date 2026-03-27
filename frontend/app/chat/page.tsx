import Link from "next/link";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { AgentChat } from "@/components/AgentChat";

const XMTP_GROUP_ID = process.env.NEXT_PUBLIC_XMTP_GROUP_ID ?? "";

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
            ← Markets
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

        <AgentChat groupId={XMTP_GROUP_ID} />
      </main>
    </div>
  );
}

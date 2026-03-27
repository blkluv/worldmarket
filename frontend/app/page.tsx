import Link from "next/link";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { LiveStatsTicker } from "@/components/LiveStatsTicker";
import { HomepageFeed } from "@/components/HomepageFeed";
import { CountdownTimer } from "@/components/CountdownTimer";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface Market {
  id: number;
  question: string;
  deadline: string;
  status: string;
  price: { yes: number; no: number };
}

async function getMarkets(): Promise<Market[]> {
  try {
    const res = await fetch(`${API_URL}/markets/public`, { cache: "no-store" });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: Market[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const markets = await getMarkets();

  return (
    <div className="page-shell">
      <header className="site-header">
        <div className="site-header__brand">
          <span className="site-header__mark">◈</span>
          <span className="site-header__name">WorldMarket</span>
        </div>
        <nav className="site-header__nav" aria-label="Primary navigation">
          <Link href="/register" className="nav-link">
            Register
          </Link>
          <Link href="/chat" className="nav-link">
            Agent Chat
          </Link>
          <ConnectWalletButton />
        </nav>
      </header>

      <main className="page-content">
        <section className="hero-section" aria-labelledby="hero-heading">
          <h1 id="hero-heading" className="hero-heading">
            Prediction markets
            <br />
            <span className="hero-heading__accent">for verified humans</span>
          </h1>
          <p className="hero-sub">
            Per-human exposure caps enforced on-chain via World ID.
            AI agents pay to play. You set the ceiling.
          </p>
        </section>

        <section aria-labelledby="markets-heading">
          <div className="section-header">
            <h2 id="markets-heading" className="section-title">
              Open markets
            </h2>
            <span className="section-count font-mono">{markets.length} active</span>
          </div>

          {markets.length === 0 ? (
            <div className="empty-state" role="status">
              No markets available
            </div>
          ) : (
            <ul className="market-list" role="list" aria-label="Open prediction markets">
              {markets.map((market) => (
                <li key={market.id} className="market-card">
                  <Link
                    href={`/market/${market.id}`}
                    className="market-card__link"
                    aria-label={`View market: ${market.question}`}
                  >
                    <div className="market-card__id font-mono">
                      MKT-{String(market.id).padStart(4, "0")}
                    </div>
                    <h3 className="market-card__question">{market.question}</h3>
                    <div className="market-card__footer">
                      <div className="market-card__odds" aria-label="Current odds">
                        <span
                          className="odds-yes font-mono"
                          aria-label={`Yes: ${(market.price.yes * 100).toFixed(1)} cents`}
                        >
                          Yes {(market.price.yes * 100).toFixed(1)}¢
                        </span>
                        <span className="odds-divider" aria-hidden="true">
                          /
                        </span>
                        <span
                          className="odds-no font-mono"
                          aria-label={`No: ${(market.price.no * 100).toFixed(1)} cents`}
                        >
                          No {(market.price.no * 100).toFixed(1)}¢
                        </span>
                      </div>
                      <div
                        className="market-card__deadline font-mono"
                      >
                        <CountdownTimer deadline={Number(market.deadline)} />
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <LiveStatsTicker apiUrl={API_URL} />

        <HomepageFeed apiUrl={API_URL} />
      </main>
    </div>
  );
}

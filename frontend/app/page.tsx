import Link from "next/link";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";

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

function formatDeadline(ts: string): string {
  return new Date(Number(ts) * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function HomePage() {
  const markets = await getMarkets();

  return (
    <div className="page-shell">
      <header className="site-header">
        <div className="site-header__brand">
          <span className="site-header__mark font-mono">◈</span>
          <span className="site-header__name font-sans">WORLDMARKET</span>
        </div>
        <nav className="site-header__nav" aria-label="Primary navigation">
          <Link href="/register" className="nav-link font-mono">
            REGISTER
          </Link>
          <ConnectWalletButton />
        </nav>
      </header>

      <main className="page-content">
        <section className="hero-section" aria-labelledby="hero-heading">
          <h1 id="hero-heading" className="hero-heading font-sans">
            PREDICTION MARKETS
            <br />
            <span className="hero-heading__accent">FOR VERIFIED HUMANS</span>
          </h1>
          <p className="hero-sub font-mono">
            Per‑human exposure caps enforced on‑chain via World ID.
            <br />
            AI agents pay to play. You set the ceiling.
          </p>
        </section>

        <section aria-labelledby="markets-heading">
          <div className="section-header">
            <h2 id="markets-heading" className="section-title font-sans">
              OPEN MARKETS
            </h2>
            <span className="section-count font-mono">{markets.length} active</span>
          </div>

          {markets.length === 0 ? (
            <div className="empty-state font-mono" role="status">
              — NO MARKETS AVAILABLE —
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
                    <h3 className="market-card__question font-sans">{market.question}</h3>
                    <div className="market-card__footer">
                      <div className="market-card__odds" aria-label="Current odds">
                        <span
                          className="odds-yes font-mono"
                          aria-label={`Yes: ${(market.price.yes * 100).toFixed(1)} cents`}
                        >
                          YES {(market.price.yes * 100).toFixed(1)}¢
                        </span>
                        <span className="odds-divider" aria-hidden="true">
                          /
                        </span>
                        <span
                          className="odds-no font-mono"
                          aria-label={`No: ${(market.price.no * 100).toFixed(1)} cents`}
                        >
                          NO {(market.price.no * 100).toFixed(1)}¢
                        </span>
                      </div>
                      <div
                        className="market-card__deadline font-mono"
                        aria-label={`Deadline: ${formatDeadline(market.deadline)}`}
                      >
                        {formatDeadline(market.deadline)}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

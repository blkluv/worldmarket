import { CapMeter } from "@/components/CapMeter";
import { MarketAgentPanel } from "@/components/MarketAgentPanel";
import { PriceChart } from "@/components/PriceChart";
import { BetForm } from "@/components/BetForm";
import Link from "next/link";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface Market {
  id: number;
  question: string;
  deadline: string;
  status: string;
  statusLabel: string;
  price: { yes: number; no: number };
  yesPool: string;
  noPool: string;
  humanCap: string;
}

interface MarketResponse {
  data?: Market;
}

async function getMarket(id: string): Promise<Market | null> {
  try {
    const res = await fetch(`${API_URL}/markets/${id}/public`, { cache: "no-store" });
    if (!res.ok) return null;
    const json: MarketResponse = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

function formatDeadline(ts: string): string {
  return new Date(Number(ts) * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function MarketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const market = await getMarket(id);

  if (!market) {
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
        <main className="market-detail">
          <Link href="/" className="market-back-link">
            ← All markets
          </Link>
          <div className="empty-state" role="status">
            Market not found
          </div>
        </main>
      </div>
    );
  }

  const totalPool = (BigInt(market.yesPool ?? "0") + BigInt(market.noPool ?? "0")).toString();

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

      <main className="market-detail">
        <Link href="/" className="market-back-link">
          ← All markets
        </Link>

        <div className="market-detail__header">
          <div className="market-detail__id font-mono">
            MKT-{String(market.id).padStart(4, "0")}
          </div>
          <h1 className="market-detail__question font-sans">{market.question}</h1>
          <div className="market-detail__meta">
            <span
              className={`market-status-badge font-mono ${
                market.status === "OPEN"
                  ? "market-status-badge--open"
                  : "market-status-badge--closed"
              }`}
            >
              {market.statusLabel}
            </span>
            <span className="font-mono">Deadline: {formatDeadline(market.deadline)}</span>
          </div>
        </div>

        {/* Price grid */}
        <section aria-label="Current prices">
          <div className="section-header">
            <h2 className="section-title">Current prices</h2>
          </div>
          <div className="price-grid">
            <div className="price-card">
              <div className="price-card__label">Yes</div>
              <div className="price-card__value price-card__value--yes font-mono">
                {(market.price.yes * 100).toFixed(1)}¢
              </div>
            </div>
            <div className="price-card">
              <div className="price-card__label">No</div>
              <div className="price-card__value price-card__value--no font-mono">
                {(market.price.no * 100).toFixed(1)}¢
              </div>
            </div>
            <div className="price-card">
              <div className="price-card__label">Total pool</div>
              <div className="price-card__value price-card__value--pool font-mono">
                ${(Number(totalPool) / 1_000_000).toFixed(2)}
              </div>
            </div>
          </div>
        </section>

        {/* Human Cap Meter */}
        <section aria-labelledby="cap-heading">
          <div className="section-header">
            <h2 id="cap-heading" className="section-title">
              Human cap exposure
            </h2>
          </div>
          <CapMeter
            exposure={market.yesPool ?? "0"}
            cap={market.humanCap ?? "0"}
            label="Yes pool / per-human cap"
          />
        </section>

        {/* Price Chart */}
        <section aria-labelledby="chart-heading">
          <div className="section-header">
            <h2 id="chart-heading" className="section-title">
              Price history
            </h2>
          </div>
          <PriceChart marketId={market.id} apiUrl={API_URL} />
        </section>

        {/* Place a bet */}
        <section aria-labelledby="bet-heading">
          <div className="section-header">
            <h2 id="bet-heading" className="section-title">
              Place a bet
            </h2>
          </div>
          <BetForm marketId={market.id} marketStatus={market.status} />
        </section>

        {/* Agent Activity Panel */}
        <section aria-labelledby="agents-heading">
          <div className="section-header">
            <h2 id="agents-heading" className="section-title">
              Agent activity
            </h2>
          </div>
          <MarketAgentPanel apiUrl={API_URL} marketId={market.id} />
        </section>
      </main>
    </div>
  );
}

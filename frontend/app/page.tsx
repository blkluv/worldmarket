import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface MarketPrice {
  yes: number;
  no: number;
}

interface Market {
  id: number;
  question: string;
  deadline: number;
  status: string;
  price: MarketPrice;
}

interface MarketsResponse {
  data?: Market[];
  error?: string;
}

async function getMarkets(): Promise<Market[]> {
  try {
    const res = await fetch(`${API_URL}/markets`, { cache: "no-store" });
    if (!res.ok) return [];
    const json: MarketsResponse = await res.json();
    return json.data ?? [];
  } catch {
    return [];
  }
}

function formatDeadline(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function HomePage() {
  const markets = await getMarkets();

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "2rem 1rem" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: "bold" }}>🌍 WorldMarket</h1>
        <p style={{ color: "#666" }}>Prediction markets with World ID human caps</p>
        <Link href="/register" style={{ color: "#2563eb" }}>
          Register / Connect Agent →
        </Link>
      </header>

      <h2 style={{ fontSize: "1.25rem", fontWeight: "600", marginBottom: "1rem" }}>Open Markets</h2>

      {markets.length === 0 ? (
        <p style={{ color: "#888" }}>No markets available. API may require x402 payment from agent.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "1rem" }}>
          {markets.map((market) => (
            <li
              key={market.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: "0.5rem",
                padding: "1rem",
                background: "#fafafa",
              }}
            >
              <Link href={`/market/${market.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ fontWeight: "600", marginBottom: "0.5rem" }}>{market.question}</div>
                <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.875rem", color: "#555" }}>
                  <span>
                    YES:{" "}
                    <strong style={{ color: "#16a34a" }}>
                      {(market.price?.yes * 100).toFixed(1)}¢
                    </strong>
                  </span>
                  <span>
                    NO:{" "}
                    <strong style={{ color: "#dc2626" }}>
                      {(market.price?.no * 100).toFixed(1)}¢
                    </strong>
                  </span>
                  <span>Deadline: {formatDeadline(market.deadline)}</span>
                  <span
                    style={{
                      padding: "0.1rem 0.5rem",
                      borderRadius: "9999px",
                      background: market.status === "OPEN" ? "#dcfce7" : "#f3f4f6",
                      color: market.status === "OPEN" ? "#15803d" : "#6b7280",
                      fontWeight: "500",
                    }}
                  >
                    {market.status}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

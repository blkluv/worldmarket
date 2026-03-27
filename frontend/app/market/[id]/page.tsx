import { CapMeter } from "../../../components/CapMeter";
import { AgentFeed } from "../../../components/AgentFeed";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface Market {
  id: number;
  question: string;
  deadline: number;
  status: string;
  price: { yes: number; no: number };
  yesPool: string;
  noPool: string;
}

interface MarketResponse {
  data?: Market;
}

interface ExposureResponse {
  data?: { humanExposure: string; humanCap: string };
}

async function getMarket(id: string): Promise<Market | null> {
  try {
    const res = await fetch(`${API_URL}/markets/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json: MarketResponse = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}

function formatDeadline(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

export default async function MarketPage({ params }: { params: { id: string } }) {
  const market = await getMarket(params.id);

  if (!market) {
    return (
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "2rem 1rem" }}>
        <Link href="/">← Back</Link>
        <p style={{ marginTop: "1rem", color: "#888" }}>
          Market not found. The API may require x402 payment from an agent.
        </p>
      </main>
    );
  }

  // Approximate human cap as 2 USDC for display (actual value from contract)
  const humanCap = "2000000";
  // We don't know caller's address server-side; show pool stats as proxy
  const totalPool = (BigInt(market.yesPool ?? "0") + BigInt(market.noPool ?? "0")).toString();

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "2rem 1rem" }}>
      <Link href="/" style={{ color: "#2563eb", fontSize: "0.875rem" }}>
        ← All Markets
      </Link>

      <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", margin: "1rem 0 0.5rem" }}>
        {market.question}
      </h1>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", fontSize: "0.875rem", color: "#555" }}>
        <span>Deadline: {formatDeadline(market.deadline)}</span>
        <span
          style={{
            padding: "0.1rem 0.5rem",
            borderRadius: "9999px",
            background: market.status === "OPEN" ? "#dcfce7" : "#f3f4f6",
            color: market.status === "OPEN" ? "#15803d" : "#6b7280",
          }}
        >
          {market.status}
        </span>
      </div>

      {/* Price display */}
      <section
        style={{
          display: "flex",
          gap: "1.5rem",
          marginBottom: "1.5rem",
          padding: "1rem",
          background: "#f9fafb",
          borderRadius: "0.5rem",
          border: "1px solid #e5e7eb",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>YES Price</div>
          <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#16a34a" }}>
            {(market.price.yes * 100).toFixed(1)}¢
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>NO Price</div>
          <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#dc2626" }}>
            {(market.price.no * 100).toFixed(1)}¢
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>Total Pool</div>
          <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#1d4ed8" }}>
            ${(Number(totalPool) / 1_000_000).toFixed(2)}
          </div>
        </div>
      </section>

      {/* Human Cap Meter — shows pool-based estimate */}
      <section style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontWeight: "600", marginBottom: "0.75rem" }}>Human Cap Exposure</h2>
        <CapMeter
          exposure={market.yesPool ?? "0"}
          cap={humanCap}
          label="YES pool / per-human cap"
        />
      </section>

      {/* Live Agent Feed */}
      <section>
        <h2 style={{ fontWeight: "600", marginBottom: "0.75rem" }}>Live Agent Activity</h2>
        <AgentFeed apiUrl={API_URL} marketId={market.id} />
      </section>
    </main>
  );
}

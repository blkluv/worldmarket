// XMTP proxy — forwards requests to the agent's HTTP relay server.
// Locally this is http://localhost:3002.
// In production set XMTP_RELAY_URL to the agent's Railway public URL, e.g.
//   https://worldmarket-agent-production.up.railway.app
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

const AGENT_RELAY_URL =
  process.env.XMTP_RELAY_URL ?? "http://localhost:3002";

const UNREACHABLE_MSG = `Agent relay unreachable at ${AGENT_RELAY_URL}. Locally: run 'npm start' in agent/. In production: set XMTP_RELAY_URL env var in the frontend Railway service to point to the agent's public URL.`;

// ─── GET: Fetch recent messages from agent relay ──────────────────────────────
export async function GET(_req: NextRequest) {
  try {
    const res = await fetch(`${AGENT_RELAY_URL}/messages`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ ok: false, error: text }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    const msg = err?.cause?.code === "ECONNREFUSED"
      ? UNREACHABLE_MSG
      : err.message;
    return NextResponse.json({ ok: false, error: msg }, { status: 503 });
  }
}

// ─── POST: Send a message via agent relay ────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text?.trim()) {
      return NextResponse.json({ ok: false, error: "Empty message" }, { status: 400 });
    }

    const conversationId = process.env.NEXT_PUBLIC_XMTP_GROUP_ID;
    const res = await fetch(`${AGENT_RELAY_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, conversationId }),
      cache: "no-store",
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Unknown error" }));
      return NextResponse.json({ ok: false, error: data.error }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    const msg = err?.cause?.code === "ECONNREFUSED"
      ? UNREACHABLE_MSG
      : err.message;
    return NextResponse.json({ ok: false, error: msg }, { status: 503 });
  }
}

import { signRequest } from "@worldcoin/idkit/signing";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (!action || typeof action !== "string") {
      return NextResponse.json({ error: "action is required" }, { status: 400 });
    }

    const rpSigningKey = process.env.RP_SIGNING_KEY;
    const rpId = process.env.RP_ID;
    if (!rpSigningKey || !rpId) {
      return NextResponse.json({ error: "server misconfiguration" }, { status: 500 });
    }

    // signRequest returns { sig, nonce, createdAt, expiresAt }
    // Map to the RpContext shape expected by IDKit: { rp_id, signature, nonce, created_at, expires_at }
    const { sig, nonce, createdAt, expiresAt } = signRequest(action, rpSigningKey);
    return NextResponse.json({
      rp_id: rpId,
      signature: sig,
      nonce,
      created_at: createdAt,
      expires_at: expiresAt,
    });
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
}

"use client";

import { useState } from "react";
import { IDKitRequestWidget, orbLegacy, type IDKitResult, type RpContext } from "@worldcoin/idkit";

interface WorldIDButtonProps {
  onVerify: (result: IDKitResult) => void;
  walletAddress: `0x${string}`;
  action?: string;
}

export function WorldIDButton({ onVerify, walletAddress, action = "register-human" }: WorldIDButtonProps) {
  const [open, setOpen] = useState(false);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const appId = (process.env.NEXT_PUBLIC_WLD_APP_ID ?? "") as `app_${string}`;

  async function handleClick() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/rp-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("Failed to get rp_context from server");
      const ctx: RpContext = await res.json();
      setRpContext(ctx);
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          padding: "0.5rem 1rem",
          background: "#1d4ed8",
          color: "white",
          border: "none",
          borderRadius: "0.375rem",
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? "Loading..." : "Verify with World ID"}
      </button>
      {error && <p style={{ color: "#dc2626", marginTop: "0.5rem", fontSize: "0.875rem" }}>{error}</p>}

      {rpContext && (
        <IDKitRequestWidget
          app_id={appId}
          action={action}
          rp_context={rpContext}
          allow_legacy_proofs={true}
          preset={orbLegacy({ signal: walletAddress })}
          open={open}
          onOpenChange={setOpen}
          onSuccess={onVerify}
        />
      )}
    </div>
  );
}

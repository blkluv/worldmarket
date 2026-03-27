"use client";
import { useState } from "react";
import { IDKitRequestWidget, orbLegacy, type IDKitResult, type RpContext } from "@worldcoin/idkit";

interface WorldIDButtonProps {
  onVerify: (result: IDKitResult) => void;
  walletAddress: `0x${string}`;
  action?: string;
}

export function WorldIDButton({
  onVerify,
  walletAddress,
  action = process.env.NEXT_PUBLIC_WLD_ACTION ?? "register-human",
}: WorldIDButtonProps) {
  const [open, setOpen] = useState(false);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadRpContext() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rp-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(`rp-signature ${res.status}`);
      const ctx = (await res.json()) as RpContext;
      setRpContext(ctx);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load World ID context");
    } finally {
      setLoading(false);
    }
  }

  if (error) {
    return (
      <button className="wid-btn wid-btn--error font-mono" onClick={loadRpContext}>
        ✕ {error} — RETRY
      </button>
    );
  }

  if (loading) {
    return (
      <button className="wid-btn wid-btn--loading font-mono" disabled>
        LOADING WORLD ID…
      </button>
    );
  }

  return (
    <>
      <button
        className={`wid-btn ${rpContext ? "wid-btn--ready" : ""} font-mono`}
        onClick={rpContext ? () => setOpen(true) : loadRpContext}
      >
        {rpContext ? "◎ WORLD ID READY — CLICK TO SCAN" : "VERIFY WITH WORLD ID ◎"}
      </button>
      {rpContext && (
        <IDKitRequestWidget
          app_id={(process.env.NEXT_PUBLIC_WLD_APP_ID ?? "") as `app_${string}`}
          action={action}
          rp_context={rpContext}
          allow_legacy_proofs={true}
          preset={orbLegacy({ signal: walletAddress })}
          open={open}
          onOpenChange={setOpen}
          onSuccess={onVerify}
        />
      )}
    </>
  );
}

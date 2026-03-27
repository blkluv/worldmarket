"use client";

import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { MARKET } from "@/lib/contracts";

const MAX_ERROR_MESSAGE_LENGTH = 120;

interface BetFormProps {
  marketId: number;
  marketStatus: string;
}

export function BetForm({ marketId, marketStatus }: BetFormProps) {
  const [outcome, setOutcome] = useState<boolean | null>(null);
  const [amount, setAmount] = useState("1");
  const [amountError, setAmountError] = useState<string | null>(null);

  const { isConnected } = useAccount();
  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const isOpen = marketStatus === "OPEN";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (outcome === null) return;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setAmountError("Enter a valid amount greater than zero.");
      return;
    }
    setAmountError(null);
    const amountMicro = BigInt(Math.round(parsed * 1_000_000));
    writeContract({
      ...MARKET,
      functionName: "bet",
      args: [BigInt(marketId), outcome, amountMicro],
    });
  }

  function handleReset() {
    reset();
    setOutcome(null);
    setAmount("1");
    setAmountError(null);
  }

  const canSubmit =
    isConnected && isOpen && outcome !== null && !isPending && !isConfirming;

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        border: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        padding: "var(--space-6)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
      }}
      aria-label="Place a bet"
    >
      {/* Outcome selector */}
      <div
        style={{
          display: "flex",
          gap: "1px",
          background: "var(--color-border)",
        }}
        role="group"
        aria-label="Select outcome"
      >
        <button
          type="button"
          onClick={() => setOutcome(true)}
          aria-pressed={outcome === true}
          disabled={!isOpen || isPending || isConfirming}
          style={{
            flex: 1,
            padding: "var(--space-3) var(--space-4)",
            background: outcome === true ? "var(--color-yes)" : "var(--color-surface)",
            color:
              outcome === true ? "oklch(10% 0.02 250)" : "var(--color-muted)",
            border: "none",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-sm)",
            fontWeight: 700,
            letterSpacing: "0.06em",
            cursor: isOpen ? "pointer" : "not-allowed",
            opacity: !isOpen || isPending || isConfirming ? 0.45 : 1,
            transition: "background 120ms ease, color 120ms ease",
          }}
        >
          YES
        </button>
        <button
          type="button"
          onClick={() => setOutcome(false)}
          aria-pressed={outcome === false}
          disabled={!isOpen || isPending || isConfirming}
          style={{
            flex: 1,
            padding: "var(--space-3) var(--space-4)",
            background: outcome === false ? "var(--color-danger)" : "var(--color-surface)",
            color:
              outcome === false ? "oklch(98% 0.005 250)" : "var(--color-muted)",
            border: "none",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-sm)",
            fontWeight: 700,
            letterSpacing: "0.06em",
            cursor: isOpen ? "pointer" : "not-allowed",
            opacity: !isOpen || isPending || isConfirming ? 0.45 : 1,
            transition: "background 120ms ease, color 120ms ease",
          }}
        >
          NO
        </button>
      </div>

      {/* Amount input */}
      <div
        style={{
          display: "flex",
          gap: "var(--space-2)",
          alignItems: "center",
        }}
      >
        <label
          htmlFor="bet-amount"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-xs)",
            color: "var(--color-muted)",
            letterSpacing: "0.04em",
            flexShrink: 0,
          }}
        >
          AMOUNT (USDC)
        </label>
        <input
          id="bet-amount"
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={!isOpen || isPending || isConfirming}
          className="register-input"
          aria-label="Bet amount in USDC"
        />
      </div>

      {/* Amount validation error */}
      {amountError && (
        <div
          role="alert"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-xs)",
            color: "var(--color-danger)",
            letterSpacing: "0.04em",
          }}
        >
          {amountError}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!canSubmit}
        className="register-btn"
        style={{ alignSelf: "flex-start" }}
      >
        {isPending
          ? "Confirm in wallet…"
          : isConfirming
          ? "Confirming…"
          : !isConnected
          ? "Connect wallet to bet"
          : !isOpen
          ? "Market closed"
          : outcome === null
          ? "Select YES or NO"
          : "Place bet"}
      </button>

      {/* Status messages */}
      {isSuccess && (
        <div
          role="status"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-xs)",
            color: "var(--color-yes)",
            letterSpacing: "0.04em",
          }}
        >
          ✓ Bet confirmed.{" "}
          <button
            type="button"
            onClick={handleReset}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-accent)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-xs)",
              cursor: "pointer",
              textDecoration: "underline",
              padding: 0,
            }}
          >
            Place another
          </button>
        </div>
      )}
      {error && (
        <div
          role="alert"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-xs)",
            color: "var(--color-danger)",
            letterSpacing: "0.04em",
          }}
        >
          {error.message.length > MAX_ERROR_MESSAGE_LENGTH
            ? `${error.message.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…`
            : error.message}
        </div>
      )}
    </form>
  );
}

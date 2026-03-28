"use client";

import { useState } from "react";
import { useAccount, useConnect, useWriteContract } from "wagmi";
import { WorldIDButton } from "@/components/WorldIDButton";
import Link from "next/link";

const REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ?? "") as `0x${string}`;

const HUMAN_REGISTRY_ABI = [
  {
    name: "registerHuman",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "root", type: "uint256" },
      { name: "nullifierHash", type: "uint256" },
      { name: "externalNullifierHash", type: "uint256" },
      { name: "proof", type: "uint256[8]" },
    ],
    outputs: [],
  },
  {
    name: "registerAgent",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentWallet", type: "address" }],
    outputs: [],
  },
] as const;

import { type IDKitResult } from "@worldcoin/idkit";

export default function RegisterPage() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { writeContract, isPending, isSuccess, error } = useWriteContract();

  const [humanRegistered, setHumanRegistered] = useState(false);
  const [agentWallet, setAgentWallet] = useState("");
  const [agentRegistered, setAgentRegistered] = useState(false);
  const [agentError, setAgentError] = useState("");

  function handleConnectWallet(connectorId: string) {
    const connector = connectors.find((c) => c.id === connectorId);
    if (connector) connect({ connector });
  }

  async function handleVerify(result: IDKitResult) {
    if (!address) return;

    if (result.protocol_version === "3.0" && result.responses.length > 0) {
      const item = result.responses[0];
      const proofHex = item.proof as string;
      const proofArray = Array.from({ length: 8 }, (_, i) => {
        const slice = proofHex.slice(2 + i * 64, 2 + (i + 1) * 64);
        return BigInt("0x" + slice);
      }) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];

      writeContract({
        address: REGISTRY_ADDRESS,
        abi: HUMAN_REGISTRY_ABI,
        functionName: "registerHuman",
        args: [
          BigInt(item.merkle_root),
          BigInt(item.nullifier),
          BigInt(0),
          proofArray,
        ],
      });
      setHumanRegistered(true);
    }
  }

  function handleRegisterAgent() {
    if (!agentWallet.match(/^0x[0-9a-fA-F]{40}$/)) {
      setAgentError("Invalid Ethereum address");
      return;
    }
    setAgentError("");
    writeContract({
      address: REGISTRY_ADDRESS,
      abi: HUMAN_REGISTRY_ABI,
      functionName: "registerAgent",
      args: [agentWallet as `0x${string}`],
    });
    setAgentRegistered(true);
  }

  return (
    <div className="page-shell">
      <header className="site-header">
        <div className="site-header__brand">
          <span className="site-header__mark">◈</span>
          <span className="site-header__name">WorldMarket</span>
        </div>
        <nav className="site-header__nav" aria-label="Primary navigation">
          <Link href="/" className="nav-link">
            ← Markets
          </Link>
        </nav>
      </header>

      <main className="register-page">
        <h1 className="register-page__title">Register</h1>

        <div className="register-steps">
          {/* Step 1: Connect Wallet */}
          <section
            className={`register-step ${isConnected ? "register-step--done" : "register-step--active"}`}
            aria-labelledby="step1-title"
          >
            <div className="register-step__header">
              <span className="register-step__num">01</span>
              <h2 id="step1-title" className="register-step__title">
                Connect wallet
              </h2>
            </div>
            {isConnected ? (
              <p className="register-step__success font-mono">
                ✓ {address}
              </p>
            ) : (
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {connectors.find((c) => c.id === "injected") && (
                  <button
                    className="register-btn"
                    onClick={() => handleConnectWallet("injected")}
                  >
                    Connect MetaMask
                  </button>
                )}
                {connectors.find((c) => c.id === "walletConnect") && (
                  <button
                    className="register-btn"
                    onClick={() => handleConnectWallet("walletConnect")}
                  >
                    WalletConnect
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Step 2: World ID Verification */}
          <section
            className={`register-step ${
              !isConnected
                ? ""
                : humanRegistered && isSuccess
                ? "register-step--done"
                : "register-step--active"
            }`}
            aria-labelledby="step2-title"
          >
            <div className="register-step__header">
              <span className="register-step__num">02</span>
              <h2 id="step2-title" className="register-step__title">
                Verify with World ID
              </h2>
            </div>
            <p className="register-step__body">
              Prove you are a unique human using the World app. One person, one cap.
            </p>
            {!isConnected ? (
              <p className="register-step__body">Connect your wallet first.</p>
            ) : humanRegistered && isSuccess ? (
              <p className="register-step__success">✓ Registered on-chain</p>
            ) : (
              <>
                <WorldIDButton onVerify={handleVerify} walletAddress={address!} />
                {isPending && (
                  <p className="register-step__pending">Confirming transaction…</p>
                )}
                {error && (
                  <p className="register-step__error">✕ {error.message}</p>
                )}
              </>
            )}
          </section>

          {/* Step 3: Register Agent */}
          <section
            className={`register-step ${
              !isConnected
                ? ""
                : agentRegistered && isSuccess
                ? "register-step--done"
                : "register-step--active"
            }`}
            aria-labelledby="step3-title"
          >
            <div className="register-step__header">
              <span className="register-step__num">03</span>
              <h2 id="step3-title" className="register-step__title">
                Register agent wallet
              </h2>
            </div>
            <p className="register-step__body">
              Link your bot wallet to your verified human identity. The agent inherits
              your exposure cap.
            </p>
            {!isConnected ? (
              <p className="register-step__body">Connect your wallet first.</p>
            ) : agentRegistered && isSuccess ? (
              <p className="register-step__success">✓ Agent registered</p>
            ) : (
              <>
                <div className="register-input-row">
                  <input
                    type="text"
                    value={agentWallet}
                    onChange={(e) => setAgentWallet(e.target.value)}
                    placeholder="0xAgentWallet…"
                    className="register-input"
                    aria-label="Agent wallet address"
                  />
                  <button
                    className="register-btn"
                    onClick={handleRegisterAgent}
                    disabled={isPending}
                  >
                    Register
                  </button>
                </div>
                {agentError && (
                  <p className="register-step__error">{agentError}</p>
                )}
                {isPending && (
                  <p className="register-step__pending">Confirming transaction…</p>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useAccount, useConnect, useWriteContract } from "wagmi";
import { injected } from "wagmi/connectors";
import { WorldIDButton } from "../../components/WorldIDButton";

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

interface IDKitProof {
  merkle_root: string;
  nullifier_hash: string;
  proof: string;
  verification_level: string;
}

export default function RegisterPage() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { writeContract, isPending, isSuccess, error } = useWriteContract();

  const [humanRegistered, setHumanRegistered] = useState(false);
  const [agentWallet, setAgentWallet] = useState("");
  const [agentRegistered, setAgentRegistered] = useState(false);
  const [agentError, setAgentError] = useState("");

  function handleConnectWallet() {
    connect({ connector: injected() });
  }

  async function handleVerify(result: IDKitResult) {
    if (!address) return;

    // Support legacy v3 proofs (allow_legacy_proofs=true)
    // IDKitResultV3 has responses[].{ proof, merkle_root, nullifier }
    if (result.protocol_version === "3.0" && result.responses.length > 0) {
      const item = result.responses[0];
      const proofHex = item.proof as string;
      // Decode ABI-encoded proof: 8 uint256 values packed as 32-byte hex segments
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
          BigInt(0), // externalNullifierHash — derived from action, computed on-chain
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
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "1.5rem" }}>
        🪪 Register with WorldMarket
      </h1>

      {/* Step 1: Connect Wallet */}
      <section style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontWeight: "600", marginBottom: "0.5rem" }}>Step 1: Connect Wallet</h2>
        {isConnected ? (
          <p style={{ color: "#16a34a" }}>
            ✅ Connected: <code>{address}</code>
          </p>
        ) : (
          <button
            onClick={handleConnectWallet}
            style={{
              padding: "0.5rem 1rem",
              background: "#2563eb",
              color: "white",
              border: "none",
              borderRadius: "0.375rem",
              cursor: "pointer",
            }}
          >
            Connect Wallet
          </button>
        )}
      </section>

      {/* Step 2: World ID Verification */}
      {isConnected && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontWeight: "600", marginBottom: "0.5rem" }}>Step 2: Verify with World ID</h2>
          {humanRegistered && isSuccess ? (
            <p style={{ color: "#16a34a" }}>✅ Human registered on-chain!</p>
          ) : (
            <>
              <WorldIDButton onVerify={handleVerify} walletAddress={address!} />
              {isPending && <p style={{ color: "#6b7280", marginTop: "0.5rem" }}>⏳ Confirming transaction...</p>}
              {error && <p style={{ color: "#dc2626", marginTop: "0.5rem" }}>❌ {error.message}</p>}
            </>
          )}
        </section>
      )}

      {/* Step 3: Register Agent */}
      {isConnected && (
        <section>
          <h2 style={{ fontWeight: "600", marginBottom: "0.5rem" }}>Step 3: Register Agent Wallet</h2>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
            Enter the address of your agent bot. It will be linked to your human identity.
          </p>
          {agentRegistered && isSuccess ? (
            <p style={{ color: "#16a34a" }}>✅ Agent registered!</p>
          ) : (
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                value={agentWallet}
                onChange={(e) => setAgentWallet(e.target.value)}
                placeholder="0xAgentWallet..."
                style={{
                  flex: 1,
                  padding: "0.5rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.375rem",
                  fontFamily: "monospace",
                  fontSize: "0.875rem",
                }}
              />
              <button
                onClick={handleRegisterAgent}
                disabled={isPending}
                style={{
                  padding: "0.5rem 1rem",
                  background: "#7c3aed",
                  color: "white",
                  border: "none",
                  borderRadius: "0.375rem",
                  cursor: "pointer",
                }}
              >
                Register Agent
              </button>
            </div>
          )}
          {agentError && <p style={{ color: "#dc2626", marginTop: "0.5rem" }}>{agentError}</p>}
        </section>
      )}
    </main>
  );
}

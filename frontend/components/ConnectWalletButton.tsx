"use client";
import { useAccount, useConnect, useDisconnect } from "wagmi";

export function ConnectWalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        className="wallet-btn wallet-btn--connected font-mono"
        onClick={() => disconnect()}
        aria-label={`Disconnect wallet ${address}`}
      >
        {address.slice(0, 6)}…{address.slice(-4)} ✕
      </button>
    );
  }

  const injectedConnector = connectors.find((c) => c.id === "injected");
  const wcConnector = connectors.find((c) => c.id === "walletConnect");

  return (
    <div className="wallet-connect-group" role="group" aria-label="Connect wallet">
      {injectedConnector && (
        <button
          className="wallet-btn"
          onClick={() => connect({ connector: injectedConnector })}
          disabled={isPending}
          aria-label="Connect injected wallet (MetaMask)"
        >
          {isPending ? "Connecting…" : "Connect wallet"}
        </button>
      )}
      {wcConnector && (
        <button
          className="wallet-btn wallet-btn--secondary"
          onClick={() => connect({ connector: wcConnector })}
          disabled={isPending}
          aria-label="Connect via WalletConnect"
        >
          WC
        </button>
      )}
      {!injectedConnector && !wcConnector && (
        <button className="wallet-btn" disabled>
          No wallet detected
        </button>
      )}
      {error && (
        <p className="wallet-error" role="alert">
          {error.message}
        </p>
      )}
    </div>
  );
}

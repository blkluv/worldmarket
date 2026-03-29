import { createConfig, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { injected, walletConnect, mock } from "wagmi/connectors";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";
const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  "https://worldmarket-frontend-production.up.railway.app";

// Demo wallet for testing
const demoAccount = "0x287A2bb05CFfd1093B9ea1816118fcCf81A142d7" as `0x${string}`;

export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  ssr: true,
  connectors: [
    injected(),
    walletConnect({
      projectId,
      showQrModal: true,
      metadata: {
        name: "WorldMarket",
        description: "WorldMarket prediction markets",
        url: appUrl,
        icons: [`${appUrl}/favicon.ico`],
      },
    }),
    mock({
      accounts: [demoAccount],
    }),
  ],
  transports: {
    [baseSepolia.id]: http(),
  },
});

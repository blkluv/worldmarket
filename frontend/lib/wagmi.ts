import { createConfig, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";
const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  "https://worldmarket-frontend-production.up.railway.app";

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
  ],
  transports: {
    [baseSepolia.id]: http(),
  },
});

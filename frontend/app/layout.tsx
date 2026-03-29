import type { Metadata } from "next";
import "@fontsource-variable/plus-jakarta-sans/index.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource-variable/space-grotesk/index.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "WorldMarket — Prediction Markets for Verified Humans",
  description: "On-chain prediction markets with World ID human exposure caps.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

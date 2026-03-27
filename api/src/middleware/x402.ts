import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { RoutesConfig } from "@x402/core/server";

const PAYMENT_RECIPIENT =
  process.env.PAYMENT_RECIPIENT ||
  "0x0000000000000000000000000000000000000000";
const NETWORK = "eip155:84532" as const;
const FACILITATOR_URL = "https://x402.org/facilitator";

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitatorClient).register(
  NETWORK,
  new ExactEvmScheme()
);

export const x402Routes: RoutesConfig = {
  "GET /markets": {
    accepts: [
      {
        scheme: "exact",
        price: "$0.001",
        network: NETWORK,
        payTo: PAYMENT_RECIPIENT,
      },
    ],
    description: "List all prediction markets",
    mimeType: "application/json",
  },
  "GET /markets/:id": {
    accepts: [
      {
        scheme: "exact",
        price: "$0.001",
        network: NETWORK,
        payTo: PAYMENT_RECIPIENT,
      },
    ],
    description: "Get market detail",
    mimeType: "application/json",
  },
  "GET /markets/:id/price": {
    accepts: [
      {
        scheme: "exact",
        price: "$0.0001",
        network: NETWORK,
        payTo: PAYMENT_RECIPIENT,
      },
    ],
    description: "Get current AMM price",
    mimeType: "application/json",
  },
  "POST /markets/:id/bet": {
    accepts: [
      {
        scheme: "exact",
        price: "$0.01",
        network: NETWORK,
        payTo: PAYMENT_RECIPIENT,
      },
    ],
    description: "Place a bet",
    mimeType: "application/json",
  },
  "POST /markets/:id/simulate": {
    accepts: [
      {
        scheme: "exact",
        price: "$0.001",
        network: NETWORK,
        payTo: PAYMENT_RECIPIENT,
      },
    ],
    description: "Simulate a bet",
    mimeType: "application/json",
  },
};

export { paymentMiddleware, resourceServer };

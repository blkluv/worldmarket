function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const env = {
  registryAddress: requireEnv("NEXT_PUBLIC_REGISTRY_ADDRESS") as `0x${string}`,
  marketAddress: requireEnv("NEXT_PUBLIC_MARKET_ADDRESS") as `0x${string}`,
  wldAppId: requireEnv("NEXT_PUBLIC_WLD_APP_ID"),
  wldAction: process.env.NEXT_PUBLIC_WLD_ACTION ?? "register-human",
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
} as const;

export function serverEnv() {
  return {
    rpSigningKey: requireEnv("RP_SIGNING_KEY"),
    rpId: requireEnv("RP_ID"),
  };
}

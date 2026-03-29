/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Tell Next.js to treat @xmtp/node-sdk and its native deps as server-only externals
  serverExternalPackages: ["@xmtp/node-sdk", "better-sqlite3"],
  webpack: (config) => {
    // Stub optional Node/React-Native-only deps that browser bundles reference
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "pino-pretty": false,
      "@react-native-async-storage/async-storage": false,
      "lokijs": false,
    };
    return config;
  },
};

module.exports = nextConfig;

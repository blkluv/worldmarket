/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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

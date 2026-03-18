import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep Node.js-only packages out of the client bundle.
  // These use node:crypto / node:fs which webpack cannot resolve client-side.
  serverExternalPackages: ["@sentinel/security", "@sentinel/auth", "@sentinel/policy-engine"],
  webpack(config, { isServer }) {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

export default nextConfig;

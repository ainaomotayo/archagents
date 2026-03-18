import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep Node.js-only packages out of the client bundle.
  // These use node:crypto / node:fs which webpack cannot resolve client-side.
  serverExternalPackages: [
    "@sentinel/security",
    "@sentinel/auth",
    "@sentinel/policy-engine",
    "@google-cloud/kms",
    "google-gax",
    "@grpc/grpc-js",
  ],
  webpack(config, { isServer }) {
    if (!isServer) {
      // Webpack 5 does not resolve the 'node:' URL scheme for browser targets.
      // Alias each node: import to false so they resolve to empty modules.
      config.resolve.alias = {
        ...config.resolve.alias,
        "node:crypto": false,
        "node:fs": false,
        "node:path": false,
        "node:os": false,
        "node:stream": false,
        "node:buffer": false,
        "node:util": false,
        "node:events": false,
        "node:net": false,
        "node:tls": false,
        "node:http2": false,
        "node:dns": false,
      };
      // Belt-and-suspenders: also apply fallbacks for bare module names
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        fs: false,
        net: false,
        tls: false,
        stream: false,
        path: false,
        os: false,
        http2: false,
        dns: false,
      };
    }
    return config;
  },
};

export default nextConfig;

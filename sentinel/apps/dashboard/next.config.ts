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
  webpack(config, { isServer, webpack: webpackInstance }) {
    if (!isServer) {
      // Strip "node:" prefix from all imports — webpack 5 does not handle the
      // "node:" URI scheme for browser targets and throws UnhandledSchemeError
      // BEFORE consulting resolve.alias. Replacing it with the bare module name
      // allows resolve.fallback (below) to substitute empty modules.
      config.plugins.push(
        new webpackInstance.NormalModuleReplacementPlugin(
          /^node:/,
          (resource: { request: string }) => {
            resource.request = resource.request.replace(/^node:/, "");
          },
        ),
      );

      // Server-only packages: substitute empty modules in the client bundle.
      // These packages use Node.js built-ins unavailable in browsers.
      config.resolve.alias = {
        ...config.resolve.alias,
        "@sentinel/security": false,
        "@google-cloud/kms": false,
        "@google-cloud/storage": false,
        "google-auth-library": false,
        "google-gax": false,
        "@grpc/grpc-js": false,
        "@aws-sdk/client-kms": false,
        "@aws-sdk/client-s3": false,
        "@azure/identity": false,
        "@azure/keyvault-keys": false,
        "@azure/storage-blob": false,
      };

      // Stub out all Node.js built-in modules for browser bundles.
      // NormalModuleReplacementPlugin above strips "node:" prefix first,
      // so these bare names catch both "crypto" and "node:crypto".
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
        util: false,
        child_process: false,
        worker_threads: false,
        buffer: false,
        events: false,
        perf_hooks: false,
        async_hooks: false,
      };
    }
    return config;
  },
};

export default nextConfig;

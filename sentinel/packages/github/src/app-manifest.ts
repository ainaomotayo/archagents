/**
 * GitHub App manifest defining SENTINEL's required permissions and event subscriptions.
 *
 * Used when registering SENTINEL as a GitHub App via the manifest flow
 * (POST https://github.com/settings/apps/new).
 */
export const SENTINEL_APP_MANIFEST = {
  name: "SENTINEL",
  description: "AI-Generated Code Governance & Compliance",
  url: "https://sentinel.dev",
  hook_attributes: { url: "https://api.sentinel.dev/webhooks/github" },
  public: true,
  default_permissions: {
    checks: "write" as const,
    pull_requests: "read" as const,
    contents: "read" as const,
    metadata: "read" as const,
  },
  default_events: ["push", "pull_request"] as const,
};

export type SentinelAppManifest = typeof SENTINEL_APP_MANIFEST;

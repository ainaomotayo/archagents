import { describe, it, expect } from "vitest";
import { VcsProviderRegistry } from "../registry.js";
import type {
  VcsProvider,
  VcsCapabilities,
  VcsProviderType,
  VcsScanTrigger,
  VcsWebhookEvent,
  VcsDiffResult,
  VcsStatusReport,
} from "../types.js";

function createMockProvider(type: VcsProviderType, name = "Mock"): VcsProvider {
  return {
    name,
    type,
    capabilities: {
      checkRuns: false,
      commitStatus: true,
      prComments: true,
      prAnnotations: false,
      webhookSignatureVerification: true,
      appInstallations: false,
    } satisfies VcsCapabilities,
    async verifyWebhook(_event: VcsWebhookEvent, _secret: string) {
      return true;
    },
    async parseWebhook(_event: VcsWebhookEvent) {
      return null;
    },
    async fetchDiff(_trigger: VcsScanTrigger): Promise<VcsDiffResult> {
      return { rawDiff: "", files: [] };
    },
    async reportStatus(_trigger: VcsScanTrigger, _report: VcsStatusReport) {},
    async getInstallationToken(_installationId: string) {
      return "mock-token";
    },
  };
}

describe("VcsProviderRegistry", () => {
  it("registers and retrieves a provider", () => {
    const registry = new VcsProviderRegistry();
    const provider = createMockProvider("github", "GitHub");
    registry.register(provider);

    const retrieved = registry.get("github");
    expect(retrieved).toBe(provider);
    expect(retrieved?.name).toBe("GitHub");
  });

  it("returns undefined for unregistered provider", () => {
    const registry = new VcsProviderRegistry();
    expect(registry.get("gitlab")).toBeUndefined();
  });

  it("lists registered providers", () => {
    const registry = new VcsProviderRegistry();
    registry.register(createMockProvider("github"));
    registry.register(createMockProvider("gitlab"));
    registry.register(createMockProvider("bitbucket"));

    const types = registry.list();
    expect(types).toHaveLength(3);
    expect(types).toContain("github");
    expect(types).toContain("gitlab");
    expect(types).toContain("bitbucket");
  });

  it("throws on duplicate registration", () => {
    const registry = new VcsProviderRegistry();
    registry.register(createMockProvider("github"));

    expect(() => registry.register(createMockProvider("github"))).toThrowError(
      "Provider github already registered",
    );
  });

  it("has() returns correct boolean", () => {
    const registry = new VcsProviderRegistry();
    expect(registry.has("github")).toBe(false);

    registry.register(createMockProvider("github"));
    expect(registry.has("github")).toBe(true);
    expect(registry.has("gitlab")).toBe(false);
  });
});

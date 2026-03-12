import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentinel/github", () => ({
  configureGitHubApp: vi.fn(),
  verifyWebhookSignature: vi.fn(),
  parseWebhookEvent: vi.fn(),
  getInstallationOctokit: vi.fn(),
  buildCheckRunComplete: vi.fn(),
  findingsToAnnotations: vi.fn(),
}));

import {
  configureGitHubApp,
  verifyWebhookSignature,
  parseWebhookEvent,
} from "@sentinel/github";
import { GitHubProvider } from "../providers/github.js";
import type { VcsWebhookEvent } from "../types.js";

const mockedConfigureGitHubApp = vi.mocked(configureGitHubApp);
const mockedVerifyWebhookSignature = vi.mocked(verifyWebhookSignature);
const mockedParseWebhookEvent = vi.mocked(parseWebhookEvent);

describe("GitHubProvider", () => {
  let provider: GitHubProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GitHubProvider({ appId: "12345", privateKey: "fake-key" });
  });

  it("has correct type and name", () => {
    expect(provider.type).toBe("github");
    expect(provider.name).toBe("GitHub");
  });

  it("exposes GitHub-specific capabilities", () => {
    expect(provider.capabilities).toEqual({
      checkRuns: true,
      commitStatus: true,
      prComments: true,
      prAnnotations: true,
      webhookSignatureVerification: true,
      appInstallations: true,
    });
  });

  it("calls configureGitHubApp on construction", () => {
    expect(mockedConfigureGitHubApp).toHaveBeenCalledWith({
      appId: "12345",
      privateKey: "fake-key",
    });
  });

  describe("verifyWebhook", () => {
    it("delegates to verifyWebhookSignature from @sentinel/github", async () => {
      mockedVerifyWebhookSignature.mockReturnValue(true);

      const event: VcsWebhookEvent = {
        provider: "github",
        headers: { "x-hub-signature-256": "sha256=abc123" },
        body: {},
        rawBody: '{"action":"opened"}',
      };

      const result = await provider.verifyWebhook(event, "webhook-secret");

      expect(result).toBe(true);
      expect(mockedVerifyWebhookSignature).toHaveBeenCalledWith(
        '{"action":"opened"}',
        "sha256=abc123",
        "webhook-secret",
      );
    });

    it("returns false when x-hub-signature-256 header is missing", async () => {
      const event: VcsWebhookEvent = {
        provider: "github",
        headers: {},
        body: {},
        rawBody: "{}",
      };

      const result = await provider.verifyWebhook(event, "secret");

      expect(result).toBe(false);
      expect(mockedVerifyWebhookSignature).not.toHaveBeenCalled();
    });
  });

  describe("parseWebhook", () => {
    it("delegates to parseWebhookEvent and converts installationId to string", async () => {
      mockedParseWebhookEvent.mockReturnValue({
        type: "push",
        installationId: 42,
        repo: "acme/repo",
        owner: "acme",
        commitHash: "abc123",
        branch: "main",
        author: "dev@acme.com",
      });

      const event: VcsWebhookEvent = {
        provider: "github",
        headers: { "x-github-event": "push" },
        body: { some: "payload" },
        rawBody: '{"some":"payload"}',
      };

      const result = await provider.parseWebhook(event);

      expect(result).toEqual({
        provider: "github",
        type: "push",
        installationId: "42", // number converted to string
        repo: "acme/repo",
        owner: "acme",
        commitHash: "abc123",
        branch: "main",
        author: "dev@acme.com",
        prNumber: undefined,
      });
      expect(mockedParseWebhookEvent).toHaveBeenCalledWith("push", { some: "payload" });
    });

    it("returns null when x-github-event header is missing", async () => {
      const event: VcsWebhookEvent = {
        provider: "github",
        headers: {},
        body: {},
        rawBody: "{}",
      };

      const result = await provider.parseWebhook(event);

      expect(result).toBeNull();
      expect(mockedParseWebhookEvent).not.toHaveBeenCalled();
    });

    it("returns null when parseWebhookEvent returns null", async () => {
      mockedParseWebhookEvent.mockReturnValue(null);

      const event: VcsWebhookEvent = {
        provider: "github",
        headers: { "x-github-event": "issues" },
        body: {},
        rawBody: "{}",
      };

      const result = await provider.parseWebhook(event);

      expect(result).toBeNull();
    });
  });
});

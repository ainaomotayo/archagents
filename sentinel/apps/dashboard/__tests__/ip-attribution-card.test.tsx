// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { IPAttributionCard } from "../components/ip-attribution-card";
import type { IPAttributionCertificate } from "@/lib/types";

const mockCert: IPAttributionCertificate = {
  id: "cert-abc-123-def-456-ghi-789",
  version: "1.0.0",
  subject: {
    scanId: "scan-1",
    projectId: "proj-1",
    repository: "acme/widget",
    commitHash: "abc123",
    branch: "main",
    author: "dev@example.com",
    timestamp: "2026-03-10T12:00:00Z",
  },
  summary: {
    totalFiles: 10,
    totalLoc: 1000,
    classifications: {
      human: { files: 5, loc: 500, percentage: 0.5 },
      aiGenerated: { files: 3, loc: 300, percentage: 0.3 },
      aiAssisted: { files: 1, loc: 100, percentage: 0.1 },
      mixed: { files: 1, loc: 50, percentage: 0.1 },
      unknown: { files: 0, loc: 0, percentage: 0 },
    },
    overallAiRatio: 0.4,
    avgConfidence: 0.88,
    conflictingFiles: 1,
  },
  toolBreakdown: [
    { tool: "copilot", model: "gpt-4", files: 3, loc: 300, percentage: 0.3 },
    { tool: "cursor", model: null, files: 1, loc: 100, percentage: 0.1 },
  ],
  files: [],
  methodology: {
    algorithm: "weighted-fusion",
    algorithmVersion: "1.0.0",
    orgBaseRate: 0.3,
    sources: ["git-history", "code-pattern", "metadata"],
    classificationThresholds: {
      aiGenerated: 0.7,
      aiAssisted: 0.4,
    },
  },
  provenance: {
    generatedBy: "sentinel-assessor",
    generatedAt: "2026-03-10T12:30:00Z",
    agentVersions: { security: "1.0.0", dependency: "1.0.0" },
    evidenceChainHash: "sha256:abc123",
  },
  signature: "sig-abcdef012345",
};

vi.mock("@/lib/api", () => ({
  getIPAttributionCertificate: vi.fn().mockResolvedValue(null),
}));

afterEach(() => cleanup());

beforeEach(async () => {
  vi.clearAllMocks();
  const api = await import("@/lib/api");
  (
    api.getIPAttributionCertificate as ReturnType<typeof vi.fn>
  ).mockResolvedValue(null);
});

describe("IPAttributionCard", () => {
  it("exports an async function component", () => {
    expect(typeof IPAttributionCard).toBe("function");
  });

  it("returns null when certificate is not found", async () => {
    const jsx = await IPAttributionCard({ scanId: "scan-missing" });
    expect(jsx).toBeNull();
  });

  it("renders summary statistics when certificate exists", async () => {
    const api = await import("@/lib/api");
    (
      api.getIPAttributionCertificate as ReturnType<typeof vi.fn>
    ).mockResolvedValue(mockCert);

    const jsx = await IPAttributionCard({ scanId: "scan-1" });
    const { container } = render(jsx!);

    expect(screen.getByText("IP Attribution")).toBeDefined();
    expect(screen.getByText("10")).toBeDefined(); // totalFiles
    expect(screen.getByText("40.0%")).toBeDefined(); // AI ratio
    expect(screen.getByText("88%")).toBeDefined(); // avg confidence
    expect(screen.getByText("1")).toBeDefined(); // conflicting files
  });

  it("renders summary section labels", async () => {
    const api = await import("@/lib/api");
    (
      api.getIPAttributionCertificate as ReturnType<typeof vi.fn>
    ).mockResolvedValue(mockCert);

    const jsx = await IPAttributionCard({ scanId: "scan-1" });
    render(jsx!);

    expect(screen.getByText("Total Files")).toBeDefined();
    expect(screen.getByText("AI Ratio")).toBeDefined();
    expect(screen.getByText("Avg Confidence")).toBeDefined();
    expect(screen.getByText("Conflicts")).toBeDefined();
  });

  it("renders tool breakdown entries", async () => {
    const api = await import("@/lib/api");
    (
      api.getIPAttributionCertificate as ReturnType<typeof vi.fn>
    ).mockResolvedValue(mockCert);

    const jsx = await IPAttributionCard({ scanId: "scan-1" });
    render(jsx!);

    expect(screen.getByText("Tool Attribution")).toBeDefined();
    expect(screen.getByText("copilot (gpt-4)")).toBeDefined();
    expect(screen.getByText("cursor")).toBeDefined();
    // Check tool stats
    expect(screen.getByText(/3 files/)).toBeDefined();
    expect(screen.getByText(/300 LOC/)).toBeDefined();
  });

  it("renders certificate ID and signature", async () => {
    const api = await import("@/lib/api");
    (
      api.getIPAttributionCertificate as ReturnType<typeof vi.fn>
    ).mockResolvedValue(mockCert);

    const jsx = await IPAttributionCard({ scanId: "scan-1" });
    render(jsx!);

    // Certificate ID is sliced to 20 chars
    expect(
      screen.getByText(`Certificate: ${mockCert.id.slice(0, 20)}...`),
    ).toBeDefined();
    // Signature is sliced to 12 chars
    expect(
      screen.getByText(`Signed: ${mockCert.signature.slice(0, 12)}...`),
    ).toBeDefined();
  });

  it("does not render tool breakdown when empty", async () => {
    const api = await import("@/lib/api");
    const certNoTools = { ...mockCert, toolBreakdown: [] };
    (
      api.getIPAttributionCertificate as ReturnType<typeof vi.fn>
    ).mockResolvedValue(certNoTools);

    const jsx = await IPAttributionCard({ scanId: "scan-1" });
    render(jsx!);

    expect(screen.queryByText("Tool Attribution")).toBeNull();
  });

  it("renders the ProvenanceBar component within the card", async () => {
    const api = await import("@/lib/api");
    (
      api.getIPAttributionCertificate as ReturnType<typeof vi.fn>
    ).mockResolvedValue(mockCert);

    const jsx = await IPAttributionCard({ scanId: "scan-1" });
    render(jsx!);

    // ProvenanceBar renders a role="img" with aria-label
    expect(
      screen.getByRole("img", { name: /provenance distribution/i }),
    ).toBeDefined();
  });

  it("has correct aria-label on section", async () => {
    const api = await import("@/lib/api");
    (
      api.getIPAttributionCertificate as ReturnType<typeof vi.fn>
    ).mockResolvedValue(mockCert);

    const jsx = await IPAttributionCard({ scanId: "scan-1" });
    const { container } = render(jsx!);

    const section = container.querySelector("section");
    expect(section?.getAttribute("aria-label")).toBe("IP Attribution");
  });
});

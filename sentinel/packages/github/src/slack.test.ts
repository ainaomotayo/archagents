import { describe, it, expect } from "vitest";
import {
  buildScanCompleteMessage,
  buildRevocationMessage,
  buildCriticalFindingMessage,
} from "./slack.js";

// ── buildScanCompleteMessage ──

describe("buildScanCompleteMessage", () => {
  const scan = {
    projectName: "acme-api",
    commitHash: "abc1234def5678",
    branch: "main",
    status: "full_pass",
    riskScore: 12,
    findingCount: 3,
    dashboardUrl: "https://sentinel.example.com/scans/1",
  };

  it("returns valid block structure", () => {
    const msg = buildScanCompleteMessage(scan);

    expect(msg.blocks).toBeInstanceOf(Array);
    expect(msg.blocks.length).toBeGreaterThanOrEqual(3);
    expect(msg.blocks[0].type).toBe("section");
    expect(msg.blocks[1].type).toBe("divider");
  });

  it("includes fallback text with project name and status", () => {
    const msg = buildScanCompleteMessage(scan);

    expect(msg.text).toContain("acme-api");
    expect(msg.text).toContain("FULL PASS");
    expect(msg.text).toContain("12/100");
  });

  it("truncates commit hash to 7 characters in blocks", () => {
    const msg = buildScanCompleteMessage(scan);
    const sectionBlock = msg.blocks[0] as { type: "section"; text: { text: string } };

    expect(sectionBlock.text.text).toContain("`abc1234`");
    expect(sectionBlock.text.text).not.toContain("abc1234def5678");
  });

  it("uses warning emoji for medium risk scores", () => {
    const msg = buildScanCompleteMessage({ ...scan, riskScore: 40 });
    const sectionBlock = msg.blocks[0] as { type: "section"; text: { text: string } };

    expect(sectionBlock.text.text).toContain(":warning:");
  });

  it("uses rotating_light emoji for high risk scores", () => {
    const msg = buildScanCompleteMessage({ ...scan, riskScore: 80 });
    const sectionBlock = msg.blocks[0] as { type: "section"; text: { text: string } };

    expect(sectionBlock.text.text).toContain(":rotating_light:");
  });
});

// ── buildRevocationMessage ──

describe("buildRevocationMessage", () => {
  const cert = {
    projectName: "acme-api",
    commitHash: "abc1234def5678",
    revokedBy: "admin@acme.com",
    reason: "Security vulnerability discovered",
    dashboardUrl: "https://sentinel.example.com/certs/1",
  };

  it("returns valid block structure with actions", () => {
    const msg = buildRevocationMessage(cert);

    expect(msg.blocks).toBeInstanceOf(Array);
    const actions = msg.blocks.find((b) => b.type === "actions");
    expect(actions).toBeDefined();
  });

  it("includes fallback text with revoked-by info", () => {
    const msg = buildRevocationMessage(cert);

    expect(msg.text).toContain("acme-api");
    expect(msg.text).toContain("admin@acme.com");
    expect(msg.text).toContain("revoked");
  });

  it("includes danger-styled button", () => {
    const msg = buildRevocationMessage(cert);
    const actions = msg.blocks.find((b) => b.type === "actions") as {
      type: "actions";
      elements: Array<{ style?: string }>;
    };

    expect(actions.elements[0].style).toBe("danger");
  });
});

// ── buildCriticalFindingMessage ──

describe("buildCriticalFindingMessage", () => {
  const finding = {
    projectName: "acme-api",
    title: "SQL Injection in /api/users",
    severity: "CRITICAL",
    file: "src/routes/users.ts",
    dashboardUrl: "https://sentinel.example.com/findings/42",
  };

  it("returns valid block structure with accessory button", () => {
    const msg = buildCriticalFindingMessage(finding);

    expect(msg.blocks).toBeInstanceOf(Array);
    const sectionWithAccessory = msg.blocks.find(
      (b) => b.type === "section" && "accessory" in b
    );
    expect(sectionWithAccessory).toBeDefined();
  });

  it("includes fallback text with finding title", () => {
    const msg = buildCriticalFindingMessage(finding);

    expect(msg.text).toContain("acme-api");
    expect(msg.text).toContain("SQL Injection in /api/users");
  });
});

import { describe, it, expect } from "vitest";
import {
  SELF_SCAN_CONFIG,
  validateSelfScanConfig,
  getCronDescription,
  validatePolicyStructure,
  type SelfScanConfig,
} from "./self-scan-config.js";

describe("SELF_SCAN_CONFIG defaults", () => {
  it("should have valid default configuration", () => {
    const result = validateSelfScanConfig(SELF_SCAN_CONFIG);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("should target TypeScript and Python files", () => {
    expect(SELF_SCAN_CONFIG.targets).toContain("packages/**/*.ts");
    expect(SELF_SCAN_CONFIG.targets).toContain("apps/**/*.ts");
    expect(SELF_SCAN_CONFIG.targets).toContain("agents/**/*.py");
  });

  it("should reference the sentinel policy file", () => {
    expect(SELF_SCAN_CONFIG.policyPath).toBe(".sentinel/policies.yaml");
  });
});

describe("validateSelfScanConfig", () => {
  it("should reject missing schedule", () => {
    const config: SelfScanConfig = {
      ...SELF_SCAN_CONFIG,
      schedule: "",
    };
    const result = validateSelfScanConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Invalid or missing schedule cron expression",
    );
  });

  it("should reject invalid cron expressions", () => {
    const config: SelfScanConfig = {
      ...SELF_SCAN_CONFIG,
      schedule: "not-a-cron",
    };
    const result = validateSelfScanConfig(config);
    expect(result.valid).toBe(false);
  });

  it("should reject empty targets array", () => {
    const config: SelfScanConfig = {
      ...SELF_SCAN_CONFIG,
      targets: [],
    };
    const result = validateSelfScanConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("At least one scan target is required");
  });

  it("should reject empty policy path", () => {
    const config: SelfScanConfig = {
      ...SELF_SCAN_CONFIG,
      policyPath: "",
    };
    const result = validateSelfScanConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Policy path must be specified");
  });

  it("should require CVE rescan schedule when enabled", () => {
    const config: SelfScanConfig = {
      ...SELF_SCAN_CONFIG,
      cveRescanEnabled: true,
      cveRescanSchedule: "",
    };
    const result = validateSelfScanConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("CVE rescan schedule");
  });

  it("should allow missing CVE rescan schedule when disabled", () => {
    const config: SelfScanConfig = {
      ...SELF_SCAN_CONFIG,
      cveRescanEnabled: false,
      cveRescanSchedule: "",
    };
    const result = validateSelfScanConfig(config);
    expect(result.valid).toBe(true);
  });
});

describe("getCronDescription", () => {
  it("should describe daily schedule", () => {
    expect(getCronDescription("0 2 * * *")).toBe("Daily at 02:00");
  });

  it("should describe weekly schedule", () => {
    expect(getCronDescription("0 4 * * 1")).toBe(
      "Weekly on Monday at 04:00",
    );
  });

  it("should describe monthly schedule", () => {
    expect(getCronDescription("30 12 15 * *")).toBe(
      "Monthly on day 15 at 12:30",
    );
  });

  it("should handle invalid cron expressions", () => {
    expect(getCronDescription("bad")).toBe("Invalid cron expression");
  });

  it("should describe every-minute schedule", () => {
    expect(getCronDescription("* * * * *")).toBe("Every minute");
  });
});

describe("validatePolicyStructure", () => {
  it("should validate a correct policy structure", () => {
    const policy = {
      version: "1",
      rules: [
        {
          name: "no-eval",
          type: "deny-import",
          severity: "critical",
          files: "**/*.py",
          targets: ["eval"],
        },
      ],
    };
    const result = validatePolicyStructure(policy);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("should reject policy without version", () => {
    const policy = {
      rules: [
        {
          name: "test",
          type: "deny-pattern",
          severity: "low",
          files: "**/*.ts",
        },
      ],
    };
    const result = validatePolicyStructure(policy);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Policy must have a version field");
  });

  it("should reject policy without rules array", () => {
    const policy = { version: "1" };
    const result = validatePolicyStructure(policy);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Policy must have a rules array");
  });

  it("should reject rules with invalid type", () => {
    const policy = {
      version: "1",
      rules: [
        {
          name: "test",
          type: "invalid-type",
          severity: "low",
          files: "**/*.ts",
        },
      ],
    };
    const result = validatePolicyStructure(policy);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("type must be one of");
  });

  it("should reject rules with invalid severity", () => {
    const policy = {
      version: "1",
      rules: [
        {
          name: "test",
          type: "deny-pattern",
          severity: "extreme",
          files: "**/*.ts",
        },
      ],
    };
    const result = validatePolicyStructure(policy);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("severity must be one of");
  });

  it("should reject rules without files pattern", () => {
    const policy = {
      version: "1",
      rules: [
        { name: "test", type: "deny-pattern", severity: "low" },
      ],
    };
    const result = validatePolicyStructure(policy);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("files glob pattern");
  });
});

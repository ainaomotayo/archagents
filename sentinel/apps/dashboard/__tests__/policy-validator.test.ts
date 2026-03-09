import { describe, it, expect } from "vitest";
import { validatePolicy } from "@/components/policy-validator";

describe("validatePolicy", () => {
  it("returns error for empty input", () => {
    const messages = validatePolicy("");
    expect(messages.length).toBe(1);
    expect(messages[0].level).toBe("error");
    expect(messages[0].message).toContain("empty");
  });

  it("returns error when 'version' key is missing", () => {
    const yaml = `rules:
  - id: test
    severity: high`;
    const messages = validatePolicy(yaml);
    const versionError = messages.find((m) => m.message.includes("version"));
    expect(versionError).toBeDefined();
    expect(versionError!.level).toBe("error");
  });

  it("returns error when 'rules' key is missing", () => {
    const yaml = `version: "1.0"
settings:
  strict: true`;
    const messages = validatePolicy(yaml);
    const rulesError = messages.find((m) => m.message.includes("rules"));
    expect(rulesError).toBeDefined();
    expect(rulesError!.level).toBe("error");
  });

  it("detects tab characters", () => {
    const yaml = "version: \"1.0\"\nrules:\n\t- id: test";
    const messages = validatePolicy(yaml);
    const tabError = messages.find((m) => m.message.includes("Tab"));
    expect(tabError).toBeDefined();
    expect(tabError!.level).toBe("error");
    expect(tabError!.line).toBe(3);
  });

  it("warns on trailing whitespace", () => {
    const yaml = "version: \"1.0\"  \nrules:\n  - id: test";
    const messages = validatePolicy(yaml);
    const trailingWarn = messages.find((m) =>
      m.message.includes("Trailing whitespace"),
    );
    expect(trailingWarn).toBeDefined();
    expect(trailingWarn!.level).toBe("warning");
    expect(trailingWarn!.line).toBe(1);
  });

  it("suggests threshold when severity is used without it", () => {
    const yaml = `version: "1.0"
rules:
  - id: test
    severity: high`;
    const messages = validatePolicy(yaml);
    const info = messages.find((m) => m.level === "info");
    expect(info).toBeDefined();
    expect(info!.message).toContain("threshold");
  });

  it("returns valid for a well-formed policy", () => {
    const yaml = `version: "1.0"
rules:
  - id: secret-detection
    severity: critical
    threshold: 0`;
    const messages = validatePolicy(yaml);
    const errors = messages.filter((m) => m.level === "error");
    expect(errors).toHaveLength(0);
  });
});

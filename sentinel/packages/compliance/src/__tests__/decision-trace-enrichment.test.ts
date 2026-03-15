import { describe, it, expect } from "vitest";
import {
  parseSentinelAIConfig,
  configFromEnvVars,
  matchDeclaredTool,
} from "../decision-trace/enrichment.js";

describe("parseSentinelAIConfig", () => {
  it("parses tools from sentinelAi key", () => {
    const config = parseSentinelAIConfig({
      sentinelAi: {
        tools: [
          { name: "copilot", model: "gpt-4-turbo", scope: "src/**" },
          { name: "cursor", model: "claude-sonnet-4-20250514", scope: "tests/**" },
        ],
      },
    });
    expect(config.tools).toHaveLength(2);
    expect(config.tools[0].name).toBe("copilot");
    expect(config.tools[0].model).toBe("gpt-4-turbo");
    expect(config.tools[0].scope).toBe("src/**");
  });

  it("returns empty for null/undefined", () => {
    expect(parseSentinelAIConfig(null).tools).toHaveLength(0);
    expect(parseSentinelAIConfig(undefined).tools).toHaveLength(0);
  });

  it("returns empty for malformed input", () => {
    expect(parseSentinelAIConfig({ sentinelAi: "not-object" }).tools).toHaveLength(0);
    expect(parseSentinelAIConfig({ sentinelAi: { tools: "nope" } }).tools).toHaveLength(0);
  });

  it("filters out entries without name", () => {
    const config = parseSentinelAIConfig({
      sentinelAi: {
        tools: [
          { name: "copilot" },
          { model: "gpt-4" }, // no name
          null,
        ],
      },
    });
    expect(config.tools).toHaveLength(1);
  });
});

describe("configFromEnvVars", () => {
  it("creates config from SENTINEL_AI_TOOL", () => {
    const config = configFromEnvVars({
      SENTINEL_AI_TOOL: "copilot",
      SENTINEL_AI_MODEL: "gpt-4-turbo",
    });
    expect(config.tools).toHaveLength(1);
    expect(config.tools[0].name).toBe("copilot");
    expect(config.tools[0].model).toBe("gpt-4-turbo");
    expect(config.tools[0].scope).toBe("**");
  });

  it("returns empty when no tool env var", () => {
    expect(configFromEnvVars({}).tools).toHaveLength(0);
  });
});

describe("matchDeclaredTool", () => {
  const config = {
    tools: [
      { name: "copilot", model: "gpt-4-turbo", scope: "src/**" },
      { name: "cursor", model: "claude-sonnet-4-20250514", scope: "tests/**" },
    ],
  };

  it("matches file against scope", () => {
    const match = matchDeclaredTool("src/utils/helper.ts", config);
    expect(match?.name).toBe("copilot");
  });

  it("matches second tool for tests", () => {
    const match = matchDeclaredTool("tests/unit/foo.test.ts", config);
    expect(match?.name).toBe("cursor");
  });

  it("returns null when no scope matches", () => {
    const match = matchDeclaredTool("docs/readme.md", config);
    expect(match).toBeNull();
  });

  it("matches wildcard scope", () => {
    const wildConfig = { tools: [{ name: "copilot", scope: "**" }] };
    expect(matchDeclaredTool("any/file.ts", wildConfig)?.name).toBe("copilot");
  });

  it("defaults to ** when scope is undefined", () => {
    const noScope = { tools: [{ name: "copilot" }] };
    expect(matchDeclaredTool("any/file.ts", noScope)?.name).toBe("copilot");
  });
});

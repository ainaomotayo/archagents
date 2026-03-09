import { describe, it, expect } from "vitest";
import {
  STREAM_CONFIGS,
  generateXtrimCommand,
  generateXgroupCommands,
  estimateMemoryUsageMb,
} from "./redis-tuning.js";

describe("STREAM_CONFIGS", () => {
  it("defines configs for diffs, findings, and escalations streams", () => {
    const streams = STREAM_CONFIGS.map((c) => c.stream);
    expect(streams).toContain("sentinel.diffs");
    expect(streams).toContain("sentinel.findings");
    expect(streams).toContain("sentinel.escalations");
  });

  it("diffs stream has 6 consumer groups for the 6 agents", () => {
    const diffs = STREAM_CONFIGS.find((c) => c.stream === "sentinel.diffs")!;
    expect(diffs.consumerGroupCount).toBe(6);
  });

  it("all streams have positive maxLen", () => {
    for (const config of STREAM_CONFIGS) {
      expect(config.maxLen).toBeGreaterThan(0);
    }
  });

  it("all streams have positive batchSize", () => {
    for (const config of STREAM_CONFIGS) {
      expect(config.batchSize).toBeGreaterThan(0);
    }
  });
});

describe("generateXtrimCommand", () => {
  it("generates correct XTRIM with MAXLEN and approximate flag", () => {
    const config = STREAM_CONFIGS[0]; // sentinel.diffs
    const cmd = generateXtrimCommand(config);
    expect(cmd).toEqual([
      "XTRIM",
      "sentinel.diffs",
      "MAXLEN",
      "~",
      "100000",
    ]);
  });

  it("uses the stream name from config", () => {
    const config = STREAM_CONFIGS[2]; // sentinel.escalations
    const cmd = generateXtrimCommand(config);
    expect(cmd[1]).toBe("sentinel.escalations");
    expect(cmd[4]).toBe("50000");
  });
});

describe("generateXgroupCommands", () => {
  it("creates one XGROUP command per consumer", () => {
    const config = STREAM_CONFIGS[0];
    const consumers = ["security", "license", "quality"];
    const cmds = generateXgroupCommands(config, consumers);
    expect(cmds).toHaveLength(3);
  });

  it("each command includes MKSTREAM flag", () => {
    const config = STREAM_CONFIGS[0];
    const cmds = generateXgroupCommands(config, ["worker-1"]);
    expect(cmds[0]).toContain("MKSTREAM");
  });

  it("uses correct stream name and consumer group name", () => {
    const config = STREAM_CONFIGS[0];
    const cmds = generateXgroupCommands(config, ["security-agent"]);
    expect(cmds[0]).toEqual([
      "XGROUP",
      "CREATE",
      "sentinel.diffs",
      "security-agent",
      "0",
      "MKSTREAM",
    ]);
  });

  it("returns empty array for empty consumers list", () => {
    const config = STREAM_CONFIGS[0];
    const cmds = generateXgroupCommands(config, []);
    expect(cmds).toHaveLength(0);
  });
});

describe("estimateMemoryUsageMb", () => {
  it("returns positive value for any config", () => {
    for (const config of STREAM_CONFIGS) {
      const mb = estimateMemoryUsageMb(config, 500);
      expect(mb).toBeGreaterThan(0);
    }
  });

  it("larger messages produce higher estimates", () => {
    const config = STREAM_CONFIGS[0];
    const small = estimateMemoryUsageMb(config, 100);
    const large = estimateMemoryUsageMb(config, 1000);
    expect(large).toBeGreaterThan(small);
  });

  it("estimates diffs stream at ~57MB with 500-byte messages", () => {
    const config = STREAM_CONFIGS.find((c) => c.stream === "sentinel.diffs")!;
    // 100000 * (500 + 100) = 60_000_000 bytes ≈ 57 MB
    const mb = estimateMemoryUsageMb(config, 500);
    expect(mb).toBeGreaterThanOrEqual(50);
    expect(mb).toBeLessThanOrEqual(65);
  });

  it("returns integer (ceiled) value", () => {
    const config = STREAM_CONFIGS[0];
    const mb = estimateMemoryUsageMb(config, 333);
    expect(Number.isInteger(mb)).toBe(true);
  });
});

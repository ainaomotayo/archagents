import { describe, it, expect } from "vitest";
import {
  PARTITION_CONFIGS,
  generateCreatePartitionSql,
  generateDropPartitionSql,
  getPartitionsToCreate,
  getPartitionsToDrop,
} from "./partition-config.js";

describe("PARTITION_CONFIGS", () => {
  it("defines configs for scans, findings, and audit_events", () => {
    const tables = PARTITION_CONFIGS.map((c) => c.table);
    expect(tables).toContain("scans");
    expect(tables).toContain("findings");
    expect(tables).toContain("audit_events");
  });

  it("audit_events has 7-year retention (2555 days)", () => {
    const audit = PARTITION_CONFIGS.find((c) => c.table === "audit_events")!;
    expect(audit.retentionPeriod).toBe(2555);
  });

  it("all configs use RANGE partitioning", () => {
    for (const config of PARTITION_CONFIGS) {
      expect(config.partitionBy).toBe("RANGE");
    }
  });
});

describe("generateCreatePartitionSql", () => {
  const config = PARTITION_CONFIGS[0]; // scans, monthly

  it("generates valid CREATE TABLE ... PARTITION OF SQL", () => {
    const sql = generateCreatePartitionSql(config, new Date("2026-03-15"));
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS scans_2026_03_01");
    expect(sql).toContain("PARTITION OF scans");
    expect(sql).toContain("FOR VALUES FROM ('2026-03-01') TO ('2026-04-01')");
  });

  it("handles year boundaries correctly", () => {
    const sql = generateCreatePartitionSql(config, new Date("2026-12-10"));
    expect(sql).toContain("FROM ('2026-12-01') TO ('2027-01-01')");
  });
});

describe("generateDropPartitionSql", () => {
  const config = PARTITION_CONFIGS[0];

  it("generates valid DROP TABLE SQL", () => {
    const sql = generateDropPartitionSql(config, new Date("2025-01-15"));
    expect(sql).toContain("DROP TABLE IF EXISTS scans_2025_01_01");
  });
});

describe("getPartitionsToCreate", () => {
  const config = PARTITION_CONFIGS[0]; // premakeCount = 3

  it("creates current + premakeCount partitions", () => {
    const statements = getPartitionsToCreate(config, new Date("2026-03-15"));
    // current month + 3 ahead = 4 statements
    expect(statements).toHaveLength(4);
  });

  it("all statements are CREATE TABLE", () => {
    const statements = getPartitionsToCreate(config, new Date("2026-03-15"));
    for (const sql of statements) {
      expect(sql).toMatch(/^CREATE TABLE IF NOT EXISTS/);
    }
  });

  it("includes the current month partition", () => {
    const statements = getPartitionsToCreate(config, new Date("2026-03-15"));
    expect(statements[0]).toContain("scans_2026_03_01");
  });
});

describe("getPartitionsToDrop", () => {
  const config = PARTITION_CONFIGS[0]; // retentionPeriod = 365

  it("returns DROP statements for expired partitions", () => {
    const statements = getPartitionsToDrop(config, new Date("2026-03-15"));
    expect(statements.length).toBeGreaterThan(0);
    for (const sql of statements) {
      expect(sql).toMatch(/^DROP TABLE IF EXISTS/);
    }
  });

  it("dropped partitions are older than retention period", () => {
    const statements = getPartitionsToDrop(config, new Date("2026-03-15"));
    // All dropped partitions should reference dates before March 2025
    for (const sql of statements) {
      const match = sql.match(/scans_(\d{4})_(\d{2})_(\d{2})/);
      expect(match).toBeTruthy();
      if (match) {
        const partitionDate = new Date(
          `${match[1]}-${match[2]}-${match[3]}`,
        );
        const cutoff = new Date("2025-03-15"); // 365 days before 2026-03-15
        expect(partitionDate.getTime()).toBeLessThan(cutoff.getTime());
      }
    }
  });
});

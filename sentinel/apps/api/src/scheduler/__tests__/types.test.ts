import { describe, test, expect } from "vitest";
import type { SchedulerJob, JobContext, JobTier } from "../types.js";

describe("scheduler types", () => {
  test("SchedulerJob interface requires name, schedule, tier, dependencies, execute", () => {
    const job: SchedulerJob = {
      name: "test-job",
      schedule: "0 * * * *",
      tier: "critical",
      dependencies: ["redis"],
      execute: async (_ctx: JobContext) => {},
    };
    expect(job.name).toBe("test-job");
    expect(job.tier).toBe("critical");
    expect(job.dependencies).toEqual(["redis"]);
  });

  test("JobTier accepts critical and non-critical", () => {
    const t1: JobTier = "critical";
    const t2: JobTier = "non-critical";
    expect(t1).toBe("critical");
    expect(t2).toBe("non-critical");
  });
});

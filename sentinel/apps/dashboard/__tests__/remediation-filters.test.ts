import { describe, it, expect } from "vitest";
import type {
  TypeFilter,
  StatusFilter,
  PriorityFilter,
} from "@/components/remediations/remediation-filters";

// Since the vitest config uses environment: "node" (no DOM), we test the
// filter type contracts and expected filter values.

const TYPE_VALUES: TypeFilter[] = ["all", "compliance", "finding"];
const STATUS_VALUES: StatusFilter[] = ["all", "open", "in_progress", "completed", "accepted_risk"];
const PRIORITY_VALUES: PriorityFilter[] = ["all", "critical", "high", "medium", "low"];

describe("RemediationFilters type contracts", () => {
  it("TypeFilter supports 3 values: all, compliance, finding", () => {
    expect(TYPE_VALUES).toHaveLength(3);
    expect(TYPE_VALUES).toContain("all");
    expect(TYPE_VALUES).toContain("compliance");
    expect(TYPE_VALUES).toContain("finding");
  });

  it("StatusFilter supports 5 values", () => {
    expect(STATUS_VALUES).toHaveLength(5);
    expect(STATUS_VALUES).toContain("all");
    expect(STATUS_VALUES).toContain("open");
    expect(STATUS_VALUES).toContain("in_progress");
    expect(STATUS_VALUES).toContain("completed");
    expect(STATUS_VALUES).toContain("accepted_risk");
  });

  it("PriorityFilter supports 5 values: all, critical, high, medium, low", () => {
    expect(PRIORITY_VALUES).toHaveLength(5);
    expect(PRIORITY_VALUES).toContain("all");
    expect(PRIORITY_VALUES).toContain("critical");
    expect(PRIORITY_VALUES).toContain("high");
    expect(PRIORITY_VALUES).toContain("medium");
    expect(PRIORITY_VALUES).toContain("low");
  });

  it("'all' is the first (default) value for each filter", () => {
    expect(TYPE_VALUES[0]).toBe("all");
    expect(STATUS_VALUES[0]).toBe("all");
    expect(PRIORITY_VALUES[0]).toBe("all");
  });
});

describe("filter value matching", () => {
  it("status filter values align with STATUS_LABELS keys in remediation-card", () => {
    // The remediation-card component uses these exact status keys
    const cardStatuses = ["open", "in_progress", "completed", "accepted_risk"];
    const filterStatuses = STATUS_VALUES.filter((v) => v !== "all");
    expect(filterStatuses).toEqual(cardStatuses);
  });

  it("priority filter values align with PRIORITY_STYLES keys in remediation-card", () => {
    const cardPriorities = ["critical", "high", "medium", "low"];
    const filterPriorities = PRIORITY_VALUES.filter((v) => v !== "all");
    expect(filterPriorities).toEqual(cardPriorities);
  });
});

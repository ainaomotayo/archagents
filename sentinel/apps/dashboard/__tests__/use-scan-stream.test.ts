import { describe, it, expect } from "vitest";
import {
  parseStreamEvent,
  reduceEvent,
  type ScanStreamState,
  type ScanStreamEvent,
} from "@/lib/use-scan-stream";

// ---------------------------------------------------------------------------
// parseStreamEvent
// ---------------------------------------------------------------------------

describe("parseStreamEvent", () => {
  it("parses a valid finding.new event", () => {
    const data = JSON.stringify({ title: "SQLi", severity: "high", file: "app.py", scanner: "security" });
    const event = parseStreamEvent("finding.new", data, "1-0");
    expect(event).not.toBeNull();
    expect(event!.type).toBe("finding.new");
    expect(event!.data.title).toBe("SQLi");
    expect(event!.id).toBe("1-0");
  });

  it("parses an agent.started event", () => {
    const event = parseStreamEvent("agent.started", '{"agent":"security"}', "2-0");
    expect(event).not.toBeNull();
    expect(event!.type).toBe("agent.started");
    expect(event!.data.agent).toBe("security");
  });

  it("parses a scan.completed event", () => {
    const event = parseStreamEvent("scan.completed", '{"scanId":"s1","totalFindings":3}', "99-0");
    expect(event).not.toBeNull();
    expect(event!.type).toBe("scan.completed");
    expect(event!.data.totalFindings).toBe(3);
  });

  it("returns null for invalid JSON", () => {
    expect(parseStreamEvent("finding.new", "not-json", "1-0")).toBeNull();
  });

  it("returns null for non-object data", () => {
    expect(parseStreamEvent("finding.new", '"just a string"', "1-0")).toBeNull();
  });

  it("returns null for null data", () => {
    expect(parseStreamEvent("finding.new", "null", "1-0")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// reduceEvent
// ---------------------------------------------------------------------------

const INITIAL: ScanStreamState = {
  events: [],
  findingCount: 0,
  activeAgents: [],
  completedAgents: [],
  progress: 0,
  isComplete: false,
  connected: false,
  error: null,
};

describe("reduceEvent", () => {
  it("increments findingCount for finding.new", () => {
    const event: ScanStreamEvent = {
      type: "finding.new",
      data: { title: "SQLi", severity: "high", file: "app.py", scanner: "sec" },
      id: "1-0",
    };
    const next = reduceEvent(INITIAL, event);
    expect(next.findingCount).toBe(1);
    expect(next.events).toHaveLength(1);
  });

  it("increments findingCount for finding.enriched", () => {
    const event: ScanStreamEvent = {
      type: "finding.enriched",
      data: { title: "Enriched" },
      id: "2-0",
    };
    const state = { ...INITIAL, findingCount: 5 };
    const next = reduceEvent(state, event);
    expect(next.findingCount).toBe(6);
  });

  it("tracks agent.started", () => {
    const event: ScanStreamEvent = {
      type: "agent.started",
      data: { agent: "security" },
      id: "3-0",
    };
    const next = reduceEvent(INITIAL, event);
    expect(next.activeAgents).toEqual(["security"]);
  });

  it("does not duplicate agent.started", () => {
    const event: ScanStreamEvent = {
      type: "agent.started",
      data: { agent: "security" },
      id: "4-0",
    };
    const state = { ...INITIAL, activeAgents: ["security"] };
    const next = reduceEvent(state, event);
    expect(next.activeAgents).toEqual(["security"]);
  });

  it("tracks agent.completed", () => {
    const event: ScanStreamEvent = {
      type: "agent.completed",
      data: { agent: "dependency" },
      id: "5-0",
    };
    const next = reduceEvent(INITIAL, event);
    expect(next.completedAgents).toEqual(["dependency"]);
  });

  it("updates progress for scan.progress", () => {
    const event: ScanStreamEvent = {
      type: "scan.progress",
      data: { scanId: "s1", progress: 60, agentsCompleted: 3, agentsTotal: 5 },
      id: "6-0",
    };
    const next = reduceEvent(INITIAL, event);
    expect(next.progress).toBe(60);
  });

  it("clamps progress to 0-100", () => {
    const event: ScanStreamEvent = {
      type: "scan.progress",
      data: { scanId: "s1", progress: 150, agentsCompleted: 5, agentsTotal: 5 },
      id: "7-0",
    };
    const next = reduceEvent(INITIAL, event);
    expect(next.progress).toBe(100);
  });

  it("marks scan.completed", () => {
    const event: ScanStreamEvent = {
      type: "scan.completed",
      data: { scanId: "s1", totalFindings: 3 },
      id: "8-0",
    };
    const next = reduceEvent(INITIAL, event);
    expect(next.isComplete).toBe(true);
    expect(next.progress).toBe(100);
  });

  it("marks scan.cancelled", () => {
    const event: ScanStreamEvent = {
      type: "scan.cancelled",
      data: { scanId: "s1" },
      id: "9-0",
    };
    const next = reduceEvent(INITIAL, event);
    expect(next.isComplete).toBe(true);
  });

  it("accumulates events", () => {
    let state = INITIAL;
    for (let i = 0; i < 3; i++) {
      state = reduceEvent(state, {
        type: "finding.new",
        data: { title: `Finding ${i}` },
        id: `${i}-0`,
      });
    }
    expect(state.events).toHaveLength(3);
    expect(state.findingCount).toBe(3);
  });

  it("does not mutate original state", () => {
    const event: ScanStreamEvent = {
      type: "finding.new",
      data: { title: "test" },
      id: "1-0",
    };
    const next = reduceEvent(INITIAL, event);
    expect(INITIAL.findingCount).toBe(0);
    expect(INITIAL.events).toHaveLength(0);
    expect(next.findingCount).toBe(1);
  });
});

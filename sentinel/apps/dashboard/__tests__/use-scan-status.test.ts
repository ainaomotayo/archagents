import { describe, it, expect } from "vitest";
import { parseScanStatusEvent, ScanStatusEvent } from "@/lib/use-scan-status";

// ---------------------------------------------------------------------------
// parseScanStatusEvent
// ---------------------------------------------------------------------------

describe("parseScanStatusEvent", () => {
  it("parses a valid complete event", () => {
    const data = JSON.stringify({
      scanId: "scan-001",
      status: "scanning",
      progress: 42,
      agentsCompleted: 2,
      agentsTotal: 5,
      updatedAt: "2026-03-09T10:00:00.000Z",
    });

    const result = parseScanStatusEvent(data);

    expect(result).not.toBeNull();
    expect(result!.scanId).toBe("scan-001");
    expect(result!.status).toBe("scanning");
    expect(result!.progress).toBe(42);
    expect(result!.agentsCompleted).toBe(2);
    expect(result!.agentsTotal).toBe(5);
    expect(result!.updatedAt).toBe("2026-03-09T10:00:00.000Z");
  });

  it("parses a minimal event (only required fields)", () => {
    const data = JSON.stringify({
      scanId: "scan-002",
      status: "pending",
      updatedAt: "2026-03-09T11:00:00.000Z",
    });

    const result = parseScanStatusEvent(data);

    expect(result).not.toBeNull();
    expect(result!.scanId).toBe("scan-002");
    expect(result!.status).toBe("pending");
    expect(result!.progress).toBeUndefined();
    expect(result!.agentsCompleted).toBeUndefined();
  });

  it("returns null for invalid JSON", () => {
    expect(parseScanStatusEvent("not json")).toBeNull();
    expect(parseScanStatusEvent("{bad}")).toBeNull();
    expect(parseScanStatusEvent("")).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    // Missing scanId
    expect(
      parseScanStatusEvent(
        JSON.stringify({ status: "scanning", updatedAt: "2026-01-01T00:00:00Z" }),
      ),
    ).toBeNull();

    // Missing status
    expect(
      parseScanStatusEvent(
        JSON.stringify({ scanId: "scan-001", updatedAt: "2026-01-01T00:00:00Z" }),
      ),
    ).toBeNull();

    // Missing updatedAt
    expect(
      parseScanStatusEvent(
        JSON.stringify({ scanId: "scan-001", status: "scanning" }),
      ),
    ).toBeNull();
  });

  it("returns null for an invalid status value", () => {
    const data = JSON.stringify({
      scanId: "scan-003",
      status: "running", // not in the valid set
      updatedAt: "2026-03-09T12:00:00.000Z",
    });

    expect(parseScanStatusEvent(data)).toBeNull();
  });

  it("clamps progress to 0-100 range", () => {
    const over = parseScanStatusEvent(
      JSON.stringify({
        scanId: "scan-004",
        status: "scanning",
        progress: 150,
        updatedAt: "2026-03-09T13:00:00.000Z",
      }),
    );
    expect(over!.progress).toBe(100);

    const under = parseScanStatusEvent(
      JSON.stringify({
        scanId: "scan-005",
        status: "scanning",
        progress: -10,
        updatedAt: "2026-03-09T13:00:00.000Z",
      }),
    );
    expect(under!.progress).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Status transition scenarios
// ---------------------------------------------------------------------------

describe("status transitions", () => {
  it("models a full lifecycle: pending -> scanning -> completed", () => {
    const events: string[] = [
      JSON.stringify({
        scanId: "scan-100",
        status: "pending",
        progress: 0,
        updatedAt: "2026-03-09T14:00:00.000Z",
      }),
      JSON.stringify({
        scanId: "scan-100",
        status: "scanning",
        progress: 50,
        agentsCompleted: 3,
        agentsTotal: 6,
        updatedAt: "2026-03-09T14:00:05.000Z",
      }),
      JSON.stringify({
        scanId: "scan-100",
        status: "completed",
        progress: 100,
        agentsCompleted: 6,
        agentsTotal: 6,
        updatedAt: "2026-03-09T14:00:10.000Z",
      }),
    ];

    const parsed = events.map(parseScanStatusEvent).filter(Boolean) as ScanStatusEvent[];

    expect(parsed).toHaveLength(3);
    expect(parsed[0].status).toBe("pending");
    expect(parsed[1].status).toBe("scanning");
    expect(parsed[2].status).toBe("completed");
    expect(parsed[2].progress).toBe(100);
  });
});

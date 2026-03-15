import { describe, it, expect, vi } from "vitest";
import { createDebouncedScanner } from "../../src/features/scan-trigger.js";

describe("ScanTrigger", () => {
  it("calls triggerScan after debounce", async () => {
    vi.useFakeTimers();
    const triggerScan = vi.fn().mockResolvedValue(undefined);
    const scanner = createDebouncedScanner(triggerScan, 100);

    scanner.onSave("/workspace/src/foo.ts");
    expect(triggerScan).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(triggerScan).toHaveBeenCalledWith(["/workspace/src/foo.ts"]);
    vi.useRealTimers();
  });

  it("batches multiple saves within debounce window", async () => {
    vi.useFakeTimers();
    const triggerScan = vi.fn().mockResolvedValue(undefined);
    const scanner = createDebouncedScanner(triggerScan, 200);

    scanner.onSave("/workspace/a.ts");
    await vi.advanceTimersByTimeAsync(50);
    scanner.onSave("/workspace/b.ts");
    await vi.advanceTimersByTimeAsync(200);

    expect(triggerScan).toHaveBeenCalledTimes(1);
    expect(triggerScan).toHaveBeenCalledWith(["/workspace/a.ts", "/workspace/b.ts"]);
    vi.useRealTimers();
  });

  it("resets timer on new save", async () => {
    vi.useFakeTimers();
    const triggerScan = vi.fn().mockResolvedValue(undefined);
    const scanner = createDebouncedScanner(triggerScan, 100);

    scanner.onSave("/workspace/a.ts");
    await vi.advanceTimersByTimeAsync(80);
    scanner.onSave("/workspace/b.ts");
    await vi.advanceTimersByTimeAsync(80);
    expect(triggerScan).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(20);
    expect(triggerScan).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("dispose cancels pending scan", async () => {
    vi.useFakeTimers();
    const triggerScan = vi.fn().mockResolvedValue(undefined);
    const scanner = createDebouncedScanner(triggerScan, 100);

    scanner.onSave("/workspace/a.ts");
    scanner.dispose();
    await vi.advanceTimersByTimeAsync(200);
    expect(triggerScan).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

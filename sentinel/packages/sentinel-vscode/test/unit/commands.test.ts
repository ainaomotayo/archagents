import { describe, it, expect, vi } from "vitest";

describe("Commands", () => {
  it("configure command stores token in secrets", async () => {
    const { handleConfigure } = await import("../../src/commands/configure.js");
    const secrets = { store: vi.fn(), get: vi.fn() };
    const showInputBox = vi.fn().mockResolvedValue("test-token");
    await handleConfigure(secrets as any, showInputBox as any);
    expect(secrets.store).toHaveBeenCalledWith("sentinel.apiToken", "test-token");
  });

  it("configure command does nothing if cancelled", async () => {
    const { handleConfigure } = await import("../../src/commands/configure.js");
    const secrets = { store: vi.fn(), get: vi.fn() };
    const showInputBox = vi.fn().mockResolvedValue(undefined);
    await handleConfigure(secrets as any, showInputBox as any);
    expect(secrets.store).not.toHaveBeenCalled();
  });

  it("openDashboard builds correct URL", async () => {
    const { buildDashboardUrl } = await import("../../src/commands/open-dashboard.js");
    expect(buildDashboardUrl("http://localhost:8080")).toBe("http://localhost:3000");
    expect(buildDashboardUrl("https://api.sentinel.io")).toBe("https://api.sentinel.io");
    expect(buildDashboardUrl("http://sentinel.local:8080")).toBe("http://sentinel.local:3000");
  });

  it("triggerScan sends LSP command", async () => {
    const { handleTriggerScan } = await import("../../src/commands/trigger-scan.js");
    const client = { sendRequest: vi.fn().mockResolvedValue(undefined) };
    await handleTriggerScan(client as any, "proj-1", ["/foo/bar.ts"]);
    expect(client.sendRequest).toHaveBeenCalledWith(
      "workspace/executeCommand",
      { command: "sentinel.triggerScan", arguments: ["proj-1", ["/foo/bar.ts"]] },
    );
  });

  it("suppress sends LSP command and returns finding ID", async () => {
    const { handleSuppress } = await import("../../src/commands/suppress.js");
    const client = { sendRequest: vi.fn().mockResolvedValue(undefined) };
    await handleSuppress(client as any, "finding-123");
    expect(client.sendRequest).toHaveBeenCalledWith(
      "workspace/executeCommand",
      { command: "sentinel.suppress", arguments: ["finding-123"] },
    );
  });
});

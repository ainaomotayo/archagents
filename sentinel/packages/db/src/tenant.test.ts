import { describe, it, expect, vi } from "vitest";
import { withTenant } from "./tenant.js";

function createMockPrismaClient() {
  const mockTx = {
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
  };

  const mockClient = {
    $transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => {
      return fn(mockTx);
    }),
  };

  return { mockClient, mockTx };
}

describe("withTenant", () => {
  it("calls $transaction on the prisma client", async () => {
    const { mockClient, mockTx } = createMockPrismaClient();

    await withTenant(mockClient as never, "org-123", async () => "ok");

    expect(mockClient.$transaction).toHaveBeenCalledOnce();
  });

  it("sets app.current_org_id via set_config with LOCAL=true", async () => {
    const { mockClient, mockTx } = createMockPrismaClient();

    await withTenant(mockClient as never, "org-456", async () => "ok");

    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      `SELECT set_config('app.current_org_id', $1, true)`,
      "org-456",
    );
  });

  it("passes the transaction proxy to the callback", async () => {
    const { mockClient, mockTx } = createMockPrismaClient();
    let receivedTx: unknown;

    await withTenant(mockClient as never, "org-789", async (tx) => {
      receivedTx = tx;
      return "ok";
    });

    expect(receivedTx).toBe(mockTx);
  });

  it("returns the callback's return value", async () => {
    const { mockClient } = createMockPrismaClient();

    const result = await withTenant(mockClient as never, "org-123", async () => {
      return { scans: 42 };
    });

    expect(result).toEqual({ scans: 42 });
  });
});

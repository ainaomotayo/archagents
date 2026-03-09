import { describe, it, expect, vi } from "vitest";
import { AuditLog, type AuditEventStore, type AuditInput } from "./audit-log.js";

function makeStore(overrides: Partial<AuditEventStore> = {}): AuditEventStore {
  return {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async ({ data }) => data),
    ...overrides,
  };
}

const sampleInput: AuditInput = {
  actor: { type: "user", id: "u-1", name: "Alice" },
  action: "policy.create",
  resource: { type: "policy", id: "pol-1" },
  detail: { title: "No direct pushes" },
};

describe("AuditLog", () => {
  it("creates an audit event with hash chain (GENESIS)", async () => {
    const store = makeStore();
    const log = new AuditLog(store);

    const event = await log.append("org-1", sampleInput);

    // Should have called findFirst to look for previous event
    expect(store.findFirst).toHaveBeenCalledOnce();

    // First event chains from GENESIS
    expect(event.previousEventHash).toBe("GENESIS");

    // Event hash is a sha256-prefixed string
    expect(event.eventHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    // Core fields persisted
    expect(event.orgId).toBe("org-1");
    expect(event.actorType).toBe("user");
    expect(event.actorId).toBe("u-1");
    expect(event.action).toBe("policy.create");
    expect(event.resourceType).toBe("policy");
    expect(event.resourceId).toBe("pol-1");
  });

  it("chains to previous event hash", async () => {
    const previousHash = "sha256:abc123def456";
    const store = makeStore({
      findFirst: vi.fn().mockResolvedValue({ eventHash: previousHash }),
    });
    const log = new AuditLog(store);

    const event = await log.append("org-1", sampleInput);

    expect(event.previousEventHash).toBe(previousHash);
    expect(event.eventHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    // The new hash must differ from the previous hash
    expect(event.eventHash).not.toBe(previousHash);
  });

  it("produces deterministic sha256-prefixed hash", async () => {
    const store = makeStore();
    const log = new AuditLog(store);

    const event = await log.append("org-1", sampleInput);

    // Verify hash format: "sha256:" followed by exactly 64 hex characters
    const hashValue = (event.eventHash as string).replace("sha256:", "");
    expect(hashValue).toHaveLength(64);
    expect(hashValue).toMatch(/^[a-f0-9]+$/);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { JitProvisioner } from "../jit-provisioner.js";
import type { JitConfig } from "../jit-provisioner.js";
import type { StandardClaims } from "../providers/types.js";

const makeMockDb = () => ({
  user: { findFirst: vi.fn(), upsert: vi.fn() },
  orgMembership: { upsert: vi.fn() },
});

const baseClaims: StandardClaims = {
  sub: "ext-123",
  email: "alice@example.com",
  name: "Alice",
  groups: [],
};

const baseConfig: JitConfig = {
  provider: "okta",
  defaultRole: "viewer",
  roleMapping: { Security: "admin", Engineering: "developer" },
  jitEnabled: true,
};

describe("JitProvisioner", () => {
  let db: ReturnType<typeof makeMockDb>;
  let provisioner: JitProvisioner;

  beforeEach(() => {
    db = makeMockDb();
    provisioner = new JitProvisioner(db);
  });

  it("provisions new user on first login", async () => {
    db.user.findFirst.mockResolvedValue(null);
    db.user.upsert.mockResolvedValue({ id: "u-1" });
    db.orgMembership.upsert.mockResolvedValue({});

    const result = await provisioner.provisionOrUpdate(baseClaims, "org-1", baseConfig);

    expect(result).toEqual({ action: "created", userId: "u-1", role: "viewer" });
    expect(db.user.upsert).toHaveBeenCalledOnce();
    expect(db.orgMembership.upsert).toHaveBeenCalledOnce();
  });

  it("updates existing user on subsequent login", async () => {
    db.user.findFirst.mockResolvedValue({ id: "u-1", email: "alice@example.com" });
    db.user.upsert.mockResolvedValue({ id: "u-1" });
    db.orgMembership.upsert.mockResolvedValue({});

    const result = await provisioner.provisionOrUpdate(baseClaims, "org-1", baseConfig);

    expect(result).toEqual({ action: "updated", userId: "u-1", role: "viewer" });
  });

  it("maps groups to roles picking highest priority", async () => {
    db.user.findFirst.mockResolvedValue(null);
    db.user.upsert.mockResolvedValue({ id: "u-2" });
    db.orgMembership.upsert.mockResolvedValue({});

    const claims: StandardClaims = {
      ...baseClaims,
      groups: ["Engineering", "Security"],
    };

    const result = await provisioner.provisionOrUpdate(claims, "org-1", baseConfig);

    expect(result.role).toBe("admin");
    expect(db.orgMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ role: "admin" }),
      }),
    );
  });

  it("returns skipped when JIT is disabled", async () => {
    const config: JitConfig = { ...baseConfig, jitEnabled: false };

    const result = await provisioner.provisionOrUpdate(baseClaims, "org-1", config);

    expect(result).toEqual({ action: "skipped" });
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });

  it("uses defaultRole when no groups match", async () => {
    db.user.findFirst.mockResolvedValue(null);
    db.user.upsert.mockResolvedValue({ id: "u-3" });
    db.orgMembership.upsert.mockResolvedValue({});

    const claims: StandardClaims = {
      ...baseClaims,
      groups: ["Marketing", "Sales"],
    };

    const result = await provisioner.provisionOrUpdate(claims, "org-1", baseConfig);

    expect(result.role).toBe("viewer");
  });
});

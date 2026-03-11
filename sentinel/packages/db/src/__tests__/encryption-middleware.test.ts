import { describe, it, expect, vi, beforeEach } from "vitest";
import { createEncryptionMiddleware, ENCRYPTED_FIELDS } from "../encryption-middleware.js";

const mockEncrypt = vi.fn().mockResolvedValue("encrypted_value");
const mockDecrypt = vi.fn().mockResolvedValue("decrypted_value");
const mockEncryptDet = vi.fn().mockResolvedValue("det_encrypted");
const mockDecryptDet = vi.fn().mockResolvedValue("det_decrypted");

const mockEnvelope = {
  encrypt: mockEncrypt,
  decrypt: mockDecrypt,
  encryptDeterministic: mockEncryptDet,
  decryptDeterministic: mockDecryptDet,
};

describe("Prisma Encryption Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("encrypts sensitive fields on create", async () => {
    const middleware = createEncryptionMiddleware(mockEnvelope as any, () => "org-1");
    const next = vi.fn().mockResolvedValue({ id: "1", secret: "encrypted_value" });

    await middleware(
      { model: "WebhookEndpoint", action: "create", args: { data: { secret: "plain_secret" } } },
      next,
    );

    expect(mockEncrypt).toHaveBeenCalledWith("org-1", "webhook_secret", "plain_secret");
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ args: { data: { secret: "encrypted_value" } } }),
    );
  });

  it("skips non-encrypted models", async () => {
    const middleware = createEncryptionMiddleware(mockEnvelope as any, () => "org-1");
    const next = vi.fn().mockResolvedValue({ id: "1", name: "test" });

    await middleware(
      { model: "Project", action: "create", args: { data: { name: "test" } } },
      next,
    );

    expect(mockEncrypt).not.toHaveBeenCalled();
    expect(mockEncryptDet).not.toHaveBeenCalled();
  });

  it("uses deterministic mode for User.email", async () => {
    const middleware = createEncryptionMiddleware(mockEnvelope as any, () => "org-1");
    const next = vi.fn().mockResolvedValue({ id: "1", email: "det_encrypted" });

    await middleware(
      { model: "User", action: "create", args: { data: { email: "alice@acme.com" } } },
      next,
    );

    expect(mockEncryptDet).toHaveBeenCalledWith("org-1", "user_lookup", "alice@acme.com");
  });

  it("encrypts createMany array data", async () => {
    const middleware = createEncryptionMiddleware(mockEnvelope as any, () => "org-1");
    const next = vi.fn().mockResolvedValue({ count: 2 });

    await middleware(
      { model: "WebhookEndpoint", action: "createMany", args: { data: [{ secret: "s1" }, { secret: "s2" }] } },
      next,
    );

    expect(mockEncrypt).toHaveBeenCalledTimes(2);
    expect(mockEncrypt).toHaveBeenCalledWith("org-1", "webhook_secret", "s1");
    expect(mockEncrypt).toHaveBeenCalledWith("org-1", "webhook_secret", "s2");
  });

  it("encrypts upsert create and update sub-objects", async () => {
    const middleware = createEncryptionMiddleware(mockEnvelope as any, () => "org-1");
    const next = vi.fn().mockResolvedValue({ id: "1", secret: "encrypted_value" });

    await middleware(
      { model: "WebhookEndpoint", action: "upsert", args: { where: { id: "1" }, create: { secret: "new" }, update: { secret: "upd" } } },
      next,
    );

    expect(mockEncrypt).toHaveBeenCalledWith("org-1", "webhook_secret", "new");
    expect(mockEncrypt).toHaveBeenCalledWith("org-1", "webhook_secret", "upd");
  });

  it("encrypts where clause for deterministic fields", async () => {
    const middleware = createEncryptionMiddleware(mockEnvelope as any, () => "org-1");
    const next = vi.fn().mockResolvedValue({ id: "1", email: "det_encrypted" });

    await middleware(
      { model: "User", action: "findUnique", args: { where: { email: "alice@acme.com" } } },
      next,
    );

    expect(mockEncryptDet).toHaveBeenCalledWith("org-1", "user_lookup", "alice@acme.com");
  });

  it("decrypts results from read operations", async () => {
    const middleware = createEncryptionMiddleware(mockEnvelope as any, () => "org-1");
    const next = vi.fn().mockResolvedValue({ id: "1", secret: "some_encrypted" });

    const result = await middleware(
      { model: "WebhookEndpoint", action: "findFirst", args: {} },
      next,
    );

    expect(mockDecrypt).toHaveBeenCalledWith("org-1", "webhook_secret", "some_encrypted");
  });

  it("skips when orgId is null", async () => {
    const middleware = createEncryptionMiddleware(mockEnvelope as any, () => null);
    const next = vi.fn().mockResolvedValue({ id: "1", secret: "plain" });

    await middleware(
      { model: "WebhookEndpoint", action: "create", args: { data: { secret: "s" } } },
      next,
    );

    expect(mockEncrypt).not.toHaveBeenCalled();
  });

  it("ENCRYPTED_FIELDS registry has correct entries", () => {
    expect(ENCRYPTED_FIELDS.SsoConfig).toBeDefined();
    expect(ENCRYPTED_FIELDS.SsoConfig.fields).toContain("clientSecret");
    expect(ENCRYPTED_FIELDS.SsoConfig.mode).toBe("envelope");
    expect(ENCRYPTED_FIELDS.User.mode).toBe("deterministic");
  });
});

describe("ENCRYPTED_FIELDS coverage", () => {
  it("User includes name field", () => {
    expect(ENCRYPTED_FIELDS.User.fields).toContain("name");
  });

  it("WebhookEndpoint includes url and headers", () => {
    expect(ENCRYPTED_FIELDS.WebhookEndpoint.fields).toContain("url");
    expect(ENCRYPTED_FIELDS.WebhookEndpoint.fields).toContain("headers");
  });

  it("SsoConfig includes samlMetadata", () => {
    expect(ENCRYPTED_FIELDS.SsoConfig.fields).toContain("samlMetadata");
  });
});

// Mock @prisma/client so we can test initEncryption without a real DB
const mockExtends = vi.fn().mockReturnThis();
vi.mock("@prisma/client", () => {
  return {
    PrismaClient: vi.fn().mockImplementation(() => ({
      $extends: mockExtends,
      $disconnect: vi.fn(),
    })),
  };
});

describe("initEncryption and setCurrentOrgId wiring", () => {
  beforeEach(() => {
    vi.resetModules();
    mockExtends.mockClear();
  });

  it("initEncryption is exported and callable", async () => {
    const mod = await import("../index.js");
    expect(typeof mod.initEncryption).toBe("function");
  });

  it("setCurrentOrgId is exported and callable", async () => {
    const mod = await import("../index.js");
    expect(typeof mod.setCurrentOrgId).toBe("function");
  });

  it("initEncryption registers middleware on the Prisma client via $extends", async () => {
    const { initEncryption, disconnectDb } = await import("../index.js");

    const fakeEnvelope = {
      encrypt: vi.fn(),
      decrypt: vi.fn(),
      encryptDeterministic: vi.fn(),
      decryptDeterministic: vi.fn(),
    } as any;

    initEncryption(fakeEnvelope);

    expect(mockExtends).toHaveBeenCalledOnce();
    expect(mockExtends).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          $allOperations: expect.any(Function),
        }),
      }),
    );

    await disconnectDb();
  });

  it("setCurrentOrgId accepts string and null without throwing", async () => {
    const { setCurrentOrgId, disconnectDb } = await import("../index.js");

    expect(() => setCurrentOrgId("org-123")).not.toThrow();
    expect(() => setCurrentOrgId(null)).not.toThrow();

    await disconnectDb();
  });
});

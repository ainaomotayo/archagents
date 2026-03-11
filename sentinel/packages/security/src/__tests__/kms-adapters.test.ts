import { describe, it, expect, vi, beforeEach } from "vitest";
import type { KmsProvider } from "../kms-provider.js";

/* ------------------------------------------------------------------ */
/*  AWS KMS mocks                                                      */
/* ------------------------------------------------------------------ */
const mockAwsSend = vi.fn();

vi.mock("@aws-sdk/client-kms", () => {
  class MockKMSClient { send = mockAwsSend; }
  class MockGenerateDataKeyCommand { input: unknown; constructor(input: unknown) { this.input = input; } }
  class MockDecryptCommand { input: unknown; constructor(input: unknown) { this.input = input; } }
  class MockEncryptCommand { input: unknown; constructor(input: unknown) { this.input = input; } }
  return {
    KMSClient: MockKMSClient,
    GenerateDataKeyCommand: MockGenerateDataKeyCommand,
    DecryptCommand: MockDecryptCommand,
    EncryptCommand: MockEncryptCommand,
  };
});

/* ------------------------------------------------------------------ */
/*  GCP KMS mocks                                                      */
/* ------------------------------------------------------------------ */
const mockGcpEncrypt = vi.fn();
const mockGcpDecrypt = vi.fn();

vi.mock("@google-cloud/kms", () => {
  class MockKeyManagementServiceClient {
    cryptoKeyPath(p: string, l: string, r: string, k: string) {
      return `projects/${p}/locations/${l}/keyRings/${r}/cryptoKeys/${k}`;
    }
    encrypt = mockGcpEncrypt;
    decrypt = mockGcpDecrypt;
  }
  return { KeyManagementServiceClient: MockKeyManagementServiceClient };
});

/* ------------------------------------------------------------------ */
/*  Azure mocks                                                        */
/* ------------------------------------------------------------------ */
const mockAzureEncrypt = vi.fn();
const mockAzureDecrypt = vi.fn();
const mockAzureGetKey = vi.fn();

vi.mock("@azure/keyvault-keys", () => {
  class MockKeyClient { getKey = mockAzureGetKey; constructor(_url: string, _cred: unknown) {} }
  class MockCryptographyClient { encrypt = mockAzureEncrypt; decrypt = mockAzureDecrypt; constructor(_key: unknown, _cred: unknown) {} }
  return { KeyClient: MockKeyClient, CryptographyClient: MockCryptographyClient };
});

vi.mock("@azure/identity", () => {
  class MockDefaultAzureCredential {}
  return { DefaultAzureCredential: MockDefaultAzureCredential };
});

/* ------------------------------------------------------------------ */
/*  Imports (after vi.mock hoisting)                                   */
/* ------------------------------------------------------------------ */
import { AwsKmsProvider } from "../kms-aws-provider.js";
import { GcpKmsProvider } from "../kms-gcp-provider.js";
import { AzureKmsProvider } from "../kms-azure-provider.js";

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("AwsKmsProvider", () => {
  beforeEach(() => vi.clearAllMocks());

  it("has name 'aws'", () => {
    const p: KmsProvider = new AwsKmsProvider({ masterKeyArn: "arn:aws:kms:us-east-1:123:key/abc" });
    expect(p.name).toBe("aws");
  });

  it("implements KmsProvider interface methods", () => {
    const p = new AwsKmsProvider({ masterKeyArn: "arn:aws:kms:us-east-1:123:key/abc" });
    expect(typeof p.generateDataKey).toBe("function");
    expect(typeof p.unwrapDataKey).toBe("function");
    expect(typeof p.rewrapDataKey).toBe("function");
    expect(typeof p.ping).toBe("function");
  });

  it("generateDataKey returns plaintext and wrapped buffers", async () => {
    const plainBuf = new Uint8Array(32).fill(0xaa);
    const cipherBuf = new Uint8Array(64).fill(0xbb);
    mockAwsSend.mockResolvedValueOnce({ Plaintext: plainBuf, CiphertextBlob: cipherBuf });

    const p = new AwsKmsProvider({ masterKeyArn: "arn:aws:kms:us-east-1:123:key/abc" });
    const { plaintext, wrapped } = await p.generateDataKey("kek-1");
    expect(plaintext).toBeInstanceOf(Buffer);
    expect(wrapped).toBeInstanceOf(Buffer);
    expect(plaintext.length).toBe(32);
    expect(wrapped.length).toBe(64);
  });

  it("unwrapDataKey returns decrypted buffer", async () => {
    const decrypted = new Uint8Array(32).fill(0xcc);
    mockAwsSend.mockResolvedValueOnce({ Plaintext: decrypted });

    const p = new AwsKmsProvider({ masterKeyArn: "arn:aws:kms:us-east-1:123:key/abc" });
    const result = await p.unwrapDataKey("kek-1", Buffer.from("wrapped"));
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBe(32);
  });

  it("rewrapDataKey decrypts then re-encrypts", async () => {
    const decrypted = new Uint8Array(32).fill(0xdd);
    const reEncrypted = new Uint8Array(64).fill(0xee);
    mockAwsSend
      .mockResolvedValueOnce({ Plaintext: decrypted }) // decrypt
      .mockResolvedValueOnce({ CiphertextBlob: reEncrypted }); // encrypt

    const p = new AwsKmsProvider({ masterKeyArn: "arn:aws:kms:us-east-1:123:key/abc" });
    const result = await p.rewrapDataKey("kek-1", Buffer.from("wrapped"));
    expect(result).toBeInstanceOf(Buffer);
    expect(mockAwsSend).toHaveBeenCalledTimes(2);
  });

  it("ping returns true on success", async () => {
    mockAwsSend.mockResolvedValueOnce({
      Plaintext: new Uint8Array(32),
      CiphertextBlob: new Uint8Array(64),
    });
    const p = new AwsKmsProvider({ masterKeyArn: "arn:aws:kms:us-east-1:123:key/abc" });
    expect(await p.ping()).toBe(true);
  });

  it("ping returns false on failure", async () => {
    mockAwsSend.mockRejectedValueOnce(new Error("access denied"));
    const p = new AwsKmsProvider({ masterKeyArn: "arn:aws:kms:us-east-1:123:key/abc" });
    expect(await p.ping()).toBe(false);
  });
});

describe("GcpKmsProvider", () => {
  beforeEach(() => vi.clearAllMocks());

  const gcpOpts = { projectId: "proj", locationId: "global", keyRingId: "ring", keyId: "key" };

  it("has name 'gcp'", () => {
    const p: KmsProvider = new GcpKmsProvider(gcpOpts);
    expect(p.name).toBe("gcp");
  });

  it("implements KmsProvider interface methods", () => {
    const p = new GcpKmsProvider(gcpOpts);
    expect(typeof p.generateDataKey).toBe("function");
    expect(typeof p.unwrapDataKey).toBe("function");
    expect(typeof p.rewrapDataKey).toBe("function");
    expect(typeof p.ping).toBe("function");
  });

  it("generateDataKey returns plaintext and wrapped buffers", async () => {
    const ciphertext = new Uint8Array(64).fill(0xaa);
    mockGcpEncrypt.mockResolvedValueOnce([{ ciphertext }]);

    const p = new GcpKmsProvider(gcpOpts);
    const { plaintext, wrapped } = await p.generateDataKey("kek-1");
    expect(plaintext).toBeInstanceOf(Buffer);
    expect(plaintext.length).toBe(32);
    expect(wrapped).toBeInstanceOf(Buffer);
    expect(wrapped.length).toBe(64);
  });

  it("unwrapDataKey returns decrypted buffer", async () => {
    const decryptedData = new Uint8Array(32).fill(0xbb);
    mockGcpDecrypt.mockResolvedValueOnce([{ plaintext: decryptedData }]);

    const p = new GcpKmsProvider(gcpOpts);
    const result = await p.unwrapDataKey("kek-1", Buffer.from("wrapped"));
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBe(32);
  });

  it("rewrapDataKey decrypts then re-encrypts", async () => {
    const decryptedData = new Uint8Array(32).fill(0xcc);
    const reEncrypted = new Uint8Array(64).fill(0xdd);
    mockGcpDecrypt.mockResolvedValueOnce([{ plaintext: decryptedData }]);
    mockGcpEncrypt.mockResolvedValueOnce([{ ciphertext: reEncrypted }]);

    const p = new GcpKmsProvider(gcpOpts);
    const result = await p.rewrapDataKey("kek-1", Buffer.from("wrapped"));
    expect(result).toBeInstanceOf(Buffer);
    expect(mockGcpDecrypt).toHaveBeenCalledTimes(1);
    expect(mockGcpEncrypt).toHaveBeenCalledTimes(1);
  });

  it("ping returns true on successful roundtrip", async () => {
    const encrypted = new Uint8Array(64).fill(0xee);
    const testData = Buffer.from("sentinel-ping-test");
    mockGcpEncrypt.mockResolvedValueOnce([{ ciphertext: encrypted }]);
    mockGcpDecrypt.mockResolvedValueOnce([{ plaintext: testData }]);

    const p = new GcpKmsProvider(gcpOpts);
    expect(await p.ping()).toBe(true);
  });

  it("ping returns false on failure", async () => {
    mockGcpEncrypt.mockRejectedValueOnce(new Error("permission denied"));
    const p = new GcpKmsProvider(gcpOpts);
    expect(await p.ping()).toBe(false);
  });
});

describe("AzureKmsProvider", () => {
  beforeEach(() => vi.clearAllMocks());

  const azureOpts = { vaultUrl: "https://my-vault.vault.azure.net", keyName: "my-key" };

  it("has name 'azure'", () => {
    const p: KmsProvider = new AzureKmsProvider(azureOpts);
    expect(p.name).toBe("azure");
  });

  it("implements KmsProvider interface methods", () => {
    const p = new AzureKmsProvider(azureOpts);
    expect(typeof p.generateDataKey).toBe("function");
    expect(typeof p.unwrapDataKey).toBe("function");
    expect(typeof p.rewrapDataKey).toBe("function");
    expect(typeof p.ping).toBe("function");
  });

  it("generateDataKey returns plaintext and wrapped buffers", async () => {
    const encrypted = new Uint8Array(256).fill(0xaa);
    mockAzureGetKey.mockResolvedValueOnce({ id: "key-id" });
    mockAzureEncrypt.mockResolvedValueOnce({ result: encrypted });

    const p = new AzureKmsProvider(azureOpts);
    const { plaintext, wrapped } = await p.generateDataKey("kek-1");
    expect(plaintext).toBeInstanceOf(Buffer);
    expect(plaintext.length).toBe(32);
    expect(wrapped).toBeInstanceOf(Buffer);
  });

  it("unwrapDataKey returns decrypted buffer", async () => {
    const decrypted = new Uint8Array(32).fill(0xbb);
    mockAzureGetKey.mockResolvedValueOnce({ id: "key-id" });
    mockAzureDecrypt.mockResolvedValueOnce({ result: decrypted });

    const p = new AzureKmsProvider(azureOpts);
    const result = await p.unwrapDataKey("kek-1", Buffer.from("wrapped"));
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBe(32);
  });

  it("rewrapDataKey decrypts then re-encrypts", async () => {
    const decrypted = new Uint8Array(32).fill(0xcc);
    const reEncrypted = new Uint8Array(256).fill(0xdd);
    mockAzureGetKey.mockResolvedValue({ id: "key-id" });
    mockAzureDecrypt.mockResolvedValueOnce({ result: decrypted });
    mockAzureEncrypt.mockResolvedValueOnce({ result: reEncrypted });

    const p = new AzureKmsProvider(azureOpts);
    const result = await p.rewrapDataKey("kek-1", Buffer.from("wrapped"));
    expect(result).toBeInstanceOf(Buffer);
  });

  it("ping returns true when getKey succeeds", async () => {
    mockAzureGetKey.mockResolvedValueOnce({ id: "key-id" });
    const p = new AzureKmsProvider(azureOpts);
    expect(await p.ping()).toBe(true);
  });

  it("ping returns false on failure", async () => {
    mockAzureGetKey.mockRejectedValueOnce(new Error("not found"));
    const p = new AzureKmsProvider(azureOpts);
    expect(await p.ping()).toBe(false);
  });
});

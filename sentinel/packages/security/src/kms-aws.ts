import {
  KMSClient,
  GenerateDataKeyCommand,
  DecryptCommand,
} from "@aws-sdk/client-kms";
import type { KmsKeyStore } from "./kms.js";

export class AwsKmsKeyStore implements KmsKeyStore {
  private kms: KMSClient;
  private masterKeyId: string;
  private cache = new Map<string, Buffer>();

  constructor(opts: { region?: string; masterKeyId: string }) {
    this.kms = new KMSClient({ region: opts.region ?? "us-east-1" });
    this.masterKeyId = opts.masterKeyId;
  }

  async getKey(orgId: string): Promise<Buffer | null> {
    return this.cache.get(orgId) ?? null;
  }

  async storeKey(orgId: string, key: Buffer): Promise<void> {
    this.cache.set(orgId, key);
  }

  async destroyKey(orgId: string): Promise<void> {
    this.cache.delete(orgId);
  }

  async generateDataKey(): Promise<{ plaintext: Buffer; encrypted: Buffer }> {
    const result = await this.kms.send(
      new GenerateDataKeyCommand({
        KeyId: this.masterKeyId,
        KeySpec: "AES_256",
      }),
    );
    return {
      plaintext: Buffer.from(result.Plaintext!),
      encrypted: Buffer.from(result.CiphertextBlob!),
    };
  }

  async decryptDataKey(encryptedKey: Buffer): Promise<Buffer> {
    const result = await this.kms.send(
      new DecryptCommand({ CiphertextBlob: encryptedKey }),
    );
    return Buffer.from(result.Plaintext!);
  }
}

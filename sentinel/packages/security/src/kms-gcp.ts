import { KeyManagementServiceClient } from "@google-cloud/kms";
import type { KmsKeyStore } from "./kms.js";

export class GcpKmsKeyStore implements KmsKeyStore {
  private client: KeyManagementServiceClient;
  private keyName: string;
  private cache = new Map<string, Buffer>();

  constructor(opts: {
    projectId: string;
    locationId: string;
    keyRingId: string;
    keyId: string;
  }) {
    this.client = new KeyManagementServiceClient();
    this.keyName = this.client.cryptoKeyPath(
      opts.projectId,
      opts.locationId,
      opts.keyRingId,
      opts.keyId,
    );
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

  async encryptData(plaintext: Buffer): Promise<Buffer> {
    const [result] = await this.client.encrypt({
      name: this.keyName,
      plaintext,
    });
    return Buffer.from(result.ciphertext as Uint8Array);
  }

  async decryptData(ciphertext: Buffer): Promise<Buffer> {
    const [result] = await this.client.decrypt({
      name: this.keyName,
      ciphertext,
    });
    return Buffer.from(result.plaintext as Uint8Array);
  }
}

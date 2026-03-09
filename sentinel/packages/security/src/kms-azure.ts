import { KeyClient, CryptographyClient } from "@azure/keyvault-keys";
import { DefaultAzureCredential } from "@azure/identity";
import type { KmsKeyStore } from "./kms.js";

export class AzureKmsKeyStore implements KmsKeyStore {
  private keyClient: KeyClient;
  private vaultUrl: string;
  private keyName: string;
  private cache = new Map<string, Buffer>();

  constructor(opts: { vaultUrl: string; keyName: string }) {
    this.vaultUrl = opts.vaultUrl;
    this.keyName = opts.keyName;
    this.keyClient = new KeyClient(opts.vaultUrl, new DefaultAzureCredential());
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
    const key = await this.keyClient.getKey(this.keyName);
    const cryptoClient = new CryptographyClient(key, new DefaultAzureCredential());
    const result = await cryptoClient.encrypt("RSA-OAEP", plaintext);
    return Buffer.from(result.result);
  }

  async decryptData(ciphertext: Buffer): Promise<Buffer> {
    const key = await this.keyClient.getKey(this.keyName);
    const cryptoClient = new CryptographyClient(key, new DefaultAzureCredential());
    const result = await cryptoClient.decrypt("RSA-OAEP", ciphertext);
    return Buffer.from(result.result);
  }
}

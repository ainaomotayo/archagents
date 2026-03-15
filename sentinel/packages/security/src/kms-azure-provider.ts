import { randomBytes } from "node:crypto";
import { KeyClient, CryptographyClient } from "@azure/keyvault-keys";
import { DefaultAzureCredential } from "@azure/identity";
import type { KmsProvider } from "./kms-provider.js";

export class AzureKmsProvider implements KmsProvider {
  readonly name = "azure";
  private keyClient: KeyClient;
  private keyName: string;
  private credential: DefaultAzureCredential;

  constructor(opts: { vaultUrl: string; keyName: string }) {
    this.keyName = opts.keyName;
    this.credential = new DefaultAzureCredential();
    this.keyClient = new KeyClient(opts.vaultUrl, this.credential);
  }

  private async getCryptoClient(): Promise<CryptographyClient> {
    const key = await this.keyClient.getKey(this.keyName);
    return new CryptographyClient(key, this.credential);
  }

  async generateDataKey(_kekId: string): Promise<{ plaintext: Buffer; wrapped: Buffer }> {
    const plaintext = randomBytes(32);
    const cryptoClient = await this.getCryptoClient();
    const result = await cryptoClient.encrypt("RSA-OAEP", plaintext);
    const wrapped = Buffer.from(result.result);
    return { plaintext, wrapped };
  }

  async unwrapDataKey(_kekId: string, wrappedDek: Buffer): Promise<Buffer> {
    const cryptoClient = await this.getCryptoClient();
    const result = await cryptoClient.decrypt("RSA-OAEP", wrappedDek);
    return Buffer.from(result.result);
  }

  async rewrapDataKey(kekId: string, wrappedDek: Buffer): Promise<Buffer> {
    const plaintext = await this.unwrapDataKey(kekId, wrappedDek);
    try {
      const cryptoClient = await this.getCryptoClient();
      const result = await cryptoClient.encrypt("RSA-OAEP", plaintext);
      return Buffer.from(result.result);
    } finally {
      plaintext.fill(0);
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.keyClient.getKey(this.keyName);
      return true;
    } catch {
      return false;
    }
  }
}

import { randomBytes } from "node:crypto";
import { KeyManagementServiceClient } from "@google-cloud/kms";
import type { KmsProvider } from "./kms-provider.js";

export class GcpKmsProvider implements KmsProvider {
  readonly name = "gcp";
  private client: KeyManagementServiceClient;
  private keyName: string;

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

  async generateDataKey(_kekId: string): Promise<{ plaintext: Buffer; wrapped: Buffer }> {
    const plaintext = randomBytes(32);
    const [result] = await this.client.encrypt({
      name: this.keyName,
      plaintext,
    });
    const wrapped = Buffer.from(result.ciphertext as Uint8Array);
    return { plaintext, wrapped };
  }

  async unwrapDataKey(_kekId: string, wrappedDek: Buffer): Promise<Buffer> {
    const [result] = await this.client.decrypt({
      name: this.keyName,
      ciphertext: wrappedDek,
    });
    return Buffer.from(result.plaintext as Uint8Array);
  }

  async rewrapDataKey(kekId: string, wrappedDek: Buffer): Promise<Buffer> {
    const plaintext = await this.unwrapDataKey(kekId, wrappedDek);
    try {
      const [result] = await this.client.encrypt({
        name: this.keyName,
        plaintext,
      });
      return Buffer.from(result.ciphertext as Uint8Array);
    } finally {
      plaintext.fill(0);
    }
  }

  async ping(): Promise<boolean> {
    try {
      const testData = Buffer.from("sentinel-ping-test");
      const [encResult] = await this.client.encrypt({
        name: this.keyName,
        plaintext: testData,
      });
      const [decResult] = await this.client.decrypt({
        name: this.keyName,
        ciphertext: encResult.ciphertext,
      });
      return Buffer.from(decResult.plaintext as Uint8Array).equals(testData);
    } catch {
      return false;
    }
  }
}

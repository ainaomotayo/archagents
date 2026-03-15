import {
  KMSClient,
  GenerateDataKeyCommand,
  DecryptCommand,
  EncryptCommand,
} from "@aws-sdk/client-kms";
import type { KmsProvider } from "./kms-provider.js";

export class AwsKmsProvider implements KmsProvider {
  readonly name = "aws";
  private kms: KMSClient;
  private masterKeyArn: string;

  constructor(opts: { region?: string; masterKeyArn: string }) {
    this.kms = new KMSClient({ region: opts.region ?? "us-east-1" });
    this.masterKeyArn = opts.masterKeyArn;
  }

  async generateDataKey(_kekId: string): Promise<{ plaintext: Buffer; wrapped: Buffer }> {
    const result = await this.kms.send(
      new GenerateDataKeyCommand({
        KeyId: this.masterKeyArn,
        KeySpec: "AES_256",
      }),
    );
    return {
      plaintext: Buffer.from(result.Plaintext!),
      wrapped: Buffer.from(result.CiphertextBlob!),
    };
  }

  async unwrapDataKey(_kekId: string, wrappedDek: Buffer): Promise<Buffer> {
    const result = await this.kms.send(
      new DecryptCommand({ CiphertextBlob: wrappedDek }),
    );
    return Buffer.from(result.Plaintext!);
  }

  async rewrapDataKey(kekId: string, wrappedDek: Buffer): Promise<Buffer> {
    const plaintext = await this.unwrapDataKey(kekId, wrappedDek);
    try {
      const result = await this.kms.send(
        new EncryptCommand({
          KeyId: this.masterKeyArn,
          Plaintext: plaintext,
        }),
      );
      return Buffer.from(result.CiphertextBlob!);
    } finally {
      plaintext.fill(0);
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.generateDataKey("ping");
      return true;
    } catch {
      return false;
    }
  }
}

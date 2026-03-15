export interface KmsProvider {
  readonly name: string;
  generateDataKey(kekId: string): Promise<{ plaintext: Buffer; wrapped: Buffer }>;
  unwrapDataKey(kekId: string, wrappedDek: Buffer): Promise<Buffer>;
  rewrapDataKey(kekId: string, wrappedDek: Buffer): Promise<Buffer>;
  ping(): Promise<boolean>;
}

import { describe, it, expect } from "vitest";
import { AzureKmsKeyStore } from "../kms-azure.js";

describe("AzureKmsKeyStore", () => {
  it("implements KmsKeyStore interface", () => {
    expect(AzureKmsKeyStore).toBeDefined();
    expect(AzureKmsKeyStore.prototype.getKey).toBeDefined();
    expect(AzureKmsKeyStore.prototype.storeKey).toBeDefined();
    expect(AzureKmsKeyStore.prototype.destroyKey).toBeDefined();
  });
});

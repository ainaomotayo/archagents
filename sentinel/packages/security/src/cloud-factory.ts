import type { ArchiveProvider, CloudProvider } from "./archive-provider.js";
import type { KmsKeyStore } from "./kms.js";
import { InMemoryKeyStore } from "./kms.js";

export function getCloudProvider(): CloudProvider | null {
  const provider = process.env.CLOUD_PROVIDER?.toLowerCase();
  if (provider === "aws" || provider === "gcp" || provider === "azure") {
    return provider;
  }
  return null;
}

export async function createArchiveProvider(): Promise<ArchiveProvider | null> {
  const provider = getCloudProvider();
  if (!provider) return null;

  switch (provider) {
    case "aws": {
      const { AwsArchiveProvider } = await import("./archive-aws.js");
      return new AwsArchiveProvider({
        region: process.env.AWS_REGION ?? "us-east-1",
      });
    }
    case "gcp": {
      const { GcpArchiveProvider } = await import("./archive-gcp.js");
      return new GcpArchiveProvider({
        projectId: process.env.GCP_PROJECT_ID,
      });
    }
    case "azure": {
      const { AzureArchiveProvider } = await import("./archive-azure.js");
      return new AzureArchiveProvider({
        accountUrl: process.env.AZURE_STORAGE_ACCOUNT_URL ?? "",
      });
    }
  }
}

export async function createKmsProvider(): Promise<KmsKeyStore> {
  const provider = getCloudProvider();
  if (!provider) return new InMemoryKeyStore();

  switch (provider) {
    case "aws": {
      const { AwsKmsKeyStore } = await import("./kms-aws.js");
      return new AwsKmsKeyStore({
        region: process.env.AWS_REGION ?? "us-east-1",
        masterKeyId: process.env.KMS_MASTER_KEY_ID ?? "",
      });
    }
    case "gcp": {
      const { GcpKmsKeyStore } = await import("./kms-gcp.js");
      return new GcpKmsKeyStore({
        projectId: process.env.GCP_PROJECT_ID ?? "",
        locationId: process.env.GCP_KMS_LOCATION ?? "global",
        keyRingId: process.env.GCP_KMS_KEY_RING ?? "sentinel",
        keyId: process.env.GCP_KMS_KEY_ID ?? "sentinel-master",
      });
    }
    case "azure": {
      const { AzureKmsKeyStore } = await import("./kms-azure.js");
      return new AzureKmsKeyStore({
        vaultUrl: process.env.AZURE_KEY_VAULT_URL ?? "",
        keyName: process.env.AZURE_KEY_NAME ?? "sentinel-master",
      });
    }
  }
}

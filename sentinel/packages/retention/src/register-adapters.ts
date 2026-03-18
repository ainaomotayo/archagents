import { registerAdapter } from "./ports/registry.js";
import { S3Adapter } from "./adapters/s3.js";
import { GCSAdapter } from "./adapters/gcs.js";
import { AzureBlobAdapter } from "./adapters/azure-blob.js";
import { WebhookAdapter } from "./adapters/webhook.js";
import { SFTPAdapter } from "./adapters/sftp.js";

let registered = false;

export function registerAllAdapters(): void {
  if (registered) return;
  registerAdapter(new S3Adapter());
  registerAdapter(new GCSAdapter());
  registerAdapter(new AzureBlobAdapter());
  registerAdapter(new WebhookAdapter());
  registerAdapter(new SFTPAdapter());
  registered = true;
}

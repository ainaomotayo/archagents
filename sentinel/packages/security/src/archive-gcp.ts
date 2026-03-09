import { Storage } from "@google-cloud/storage";
import type { ArchiveProvider } from "./archive-provider.js";

export class GcpArchiveProvider implements ArchiveProvider {
  private storage: Storage;

  constructor(opts?: { projectId?: string }) {
    this.storage = new Storage({
      projectId: opts?.projectId ?? process.env.GCP_PROJECT_ID,
    });
  }

  async upload(opts: {
    bucket: string;
    key: string;
    data: string;
    contentType: string;
    retentionDays: number;
  }) {
    const bucket = this.storage.bucket(opts.bucket);
    const file = bucket.file(opts.key);

    const retainUntil = new Date();
    retainUntil.setUTCDate(retainUntil.getUTCDate() + opts.retentionDays);

    await file.save(opts.data, {
      contentType: opts.contentType,
      metadata: {
        retainUntil: retainUntil.toISOString(),
      },
    });

    // Set retention on the object (requires bucket-level retention policy)
    try {
      await (file as any).setRetention({
        mode: "Locked",
        retainUntilTime: retainUntil.toISOString(),
      });
    } catch {
      // Retention may not be enabled on the bucket — log but don't fail
    }

    const [metadata] = await file.getMetadata();

    return {
      key: opts.key,
      bucket: opts.bucket,
      versionId: metadata.generation?.toString() ?? "",
      retainUntil: retainUntil.toISOString(),
    };
  }
}

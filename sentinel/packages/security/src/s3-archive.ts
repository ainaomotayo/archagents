export interface ArchiveConfig {
  bucket: string;
  prefix: string;
  retentionDays: number;
}

export interface ArchiveResult {
  key: string;
  bucket: string;
  versionId: string;
  retainUntil: string;
}

/**
 * Build an S3 key for an audit archive object.
 * Format: {prefix}/{orgId}/audit/{YYYY-MM}/{eventId}.json
 */
export function buildArchiveKey(orgId: string, eventId: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${orgId}/audit/${yyyy}-${mm}/${eventId}.json`;
}

/**
 * Build S3 PutObject parameters with Object Lock compliance mode.
 */
export function buildPutObjectParams(
  config: ArchiveConfig,
  key: string,
  data: string,
): object {
  const retainUntil = new Date();
  retainUntil.setUTCDate(retainUntil.getUTCDate() + config.retentionDays);

  return {
    Bucket: config.bucket,
    Key: `${config.prefix}/${key}`,
    Body: data,
    ContentType: "application/json",
    ObjectLockMode: "COMPLIANCE",
    ObjectLockRetainUntilDate: retainUntil.toISOString(),
  };
}

/**
 * Build S3 Object Lock configuration for bucket setup.
 */
export function buildObjectLockConfig(retentionDays: number): object {
  return {
    ObjectLockEnabled: "Enabled",
    Rule: {
      DefaultRetention: {
        Mode: "COMPLIANCE",
        Days: retentionDays,
      },
    },
  };
}

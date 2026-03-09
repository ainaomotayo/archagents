export const DEFAULT_RETENTION_DAYS = 90;

export interface RetentionQuery {
  cutoffDate: Date;
  tables: string[];
}

export function buildRetentionQuery(
  retentionDays: number = DEFAULT_RETENTION_DAYS,
  now: Date = new Date(),
): RetentionQuery {
  const cutoffDate = new Date(now);
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  return {
    cutoffDate,
    tables: ["findings", "agentResults", "scans"],
  };
}

/**
 * Delete old scan data beyond the retention period.
 * Deletes in order: findings -> agentResults -> scans (respecting FK constraints).
 * Certificates and audit events are NEVER deleted (compliance requirement).
 */
export async function runRetentionCleanup(
  db: {
    finding: { deleteMany: (args: any) => Promise<{ count: number }> };
    agentResult: { deleteMany: (args: any) => Promise<{ count: number }> };
    scan: { deleteMany: (args: any) => Promise<{ count: number }> };
  },
  retentionDays: number = DEFAULT_RETENTION_DAYS,
): Promise<{ deletedFindings: number; deletedAgentResults: number; deletedScans: number }> {
  const { cutoffDate } = buildRetentionQuery(retentionDays);

  const deletedFindings = await db.finding.deleteMany({
    where: { createdAt: { lt: cutoffDate } },
  });

  const deletedAgentResults = await db.agentResult.deleteMany({
    where: { scan: { startedAt: { lt: cutoffDate } } },
  });

  const deletedScans = await db.scan.deleteMany({
    where: { startedAt: { lt: cutoffDate }, certificate: null },
  });

  return {
    deletedFindings: deletedFindings.count,
    deletedAgentResults: deletedAgentResults.count,
    deletedScans: deletedScans.count,
  };
}

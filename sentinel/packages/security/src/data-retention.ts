export const DEFAULT_RETENTION_DAYS = 90;

const CHUNK_SIZE = 1000;

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

interface ChunkableModel {
  findMany: (args: any) => Promise<{ id: string }[]>;
  deleteMany: (args: any) => Promise<{ count: number }>;
}

/**
 * Delete records in chunks to avoid long table locks.
 * SELECT ids (LIMIT 1000) -> DELETE WHERE id IN (...) -> repeat until empty.
 */
async function chunkedDelete(
  model: ChunkableModel,
  where: Record<string, unknown>,
  chunkSize: number = CHUNK_SIZE,
): Promise<number> {
  let totalDeleted = 0;
  while (true) {
    let batch: { id: string }[];
    try {
      batch = await model.findMany({ where, take: chunkSize, select: { id: true } });
    } catch {
      break; // Stop iteration on query failure; next cron run picks up remaining
    }
    if (batch.length === 0) break;
    const ids = batch.map((b) => b.id);
    try {
      const { count } = await model.deleteMany({ where: { id: { in: ids } } });
      totalDeleted += count;
    } catch {
      break; // Stop iteration on delete failure; next cron run picks up remaining
    }
    if (batch.length < chunkSize) break;
  }
  return totalDeleted;
}

/**
 * Delete old scan data beyond the retention period.
 * Deletes in order: findings -> agentResults -> scans (respecting FK constraints).
 * Certificates and audit events are NEVER deleted (compliance requirement).
 * Uses chunked deletion to avoid long table locks.
 */
export async function runRetentionCleanup(
  db: {
    finding: ChunkableModel;
    agentResult: ChunkableModel;
    scan: ChunkableModel;
  },
  retentionDays: number = DEFAULT_RETENTION_DAYS,
  orgId?: string,
): Promise<{ deletedFindings: number; deletedAgentResults: number; deletedScans: number }> {
  const { cutoffDate } = buildRetentionQuery(retentionDays);

  const orgFilter = orgId ? { scan: { project: { orgId } } } : {};
  const scanOrgFilter = orgId ? { project: { orgId } } : {};

  const deletedFindings = await chunkedDelete(
    db.finding,
    { createdAt: { lt: cutoffDate }, ...orgFilter },
  );

  const deletedAgentResults = await chunkedDelete(
    db.agentResult,
    { scan: { startedAt: { lt: cutoffDate }, ...scanOrgFilter } },
  );

  const deletedScans = await chunkedDelete(
    db.scan,
    { startedAt: { lt: cutoffDate }, certificate: null, ...scanOrgFilter },
  );

  return { deletedFindings, deletedAgentResults, deletedScans };
}

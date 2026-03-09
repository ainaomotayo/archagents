import type { EventBus } from "@sentinel/events";
import type { AuditLog } from "@sentinel/audit";
import type { SentinelDiffPayload } from "@sentinel/shared";

/** Minimal DB interface (no Prisma dependency). */
export interface ScanStore {
  create(args: {
    data: Record<string, unknown>;
  }): Promise<{ id: string; status: string; [key: string]: unknown }>;
  findUnique(args: {
    where: { id: string };
  }): Promise<Record<string, unknown> | null>;
}

interface ScanDeps {
  scanStore: ScanStore;
  eventBus: EventBus;
  auditLog: AuditLog;
}

interface SubmitScanInput {
  orgId: string;
  body: SentinelDiffPayload;
}

export function buildScanRoutes(deps: ScanDeps) {
  async function submitScan(input: SubmitScanInput) {
    const { orgId, body } = input;

    const scan = await deps.scanStore.create({
      data: {
        projectId: body.projectId,
        orgId,
        commitHash: body.commitHash,
        branch: body.branch,
        author: body.author,
        status: "pending",
        scanLevel: body.scanConfig.securityLevel,
        metadata: body,
      },
    });

    await deps.eventBus.publish("sentinel.diffs", {
      scanId: scan.id,
      payload: body,
      submittedAt: new Date().toISOString(),
    });

    await deps.auditLog.append(orgId, {
      actor: { type: "api", id: "cli", name: "SENTINEL CLI" },
      action: "scan.started",
      resource: { type: "scan", id: scan.id },
      detail: { commitHash: body.commitHash, branch: body.branch },
    });

    return { scanId: scan.id, status: scan.status, pollUrl: `/v1/scans/${scan.id}/poll` };
  }

  async function getScan(scanId: string) {
    return deps.scanStore.findUnique({ where: { id: scanId } });
  }

  return { submitScan, getScan };
}

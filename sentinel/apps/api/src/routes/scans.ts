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
  update?(args: {
    where: { id: string };
    data: Record<string, unknown>;
  }): Promise<Record<string, unknown>>;
}

/** Minimal Redis client interface for stream operations. */
export interface RedisStreamClient {
  xread(
    ...args: unknown[]
  ): Promise<Array<[string, Array<[string, string[]]>]> | null>;
  xadd(key: string, ...args: unknown[]): Promise<string>;
}

interface ScanDeps {
  scanStore: ScanStore;
  eventBus: EventBus;
  auditLog: AuditLog;
  redis?: RedisStreamClient;
}

interface SubmitScanInput {
  orgId: string;
  body: SentinelDiffPayload;
}

/** SSE stream event from Redis. */
export interface ScanStreamEvent {
  id: string;
  event: string;
  data: string;
}

const SSE_STREAM_PREFIX = "sentinel.sse";

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

  /**
   * Read SSE events from the Redis Stream for a scan.
   * Supports Last-Event-ID for reconnection.
   */
  async function* streamScanEvents(
    scanId: string,
    lastEventId?: string,
  ): AsyncGenerator<ScanStreamEvent> {
    if (!deps.redis) return;

    const key = `${SSE_STREAM_PREFIX}:${scanId}`;
    let cursor = lastEventId ?? "0-0";

    // Read existing events first (catch-up), then poll for new ones
    const maxIterations = 300; // ~5 minutes at 1s poll
    for (let i = 0; i < maxIterations; i++) {
      const entries = await deps.redis.xread(
        "COUNT", 100, "BLOCK", 1000, "STREAMS", key, cursor,
      );

      if (entries) {
        for (const [, messages] of entries) {
          for (const [msgId, fields] of messages) {
            const id = typeof msgId === "object" ? String(msgId) : msgId;
            // fields is [key, value, key, value, ...] array from ioredis
            const fieldMap: Record<string, string> = {};
            for (let j = 0; j < fields.length; j += 2) {
              fieldMap[String(fields[j])] = String(fields[j + 1]);
            }

            yield {
              id,
              event: fieldMap.event_type ?? "message",
              data: fieldMap.data ?? "{}",
            };
            cursor = id;

            // If we received a scan.completed event, stop streaming
            if (fieldMap.event_type === "scan.completed") {
              return;
            }
          }
        }
      }
    }
  }

  /**
   * Get current scan progress (poll fallback).
   */
  async function getScanProgress(scanId: string) {
    const scan = await deps.scanStore.findUnique({ where: { id: scanId } });
    if (!scan) return null;

    return {
      scanId,
      status: scan.status ?? "unknown",
      progress: scan.progress ?? 0,
      agentsCompleted: scan.agentsCompleted ?? 0,
      agentsTotal: scan.agentsTotal ?? 0,
      updatedAt: scan.updatedAt ?? new Date().toISOString(),
    };
  }

  /**
   * Cancel an active scan.
   */
  async function cancelScan(scanId: string, orgId: string) {
    const scan = await deps.scanStore.findUnique({ where: { id: scanId } });
    if (!scan) return null;

    if (scan.status === "completed" || scan.status === "cancelled") {
      return { scanId, status: scan.status, message: "Scan already finished" };
    }

    // Update scan status
    if (deps.scanStore.update) {
      await deps.scanStore.update({
        where: { id: scanId },
        data: { status: "cancelled", cancelledAt: new Date().toISOString() },
      });
    }

    // Publish cancel signal to Redis Stream
    if (deps.redis) {
      const key = `${SSE_STREAM_PREFIX}:${scanId}`;
      await deps.redis.xadd(
        key, "*",
        "event_type", "scan.cancelled",
        "data", JSON.stringify({ scanId, cancelledAt: new Date().toISOString() }),
      );
    }

    // Publish cancel event to event bus
    await deps.eventBus.publish("sentinel.scan.cancel", {
      scanId,
      cancelledAt: new Date().toISOString(),
    });

    await deps.auditLog.append(orgId, {
      actor: { type: "api", id: "user", name: "user" },
      action: "scan.cancelled",
      resource: { type: "scan", id: scanId },
      detail: {},
    });

    return { scanId, status: "cancelled", message: "Scan cancellation requested" };
  }

  return { submitScan, getScan, streamScanEvents, getScanProgress, cancelScan };
}

import type { ArchivePort, ArchivePayload, ArchiveConfig, ArchiveResult } from "../ports/archive-port.js";

const BATCH_SIZE = 1000;

export class WebhookAdapter implements ArchivePort {
  readonly type = "webhook";

  async testConnection(
    config: ArchiveConfig,
    fetchFn: typeof globalThis.fetch = globalThis.fetch,
  ): Promise<{ ok: boolean; error?: string }> {
    const { url, authHeader, authValue } = config.config as { url: string; authHeader?: string; authValue?: string };
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authHeader && authValue) headers[authHeader] = authValue;
      const res = await fetchFn(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ type: "sentinel.archive.test", timestamp: new Date().toISOString() }),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async archive(
    payload: ArchivePayload,
    config: ArchiveConfig,
    fetchFn: typeof globalThis.fetch = globalThis.fetch,
  ): Promise<ArchiveResult> {
    const { url, authHeader, authValue } = config.config as { url: string; authHeader?: string; authValue?: string };
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authHeader && authValue) headers[authHeader] = authValue;

    let sent = 0;
    for (let i = 0; i < payload.records.length; i += BATCH_SIZE) {
      const batch = payload.records.slice(i, i + BATCH_SIZE);
      const body = JSON.stringify({
        type: "sentinel.archive.data",
        orgId: payload.orgId,
        executionId: payload.executionId,
        dataType: payload.dataType,
        metadata: payload.metadata,
        records: batch,
      });
      const res = await fetchFn(url, { method: "POST", headers, body });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { success: false, recordCount: sent, destination: url, error: `HTTP ${res.status}: ${text}` };
      }
      sent += batch.length;
    }
    return { success: true, recordCount: sent, destination: url };
  }
}

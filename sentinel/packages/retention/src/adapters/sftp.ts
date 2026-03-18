import SFTPClient from "ssh2-sftp-client";
import type { ArchivePort, ArchivePayload, ArchiveConfig, ArchiveResult } from "../ports/archive-port.js";

export class SFTPAdapter implements ArchivePort {
  readonly type = "sftp";

  private getConnectConfig(config: ArchiveConfig) {
    const { host, port } = config.config as { host: string; port?: number };
    const cred = config.credential as { username: string; password?: string; privateKey?: string } | undefined;
    return {
      host,
      port: port ?? 22,
      username: cred?.username ?? "sentinel",
      ...(cred?.password ? { password: cred.password } : {}),
      ...(cred?.privateKey ? { privateKey: cred.privateKey } : {}),
    };
  }

  private buildRemotePath(payload: ArchivePayload, config: ArchiveConfig): string {
    const { remotePath } = config.config as { remotePath: string };
    const date = new Date().toISOString().split("T")[0];
    return `${remotePath}/${payload.orgId}/${payload.dataType}/${date}.jsonl`;
  }

  async testConnection(config: ArchiveConfig): Promise<{ ok: boolean; error?: string }> {
    const sftp = new SFTPClient();
    try {
      await sftp.connect(this.getConnectConfig(config));
      const { remotePath } = config.config as { remotePath: string };
      await sftp.stat(remotePath);
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      await sftp.end().catch(() => {});
    }
  }

  async archive(payload: ArchivePayload, config: ArchiveConfig): Promise<ArchiveResult> {
    const sftp = new SFTPClient();
    const remotePath = this.buildRemotePath(payload, config);
    try {
      await sftp.connect(this.getConnectConfig(config));
      const dir = remotePath.substring(0, remotePath.lastIndexOf("/"));
      try { await sftp.mkdir(dir, true); } catch { /* may already exist */ }
      const body = payload.records.map((r) => JSON.stringify(r)).join("\n");
      await sftp.put(Buffer.from(body, "utf-8"), remotePath);
      return { success: true, recordCount: payload.records.length, destination: `sftp://${(config.config as any).host}${remotePath}` };
    } catch (err: unknown) {
      return { success: false, recordCount: 0, destination: "", error: err instanceof Error ? err.message : String(err) };
    } finally {
      await sftp.end().catch(() => {});
    }
  }
}

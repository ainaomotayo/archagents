import type { AttestationSnapshot } from "./attestation-types";

interface AutoSnapshotCardProps {
  snapshot: AttestationSnapshot | null;
}

export function AutoSnapshotCard({ snapshot }: AutoSnapshotCardProps) {
  if (!snapshot) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface-1 p-4">
        <p className="text-[12px] text-text-tertiary text-center">
          Select a framework and control to capture a snapshot
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface-1 p-4 space-y-2">
      <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
        Auto-Snapshot Preview
      </p>
      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <div>
          <span className="text-text-tertiary">Control Score: </span>
          <span className="font-semibold text-text-primary">
            {Math.round(snapshot.controlScore * 100)}%
          </span>
        </div>
        <div>
          <span className="text-text-tertiary">Framework Score: </span>
          <span className="font-semibold text-text-primary">
            {Math.round(snapshot.frameworkScore * 100)}%
          </span>
        </div>
        <div>
          <span className="text-text-tertiary">Passing: </span>
          <span className="font-semibold text-status-pass">{snapshot.passing}</span>
        </div>
        <div>
          <span className="text-text-tertiary">Failing: </span>
          <span className="font-semibold text-status-fail">{snapshot.failing}</span>
        </div>
        {snapshot.certificateId && (
          <>
            <div>
              <span className="text-text-tertiary">Certificate: </span>
              <span className="font-mono text-[11px] text-text-primary">
                #{snapshot.certificateId.slice(0, 4)}
              </span>
            </div>
            <div>
              <span className="text-text-tertiary">Status: </span>
              <span className="text-text-primary">{snapshot.certificateStatus}</span>
            </div>
          </>
        )}
      </div>
      <p className="text-[10px] text-text-tertiary">
        Captured: {new Date(snapshot.capturedAt).toLocaleString()}
      </p>
    </div>
  );
}

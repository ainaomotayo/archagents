"use client";

import { useRouter } from "next/navigation";
import type { Attestation } from "./attestation-types";
import { statusLabel } from "./attestation-types";
import { AttestationStatusBadge } from "./AttestationStatusBadge";
import { ApprovalPipelineIndicator } from "./ApprovalPipelineIndicator";
import { ApprovalActionPanel } from "./ApprovalActionPanel";
import { AutoSnapshotCard } from "./AutoSnapshotCard";
import { AttestationAuditTrail } from "./AttestationAuditTrail";
import {
  submitForReview,
  reviewAttestation,
  finalApproveAttestation,
} from "@/app/(dashboard)/compliance/attestations/[id]/actions";

interface AttestationDetailClientProps {
  attestation: Attestation;
  auditEvents: { id: string; timestamp: string; action: string; actor: string; resource: string; details: string }[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AttestationDetailClient({
  attestation,
  auditEvents,
}: AttestationDetailClientProps) {
  const router = useRouter();
  const a = attestation;

  // In a real app, these come from the session
  const currentUser = "admin@acme.com";
  const currentRole = "admin";

  const handleSubmitForReview = async () => {
    await submitForReview(a.id);
    router.refresh();
  };

  const handleReview = async (decision: string, comment?: string) => {
    await reviewAttestation(a.id, decision, comment);
    router.refresh();
  };

  const handleFinalApprove = async (decision: string, comment?: string) => {
    await finalApproveAttestation(a.id, decision, comment);
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => router.push("/compliance/attestations")}
            className="text-[12px] text-text-tertiary hover:text-accent transition-colors"
          >
            &larr; Attestations
          </button>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-text-primary">
              {a.controlCode} -- {a.title}
            </h1>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-tertiary">
              v{a.version}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-text-tertiary">
            Created by {a.createdBy} on {formatDate(a.createdAt)}
          </p>
        </div>
        {a.status === "draft" && (
          <button
            onClick={handleSubmitForReview}
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-text-inverse hover:brightness-110 transition-all"
          >
            Submit for Review
          </button>
        )}
      </div>

      {/* Main content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Left column */}
        <div className="col-span-2 space-y-5">
          {/* Status card */}
          <div className="rounded-xl border border-border bg-surface-1 p-5">
            <div className="flex items-center gap-3 mb-3">
              <AttestationStatusBadge status={a.status} />
              <span className="text-[12px] text-text-tertiary">
                {a.type === "manual" ? "Manual Control" : "Scan Approval"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-[12px]">
              <div>
                <span className="text-text-tertiary">Score</span>
                <p className="mt-0.5 text-lg font-bold text-text-primary">
                  {Math.round(a.score * 100)}%
                </p>
              </div>
              <div>
                <span className="text-text-tertiary">Framework</span>
                <p className="mt-0.5 font-semibold text-text-primary">
                  {a.frameworkSlug.toUpperCase()}
                </p>
              </div>
              <div>
                <span className="text-text-tertiary">Expires</span>
                <p className="mt-0.5 font-semibold text-text-primary">
                  {formatDate(a.expiresAt)}
                </p>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="rounded-xl border border-border bg-surface-1 p-5">
            <p className="text-[12px] font-semibold text-text-secondary mb-2">
              Description
            </p>
            <p className="text-[13px] text-text-primary whitespace-pre-wrap">
              {a.description}
            </p>
          </div>

          {/* Evidence */}
          <div className="rounded-xl border border-border bg-surface-1 p-5">
            <p className="text-[12px] font-semibold text-text-secondary mb-2">
              Evidence ({a.evidence.length} items)
            </p>
            <div className="space-y-2">
              {a.evidence.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12px]"
                >
                  <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium text-text-tertiary uppercase">
                    {ev.type}
                  </span>
                  <span className="text-text-primary">{ev.title}</span>
                  {ev.url && (
                    <a
                      href={ev.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:brightness-110 text-[11px]"
                    >
                      Open
                    </a>
                  )}
                  {ev.refId && (
                    <span className="text-text-tertiary text-[11px]">{ev.refId}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Snapshot */}
          <AutoSnapshotCard snapshot={a.snapshot} />

          {/* Audit trail */}
          <AttestationAuditTrail events={auditEvents} />
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Pipeline */}
          <div className="rounded-xl border border-border bg-surface-1 p-4">
            <p className="text-[12px] font-semibold text-text-secondary mb-3">
              Approval Pipeline
            </p>
            <ApprovalPipelineIndicator approvals={a.approvals} />
            <div className="mt-3 space-y-2">
              {a.approvals.map((appr) => (
                <div key={appr.id} className="text-[11px]">
                  <div className="flex justify-between">
                    <span className="font-medium text-text-primary capitalize">
                      {appr.stage.replace("_", " ")}
                    </span>
                    <span className="text-text-tertiary capitalize">
                      {appr.decision.replace("_", " ")}
                    </span>
                  </div>
                  {appr.decidedBy && (
                    <p className="text-text-tertiary">
                      {appr.decidedBy} -- {appr.decidedAt ? formatDate(appr.decidedAt) : ""}
                    </p>
                  )}
                  {appr.comment && (
                    <p className="mt-0.5 text-text-secondary italic">
                      &quot;{appr.comment}&quot;
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Action panel */}
          <ApprovalActionPanel
            attestation={a}
            currentUser={currentUser}
            currentRole={currentRole}
            onReview={handleReview}
            onFinalApprove={handleFinalApprove}
          />
        </div>
      </div>
    </div>
  );
}

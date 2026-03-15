"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { FrameworkScore } from "./types";
import type {
  AttestationType,
  AttestationSnapshot,
  CreateAttestationInput,
} from "./attestation-types";
import { defaultTTLDays, buildSnapshot } from "./attestation-types";
import type { Certificate } from "@/lib/types";
import { AttestationTypeSelector } from "./AttestationTypeSelector";
import { FrameworkControlPicker } from "./FrameworkControlPicker";
import { EvidenceReferenceList } from "./EvidenceReferenceList";
import type { EvidenceItem } from "./EvidenceReferenceList";
import { AutoSnapshotCard } from "./AutoSnapshotCard";
import { createAttestation } from "@/app/(dashboard)/compliance/attestations/[id]/actions";

interface AttestationFormClientProps {
  frameworks: FrameworkScore[];
  certificates: Certificate[];
}

export function AttestationFormClient({
  frameworks,
  certificates,
}: AttestationFormClientProps) {
  const router = useRouter();

  const [type, setType] = useState<AttestationType>("manual");
  const [frameworkSlug, setFrameworkSlug] = useState("");
  const [controlCode, setControlCode] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [score, setScore] = useState("0.90");
  const [expiresAt, setExpiresAt] = useState("");
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [snapshot, setSnapshot] = useState<AttestationSnapshot | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleFrameworkChange = useCallback(
    (slug: string) => {
      setFrameworkSlug(slug);
      setControlCode("");
      setSnapshot(null);
      if (slug) {
        const ttl = defaultTTLDays(slug);
        const date = new Date();
        date.setDate(date.getDate() + ttl);
        setExpiresAt(date.toISOString().split("T")[0]);
      }
    },
    [],
  );

  const handleControlChange = useCallback(
    (code: string) => {
      setControlCode(code);
      if (frameworkSlug && code) {
        const cert = certificates.find((c) => c.status === "active") ?? null;
        const snap = buildSnapshot(
          frameworks,
          frameworkSlug,
          code,
          cert ? { id: cert.id, status: cert.status, riskScore: cert.riskScore } : null,
        );
        setSnapshot(snap);
        if (snap) {
          const snapshotEvidence: EvidenceItem = {
            type: "snapshot",
            title: `Auto-Snapshot at ${snap.capturedAt}`,
            refId: null,
            url: null,
            source: "internal",
            metadata: {},
          };
          setEvidence((prev) => {
            const withoutSnap = prev.filter((e) => e.type !== "snapshot");
            return [...withoutSnap, snapshotEvidence];
          });
        }
      } else {
        setSnapshot(null);
      }
    },
    [frameworkSlug, frameworks, certificates],
  );

  const handleSubmit = async (asDraft: boolean) => {
    if (!frameworkSlug || !controlCode || !title.trim() || !snapshot) return;
    setSubmitting(true);
    try {
      const data: CreateAttestationInput = {
        type,
        frameworkSlug,
        controlCode,
        title: title.trim(),
        description: description.trim(),
        score: parseFloat(score),
        expiresAt: new Date(expiresAt).toISOString(),
        snapshot,
        evidence: evidence.map((e) => ({
          type: e.type,
          title: e.title,
          refId: e.refId,
          url: e.url,
          source: e.source,
          metadata: e.metadata,
        })),
      };
      const result = await createAttestation(data);
      if (!asDraft && result?.id) {
        router.push(`/compliance/attestations/${result.id}`);
      } else {
        router.push("/compliance/attestations");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = frameworkSlug && controlCode && title.trim() && snapshot;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.push("/compliance/attestations")}
            className="text-[12px] text-text-tertiary hover:text-accent transition-colors"
          >
            &larr; Attestations
          </button>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-text-primary">
            New Attestation
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={!isValid || submitting}
            className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 transition-colors disabled:opacity-50"
          >
            Save Draft
          </button>
          <button
            type="button"
            onClick={() => handleSubmit(false)}
            disabled={!isValid || submitting}
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-text-inverse hover:brightness-110 transition-all disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Submit for Review"}
          </button>
        </div>
      </div>

      <AttestationTypeSelector value={type} onChange={setType} />

      <FrameworkControlPicker
        frameworks={frameworks}
        frameworkSlug={frameworkSlug}
        controlCode={controlCode}
        onFrameworkChange={handleFrameworkChange}
        onControlChange={handleControlChange}
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[12px] font-semibold text-text-secondary">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Attestation title..."
            className="mt-1 w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary focus-ring"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[12px] font-semibold text-text-secondary">
              Score (0.0-1.0)
            </label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-[13px] text-text-primary focus-ring"
            />
          </div>
          <div>
            <label className="text-[12px] font-semibold text-text-secondary">
              Expires
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-[13px] text-text-primary focus-ring"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="text-[12px] font-semibold text-text-secondary">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Describe the attestation rationale..."
          className="mt-1 w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary focus-ring resize-none"
        />
      </div>

      <EvidenceReferenceList evidence={evidence} onChange={setEvidence} />

      <AutoSnapshotCard snapshot={snapshot} />
    </div>
  );
}

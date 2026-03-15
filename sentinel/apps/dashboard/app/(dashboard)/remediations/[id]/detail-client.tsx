"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { RemediationItem, EvidenceAttachment } from "@/lib/types";
import { RemediationDetailPanel } from "@/components/remediations/remediation-detail-panel";
import {
  updateRemediationAction,
  linkExternalAction,
} from "@/app/(dashboard)/remediations/actions";

interface RemediationDetailClientProps {
  item: RemediationItem;
  initialEvidence?: EvidenceAttachment[];
}

export function RemediationDetailClient({ item: initialItem, initialEvidence = [] }: RemediationDetailClientProps) {
  const [item, setItem] = useState(initialItem);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleStatusChange = useCallback(
    async (id: string, status: string) => {
      setIsSubmitting(true);

      // Optimistic update
      setItem((prev) => ({
        ...prev,
        status,
        updatedAt: new Date().toISOString(),
        completedAt: status === "completed" ? new Date().toISOString() : prev.completedAt,
      }));

      try {
        await updateRemediationAction(id, { status });
        router.refresh();
      } catch {
        setItem(initialItem);
      } finally {
        setIsSubmitting(false);
      }
    },
    [initialItem, router],
  );

  const handleAssign = useCallback(
    async (id: string, assignedTo: string) => {
      setItem((prev) => ({ ...prev, assignedTo }));
      try {
        await updateRemediationAction(id, { assignedTo });
        router.refresh();
      } catch {
        setItem(initialItem);
      }
    },
    [initialItem, router],
  );

  const handleLinkExternal = useCallback(
    async (id: string, provider: string, externalRef: string) => {
      const fullRef = `${provider}:${externalRef}`;
      setItem((prev) => ({ ...prev, externalRef: fullRef }));
      try {
        await linkExternalAction(id, provider, externalRef);
        router.refresh();
      } catch {
        setItem(initialItem);
      }
    },
    [initialItem, router],
  );

  const handleDownloadEvidence = useCallback(
    async (evidenceId: string): Promise<string | null> => {
      try {
        const { getEvidenceDownloadUrl } = await import("@/lib/api");
        const result = await getEvidenceDownloadUrl(initialItem.id, evidenceId);
        return result.url;
      } catch {
        return null;
      }
    },
    [initialItem.id],
  );

  return (
    <RemediationDetailPanel
      item={item}
      onStatusChange={handleStatusChange}
      onAssign={handleAssign}
      onLinkExternal={handleLinkExternal}
      onDownloadEvidence={handleDownloadEvidence}
      isSubmitting={isSubmitting}
      initialEvidence={initialEvidence}
    />
  );
}

"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { RemediationItem } from "@/lib/types";
import { RemediationDetailPanel } from "@/components/remediations/remediation-detail-panel";
import {
  updateRemediationAction,
  linkExternalAction,
} from "@/app/(dashboard)/remediations/actions";

interface RemediationDetailClientProps {
  item: RemediationItem;
}

export function RemediationDetailClient({ item: initialItem }: RemediationDetailClientProps) {
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

  return (
    <RemediationDetailPanel
      item={item}
      onStatusChange={handleStatusChange}
      onAssign={handleAssign}
      onLinkExternal={handleLinkExternal}
      isSubmitting={isSubmitting}
    />
  );
}

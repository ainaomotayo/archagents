"use server";

import { revalidatePath } from "next/cache";

export async function createRemediation(data: {
  title: string;
  description: string;
  priority?: string;
  frameworkSlug?: string;
  controlCode?: string;
  assignedTo?: string;
  dueDate?: string;
  itemType?: string;
  parentId?: string;
  findingId?: string;
}) {
  const { createRemediationItem } = await import("@/lib/api");
  const result = await createRemediationItem(data);
  revalidatePath("/remediations");
  return result;
}

export async function updateRemediationAction(
  id: string,
  data: {
    status?: string;
    priority?: string;
    assignedTo?: string;
    evidenceNotes?: string;
  },
) {
  const { updateRemediation } = await import("@/lib/api");
  try {
    const result = await updateRemediation(id, data);
    revalidatePath("/remediations");
    revalidatePath(`/remediations/${id}`);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("404")) {
      throw new Error("This remediation item no longer exists.");
    }
    if (msg.includes("409")) {
      throw new Error("Invalid status transition.");
    }
    throw err;
  }
}

export async function uploadEvidenceAction(
  remediationId: string,
  fileName: string,
  fileSize: number,
  mimeType: string,
) {
  const { requestEvidenceUpload } = await import("@/lib/api");
  return requestEvidenceUpload(remediationId, fileName, fileSize, mimeType);
}

export async function confirmEvidenceAction(
  remediationId: string,
  s3Key: string,
  fileName: string,
  fileSize: number,
  mimeType: string,
) {
  const { confirmEvidenceUpload } = await import("@/lib/api");
  const result = await confirmEvidenceUpload(remediationId, s3Key, fileName, fileSize, mimeType);
  revalidatePath(`/remediations/${remediationId}`);
  return result;
}

export async function deleteEvidenceAction(
  remediationId: string,
  evidenceId: string,
) {
  const { deleteEvidence } = await import("@/lib/api");
  await deleteEvidence(remediationId, evidenceId);
  revalidatePath(`/remediations/${remediationId}`);
}

export async function triggerAutoFixAction(remediationId: string) {
  const { triggerAutoFix } = await import("@/lib/api");
  try {
    const result = await triggerAutoFix(remediationId);
    revalidatePath(`/remediations/${remediationId}`);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("409")) {
      throw new Error("An auto-fix is already in progress for this item.");
    }
    if (msg.includes("404")) {
      throw new Error("This remediation item or its linked finding could not be found.");
    }
    throw err;
  }
}

export async function linkExternalAction(
  id: string,
  provider: string,
  externalRef: string,
) {
  const { linkRemediationExternal } = await import("@/lib/api");
  try {
    const result = await linkRemediationExternal(id, provider, externalRef);
    revalidatePath("/remediations");
    revalidatePath(`/remediations/${id}`);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("409")) {
      throw new Error("This item is already linked to an external issue.");
    }
    throw err;
  }
}

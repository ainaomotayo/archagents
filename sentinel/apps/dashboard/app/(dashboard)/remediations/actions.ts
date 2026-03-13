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

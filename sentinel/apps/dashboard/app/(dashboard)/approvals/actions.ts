"use server";

import { revalidatePath } from "next/cache";

export async function submitDecision(
  gateId: string,
  decision: "approve" | "reject",
  justification: string,
) {
  const { apiPost } = await import("@/lib/api-client");
  await apiPost(`/v1/approvals/${gateId}/decide`, { decision, justification });
  revalidatePath("/approvals");
  revalidatePath(`/approvals/${gateId}`);
}

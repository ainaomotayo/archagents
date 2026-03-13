"use server";

import { revalidatePath } from "next/cache";

export async function submitDecision(
  gateId: string,
  decision: "approve" | "reject",
  justification: string,
) {
  const { apiPost } = await import("@/lib/api-client");
  try {
    await apiPost(`/v1/approvals/${gateId}/decide`, { decision, justification });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("403")) {
      throw new Error("You do not have permission to decide on this gate.");
    }
    if (msg.includes("409")) {
      throw new Error("This gate has already been decided. Refresh to see the latest state.");
    }
    throw err;
  }
  revalidatePath("/approvals");
  revalidatePath(`/approvals/${gateId}`);
}

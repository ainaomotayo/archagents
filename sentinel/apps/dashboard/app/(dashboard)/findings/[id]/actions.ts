"use server";

import { revalidatePath } from "next/cache";

export async function suppressFinding(findingId: string) {
  const { apiPatch } = await import("@/lib/api-client");
  const result = await apiPatch(`/v1/findings/${findingId}`, {
    suppressed: true,
    suppressedBy: "dashboard-user",
  });
  revalidatePath(`/findings/${findingId}`);
  revalidatePath("/findings");
  return result;
}

export async function resolveFinding(findingId: string) {
  const { apiPatch } = await import("@/lib/api-client");
  const result = await apiPatch(`/v1/findings/${findingId}`, {
    suppressed: true,
    suppressedBy: "dashboard-user-resolved",
    status: "resolved",
  });
  revalidatePath(`/findings/${findingId}`);
  revalidatePath("/findings");
  return result;
}

export async function unsuppressFinding(findingId: string) {
  const { apiPatch } = await import("@/lib/api-client");
  const result = await apiPatch(`/v1/findings/${findingId}`, {
    suppressed: false,
  });
  revalidatePath(`/findings/${findingId}`);
  revalidatePath("/findings");
  return result;
}

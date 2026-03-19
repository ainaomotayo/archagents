"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

async function getActorId(): Promise<string> {
  try {
    const session = await getServerSession(authOptions);
    return session?.user?.email ?? session?.user?.name ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function suppressFinding(findingId: string) {
  const { apiPatch } = await import("@/lib/api-client");
  const actor = await getActorId();
  const result = await apiPatch(`/v1/findings/${findingId}`, {
    suppressed: true,
    suppressedBy: actor,
  });
  revalidatePath(`/findings/${findingId}`);
  revalidatePath("/findings");
  return result;
}

export async function resolveFinding(findingId: string) {
  const { apiPatch } = await import("@/lib/api-client");
  const actor = await getActorId();
  const result = await apiPatch(`/v1/findings/${findingId}`, {
    suppressed: true,
    suppressedBy: actor,
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

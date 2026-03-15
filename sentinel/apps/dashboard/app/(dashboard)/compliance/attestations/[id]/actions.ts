"use server";

import { revalidatePath } from "next/cache";
import type { CreateAttestationInput } from "@/components/compliance/attestation-types";

export async function createAttestation(data: CreateAttestationInput) {
  const { apiPost } = await import("@/lib/api-client");
  const result = await apiPost<{ id: string }>("/v1/attestations", data);
  revalidatePath("/compliance/attestations");
  return result;
}

export async function submitForReview(id: string) {
  const { apiPatch } = await import("@/lib/api-client");
  const result = await apiPatch(`/v1/attestations/${id}/submit`, {});
  revalidatePath(`/compliance/attestations/${id}`);
  revalidatePath("/compliance/attestations");
  return result;
}

export async function reviewAttestation(
  id: string,
  decision: string,
  comment?: string,
) {
  const { apiPost } = await import("@/lib/api-client");
  const result = await apiPost(`/v1/attestations/${id}/review`, {
    decision,
    comment,
  });
  revalidatePath(`/compliance/attestations/${id}`);
  revalidatePath("/compliance/attestations");
  return result;
}

export async function finalApproveAttestation(
  id: string,
  decision: string,
  comment?: string,
) {
  const { apiPost } = await import("@/lib/api-client");
  const result = await apiPost(`/v1/attestations/${id}/approve`, {
    decision,
    comment,
  });
  revalidatePath(`/compliance/attestations/${id}`);
  revalidatePath("/compliance/attestations");
  revalidatePath("/compliance/gap-analysis");
  return result;
}

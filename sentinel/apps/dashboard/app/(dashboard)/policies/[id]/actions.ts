"use server";

import { revalidatePath } from "next/cache";

export async function updatePolicy(id: string, data: { name: string; rules: unknown }) {
  const { apiPut } = await import("@/lib/api-client");
  const result = await apiPut(`/v1/policies/${id}`, data);
  revalidatePath(`/policies/${id}`);
  revalidatePath("/policies");
  return result;
}

export async function createPolicy(data: { name: string; rules: unknown }) {
  const { apiPost } = await import("@/lib/api-client");
  const result = await apiPost<{ id: string }>("/v1/policies", data);
  revalidatePath("/policies");
  return result;
}

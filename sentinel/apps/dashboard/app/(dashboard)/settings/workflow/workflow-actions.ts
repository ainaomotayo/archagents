"use server";

import { revalidatePath } from "next/cache";

export async function saveWorkflowConfigAction(skipStages: string[]) {
  const { updateWorkflowConfig } = await import("@/lib/api");
  await updateWorkflowConfig(skipStages);
  revalidatePath("/settings/workflow");
}

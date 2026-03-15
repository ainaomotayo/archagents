"use server";

import { revalidatePath } from "next/cache";
import type { AIMetricsConfig } from "@/lib/types";

export async function updateAIMetricsConfigAction(data: Partial<AIMetricsConfig>) {
  const { updateAIMetricsConfig } = await import("@/lib/api");
  const result = await updateAIMetricsConfig(data);
  revalidatePath("/ai-metrics");
  return result;
}

export async function fetchAIMetricsCompareAction(projectIds: string[], days: number) {
  const { getAIMetricsCompare } = await import("@/lib/api");
  return getAIMetricsCompare(projectIds, days);
}

export async function fetchAIMetricsTrendAction(days: number, projectId?: string) {
  const { getAIMetricsTrend } = await import("@/lib/api");
  return getAIMetricsTrend(days, projectId);
}

"use server";

import type {
  BurndownDataPoint,
  VelocityDataPoint,
  AgingDataPoint,
  SlaDataPoint,
} from "@/lib/types";

export async function refreshBurndown(
  scope: string,
  scopeValue: string,
  days: number,
): Promise<BurndownDataPoint[]> {
  const { getBurndownData } = await import("@/lib/api");
  return getBurndownData(scope || undefined, scopeValue || undefined, days);
}

export async function refreshVelocity(
  scope: string,
  scopeValue: string,
  days: number,
): Promise<VelocityDataPoint[]> {
  const { getVelocityData } = await import("@/lib/api");
  return getVelocityData(scope || undefined, scopeValue || undefined, days);
}

export async function refreshAging(
  scope: string,
  scopeValue: string,
): Promise<AgingDataPoint[]> {
  const { getAgingData } = await import("@/lib/api");
  return getAgingData(scope || undefined, scopeValue || undefined);
}

export async function refreshSla(
  scope: string,
  scopeValue: string,
  days: number,
): Promise<SlaDataPoint[]> {
  const { getSlaData } = await import("@/lib/api");
  return getSlaData(scope || undefined, scopeValue || undefined, days);
}

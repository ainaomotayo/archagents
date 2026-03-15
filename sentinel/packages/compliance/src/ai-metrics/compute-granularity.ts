export function selectGranularity(
  days: number,
): "daily" | "weekly" | "monthly" {
  if (days <= 90) return "daily";
  if (days <= 365) return "weekly";
  return "monthly";
}

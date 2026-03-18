export interface TierValues {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface RetentionPreset {
  name: string;
  label: string;
  description: string;
  tiers: TierValues;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const MIN_DAYS = 7;
const MAX_DAYS = 2555;

export const RETENTION_PRESETS: RetentionPreset[] = [
  {
    name: "minimal",
    label: "Minimal",
    description: "Short retention for non-regulated environments",
    tiers: { critical: 90, high: 60, medium: 30, low: 14 },
  },
  {
    name: "standard",
    label: "Standard",
    description: "Balanced retention for most organizations",
    tiers: { critical: 365, high: 180, medium: 90, low: 30 },
  },
  {
    name: "compliance",
    label: "Compliance",
    description: "Extended retention for regulated industries",
    tiers: { critical: 730, high: 365, medium: 180, low: 90 },
  },
];

export function validateTierValues(tiers: TierValues): ValidationResult {
  const errors: string[] = [];
  const keys: (keyof TierValues)[] = ["critical", "high", "medium", "low"];

  for (const key of keys) {
    const val = tiers[key];
    if (!Number.isInteger(val) || val < MIN_DAYS) {
      errors.push(`${key} must be at least ${MIN_DAYS} days`);
    }
    if (val > MAX_DAYS) {
      errors.push(`${key} must be at most ${MAX_DAYS} days`);
    }
  }

  if (tiers.critical < tiers.high) errors.push("critical must be >= high");
  if (tiers.high < tiers.medium) errors.push("high must be >= medium");
  if (tiers.medium < tiers.low) errors.push("medium must be >= low");

  return { valid: errors.length === 0, errors };
}

export function getPresetByName(name: string): RetentionPreset | undefined {
  return RETENTION_PRESETS.find((p) => p.name === name);
}

export function detectPreset(tiers: TierValues): string {
  for (const preset of RETENTION_PRESETS) {
    if (
      preset.tiers.critical === tiers.critical &&
      preset.tiers.high === tiers.high &&
      preset.tiers.medium === tiers.medium &&
      preset.tiers.low === tiers.low
    ) {
      return preset.name;
    }
  }
  return "custom";
}

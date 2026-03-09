/**
 * Self-scanning configuration for SENTINEL dogfooding.
 * SENTINEL scans its own codebase using its policy engine.
 */

export interface SelfScanConfig {
  schedule: string;
  targets: string[];
  policyPath: string;
  notifyOnFailure: boolean;
  cveRescanEnabled: boolean;
  cveRescanSchedule: string;
}

export const SELF_SCAN_CONFIG: SelfScanConfig = {
  schedule: "0 2 * * *",
  targets: ["packages/**/*.ts", "apps/**/*.ts", "agents/**/*.py"],
  policyPath: ".sentinel/policies.yaml",
  notifyOnFailure: true,
  cveRescanEnabled: true,
  cveRescanSchedule: "0 3 * * *",
};

const VALID_SEVERITIES = ["critical", "high", "medium", "low"] as const;
const VALID_RULE_TYPES = [
  "deny-import",
  "deny-pattern",
  "require-pattern",
] as const;

/**
 * Validate a self-scan configuration object.
 */
export function validateSelfScanConfig(config: SelfScanConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.schedule || !isValidCron(config.schedule)) {
    errors.push("Invalid or missing schedule cron expression");
  }

  if (!config.targets || config.targets.length === 0) {
    errors.push("At least one scan target is required");
  }

  if (!config.policyPath || config.policyPath.trim().length === 0) {
    errors.push("Policy path must be specified");
  }

  if (config.cveRescanEnabled) {
    if (!config.cveRescanSchedule || !isValidCron(config.cveRescanSchedule)) {
      errors.push(
        "CVE rescan schedule is required and must be valid when cveRescanEnabled is true",
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Basic cron expression validator. Checks for 5-field format with valid ranges.
 */
function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    return false;
  }

  const ranges = [
    { min: 0, max: 59 }, // minute
    { min: 0, max: 23 }, // hour
    { min: 1, max: 31 }, // day of month
    { min: 1, max: 12 }, // month
    { min: 0, max: 7 }, // day of week (0 and 7 are Sunday)
  ];

  for (let i = 0; i < 5; i++) {
    const part = parts[i];
    if (part === "*") continue;

    // Handle */step notation
    if (part.startsWith("*/")) {
      const step = parseInt(part.slice(2), 10);
      if (isNaN(step) || step < 1) return false;
      continue;
    }

    // Handle range notation (e.g., 1-5)
    if (part.includes("-")) {
      const [low, high] = part.split("-").map((s) => parseInt(s, 10));
      if (isNaN(low) || isNaN(high)) return false;
      if (low < ranges[i].min || high > ranges[i].max || low > high)
        return false;
      continue;
    }

    // Handle comma-separated values
    const values = part.split(",");
    for (const v of values) {
      const num = parseInt(v, 10);
      if (isNaN(num) || num < ranges[i].min || num > ranges[i].max)
        return false;
    }
  }

  return true;
}

/**
 * Convert a cron expression to a human-readable description.
 */
export function getCronDescription(cronExpr: string): string {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) {
    return "Invalid cron expression";
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const monthNames = [
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  // Simple cases for common patterns
  if (
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*" &&
    minute !== "*" &&
    hour !== "*"
  ) {
    return `Daily at ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  }

  if (
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek !== "*" &&
    minute !== "*" &&
    hour !== "*"
  ) {
    const dayNum = parseInt(dayOfWeek, 10);
    const dayName = dayNames[dayNum] ?? `day ${dayOfWeek}`;
    return `Weekly on ${dayName} at ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  }

  if (
    dayOfMonth !== "*" &&
    month === "*" &&
    dayOfWeek === "*" &&
    minute !== "*" &&
    hour !== "*"
  ) {
    return `Monthly on day ${dayOfMonth} at ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  }

  if (minute === "*" && hour === "*") {
    return "Every minute";
  }

  if (hour === "*" && minute !== "*") {
    return `Every hour at minute ${minute}`;
  }

  return `Cron: ${cronExpr}`;
}

/**
 * Validate a policy YAML structure (parsed as a JS object).
 */
export function validatePolicyStructure(policy: Record<string, unknown>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!policy.version) {
    errors.push("Policy must have a version field");
  }

  if (!Array.isArray(policy.rules)) {
    errors.push("Policy must have a rules array");
    return { valid: false, errors };
  }

  for (let i = 0; i < policy.rules.length; i++) {
    const rule = policy.rules[i] as Record<string, unknown>;

    if (!rule.name || typeof rule.name !== "string") {
      errors.push(`Rule ${i}: must have a name`);
    }

    if (
      !rule.type ||
      !VALID_RULE_TYPES.includes(rule.type as (typeof VALID_RULE_TYPES)[number])
    ) {
      errors.push(
        `Rule ${i}: type must be one of: ${VALID_RULE_TYPES.join(", ")}`,
      );
    }

    if (
      !rule.severity ||
      !VALID_SEVERITIES.includes(
        rule.severity as (typeof VALID_SEVERITIES)[number],
      )
    ) {
      errors.push(
        `Rule ${i}: severity must be one of: ${VALID_SEVERITIES.join(", ")}`,
      );
    }

    if (!rule.files || typeof rule.files !== "string") {
      errors.push(`Rule ${i}: must have a files glob pattern`);
    }
  }

  return { valid: errors.length === 0, errors };
}

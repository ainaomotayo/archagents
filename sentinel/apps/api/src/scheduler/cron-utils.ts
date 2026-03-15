import { CronExpressionParser } from "cron-parser";

export function computeNextRun(
  cronExpression: string,
  timezone: string,
  currentDate?: Date,
): Date {
  const interval = CronExpressionParser.parse(cronExpression, {
    tz: timezone,
    currentDate: currentDate ?? new Date(),
  });
  return interval.next().toDate();
}

export function validateCronExpression(
  expression: string,
): { valid: true } | { valid: false; error: string } {
  // Reject second-level expressions (6 fields)
  if (expression.trim().split(/\s+/).length > 5) {
    return { valid: false, error: "Sub-minute intervals not supported. Use 5-field cron expressions." };
  }
  try {
    CronExpressionParser.parse(expression);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

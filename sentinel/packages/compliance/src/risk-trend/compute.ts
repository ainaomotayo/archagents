export interface TrendPoint {
  date: string; // YYYY-MM-DD
  score: number;
}

/**
 * Fill gaps in sparse date-score pairs using carry-forward.
 * Points before the first data point are omitted (no data = no display).
 */
export function fillGaps(
  points: TrendPoint[],
  startDate: string,
  endDate: string,
): TrendPoint[] {
  if (points.length === 0) return [];

  const lookup = new Map(points.map((p) => [p.date, p.score]));
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const firstDate = sorted[0].date;

  const result: TrendPoint[] = [];
  let lastScore: number | null = null;
  const cursor = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");

  while (cursor <= end) {
    const dateStr = cursor.toISOString().slice(0, 10);

    if (lookup.has(dateStr)) {
      lastScore = lookup.get(dateStr)!;
    }

    if (dateStr >= firstDate && lastScore !== null) {
      result.push({ date: dateStr, score: lastScore });
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return result;
}

/**
 * Compare first-third vs last-third average to determine trend direction.
 * Requires > 5% difference to be "up" or "down", otherwise "flat".
 */
export function computeDirection(
  points: TrendPoint[],
): "up" | "down" | "flat" {
  if (points.length < 2) return "flat";

  const thirdLen = Math.max(1, Math.floor(points.length / 3));
  const firstThird = points.slice(0, thirdLen);
  const lastThird = points.slice(-thirdLen);

  const avgFirst = firstThird.reduce((s, p) => s + p.score, 0) / firstThird.length;
  const avgLast = lastThird.reduce((s, p) => s + p.score, 0) / lastThird.length;

  if (avgFirst === 0) return "flat";
  const pctDiff = ((avgLast - avgFirst) / avgFirst) * 100;

  if (pctDiff > 5) return "up";
  if (pctDiff < -5) return "down";
  return "flat";
}

/**
 * Percentage change from first to last point.
 * Returns 0 if empty, single point, or first score is 0.
 */
export function computeChangePercent(points: TrendPoint[]): number {
  if (points.length < 2) return 0;
  const first = points[0].score;
  const last = points[points.length - 1].score;
  if (first === 0) return 0;
  return Math.round(((last - first) / first) * 100);
}

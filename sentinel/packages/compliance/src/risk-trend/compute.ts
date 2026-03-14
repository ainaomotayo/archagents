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

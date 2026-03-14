export interface SnapshotInput {
  snapshotDate: Date;
  aiRatio: number;
  aiInfluenceScore: number;
  scanCount: number;
}

export interface TrendPoint {
  date: string;
  aiRatio: number;
  aiInfluenceScore: number;
  scanCount: number;
}

export interface TrendResult {
  points: TrendPoint[];
  momChange: number;
  movingAvg7d: number;
  movingAvg30d: number;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function movingAverage(points: TrendPoint[], n: number): number {
  if (points.length === 0) return 0;
  const slice = points.slice(-n);
  return slice.reduce((sum, p) => sum + p.aiRatio, 0) / slice.length;
}

function computeMoM(points: TrendPoint[]): number {
  if (points.length === 0) return 0;

  const now = new Date(points[points.length - 1].date);
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  const currentPoints = points.filter((p) => {
    const d = new Date(p.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const prevPoints = points.filter((p) => {
    const d = new Date(p.date);
    return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
  });

  if (prevPoints.length === 0) return 0;

  const currentAvg =
    currentPoints.reduce((s, p) => s + p.aiRatio, 0) / currentPoints.length;
  const prevAvg =
    prevPoints.reduce((s, p) => s + p.aiRatio, 0) / prevPoints.length;

  if (prevAvg === 0) return 0;
  return (currentAvg - prevAvg) / prevAvg;
}

export function computeTrends(
  snapshots: SnapshotInput[],
  _days: number,
): TrendResult {
  if (snapshots.length === 0) {
    return { points: [], momChange: 0, movingAvg7d: 0, movingAvg30d: 0 };
  }

  const sorted = [...snapshots].sort(
    (a, b) => a.snapshotDate.getTime() - b.snapshotDate.getTime(),
  );

  const points: TrendPoint[] = sorted.map((s) => ({
    date: formatDate(s.snapshotDate),
    aiRatio: s.aiRatio,
    aiInfluenceScore: s.aiInfluenceScore,
    scanCount: s.scanCount,
  }));

  return {
    points,
    momChange: computeMoM(points),
    movingAvg7d: movingAverage(points, 7),
    movingAvg30d: movingAverage(points, 30),
  };
}

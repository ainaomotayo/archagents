export interface FileSignal {
  file: string;
  loc: number;
  aiProbability: number;
  markerTools: string[];
  estimatedTool: string | null;
}

export interface AIRatioResult {
  aiRatio: number;
  aiFiles: number;
  totalFiles: number;
  aiLoc: number;
  totalLoc: number;
  aiInfluenceScore: number;
  avgProbability: number;
  medianProbability: number;
  p95Probability: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function computeAIRatio(
  files: FileSignal[],
  threshold: number,
): AIRatioResult {
  if (files.length === 0) {
    return {
      aiRatio: 0,
      aiFiles: 0,
      totalFiles: 0,
      aiLoc: 0,
      totalLoc: 0,
      aiInfluenceScore: 0,
      avgProbability: 0,
      medianProbability: 0,
      p95Probability: 0,
    };
  }

  const totalFiles = files.length;
  const totalLoc = files.reduce((sum, f) => sum + f.loc, 0);

  const aiFiles = files.filter((f) => f.aiProbability >= threshold);
  const aiFileCount = aiFiles.length;
  const aiLoc = aiFiles.reduce((sum, f) => sum + f.loc, 0);

  const aiRatio = totalLoc === 0 ? 0 : aiLoc / totalLoc;

  const weightedSum = files.reduce(
    (sum, f) => sum + f.aiProbability * f.loc,
    0,
  );
  const aiInfluenceScore = totalLoc === 0 ? 0 : weightedSum / totalLoc;

  const probabilities = files.map((f) => f.aiProbability);
  const avgProbability = probabilities.reduce((a, b) => a + b, 0) / totalFiles;

  const sorted = [...probabilities].sort((a, b) => a - b);
  const medianProbability = percentile(sorted, 50);
  const p95Probability = percentile(sorted, 95);

  return {
    aiRatio,
    aiFiles: aiFileCount,
    totalFiles,
    aiLoc,
    totalLoc,
    aiInfluenceScore,
    avgProbability,
    medianProbability,
    p95Probability,
  };
}

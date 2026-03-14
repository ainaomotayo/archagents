import type { FileSignal } from "./compute-ai-ratio.js";

export interface ToolBreakdownEntry {
  tool: string;
  confirmedFiles: number;
  estimatedFiles: number;
  totalLoc: number;
  percentage: number;
}

export function computeToolBreakdown(
  files: FileSignal[],
  threshold: number,
): ToolBreakdownEntry[] {
  const aiFiles = files.filter((f) => f.aiProbability >= threshold);
  if (aiFiles.length === 0) return [];

  const totalAiLoc = aiFiles.reduce((sum, f) => sum + f.loc, 0);

  const buckets = new Map<
    string,
    { confirmed: number; estimated: number; loc: number }
  >();

  for (const f of aiFiles) {
    let tool: string;
    let isConfirmed: boolean;

    if (f.markerTools.length > 0) {
      tool = f.markerTools[0];
      isConfirmed = true;
    } else if (f.estimatedTool) {
      tool = f.estimatedTool;
      isConfirmed = false;
    } else {
      tool = "unknown";
      isConfirmed = false;
    }

    const entry = buckets.get(tool) ?? { confirmed: 0, estimated: 0, loc: 0 };
    if (isConfirmed) {
      entry.confirmed += 1;
    } else {
      entry.estimated += 1;
    }
    entry.loc += f.loc;
    buckets.set(tool, entry);
  }

  const result: ToolBreakdownEntry[] = [];
  for (const [tool, data] of buckets) {
    result.push({
      tool,
      confirmedFiles: data.confirmed,
      estimatedFiles: data.estimated,
      totalLoc: data.loc,
      percentage: totalAiLoc === 0 ? 0 : (data.loc / totalAiLoc) * 100,
    });
  }

  result.sort((a, b) => b.totalLoc - a.totalLoc);
  return result;
}

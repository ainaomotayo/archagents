import { createHmac, randomUUID } from "node:crypto";
import type {
  IPAttributionDocument,
  ReconciledAttribution,
  ToolBreakdownSummary,
  ClassificationSummary,
  Classification,
} from "./types.js";

interface ScanSubject {
  scanId: string;
  projectId: string;
  repository: string;
  commitHash: string;
  branch: string;
  author: string;
  timestamp: string;
}

interface FileLoc {
  path: string;
  loc: number;
}

export function generateIPAttributionCertificate(
  subject: ScanSubject,
  attributions: ReconciledAttribution[],
  fileLocs: FileLoc[],
  orgBaseRate: number,
  agentVersions: Record<string, string>,
  evidenceChainHash: string,
  secret: string,
): IPAttributionDocument {
  // Build LOC lookup
  const locMap = new Map<string, number>();
  for (const f of fileLocs) {
    locMap.set(f.path, f.loc);
  }

  // Sort files alphabetically for deterministic output
  const sorted = [...attributions].sort((a, b) => a.file.localeCompare(b.file));

  const totalFiles = sorted.length;
  const totalLoc = sorted.reduce((sum, a) => sum + (locMap.get(a.file) ?? 0), 0);

  // Classification summaries
  const classificationEntries: Classification[] = ["human", "ai-generated", "ai-assisted", "mixed", "unknown"];
  const classMap: Record<string, { files: number; loc: number }> = {};
  for (const c of classificationEntries) {
    classMap[c] = { files: 0, loc: 0 };
  }
  for (const a of sorted) {
    const entry = classMap[a.classification];
    if (entry) {
      entry.files++;
      entry.loc += locMap.get(a.file) ?? 0;
    }
  }

  const makeSummary = (key: string): ClassificationSummary => ({
    files: classMap[key].files,
    loc: classMap[key].loc,
    percentage: totalFiles > 0 ? classMap[key].files / totalFiles : 0,
  });

  // AI ratio (ai-generated + ai-assisted LOC / total LOC)
  const aiLoc = (classMap["ai-generated"]?.loc ?? 0) + (classMap["ai-assisted"]?.loc ?? 0);
  const overallAiRatio = totalLoc > 0 ? aiLoc / totalLoc : 0;

  // Avg confidence
  const avgConfidence = sorted.length > 0
    ? sorted.reduce((sum, a) => sum + a.confidence, 0) / sorted.length
    : 0;

  // Conflicting files
  const conflictingFiles = sorted.filter((a) => a.conflictingSources).length;

  // Tool breakdown
  const toolMap = new Map<string, { model: string | null; files: number; loc: number; confirmed: number; estimated: number }>();
  for (const a of sorted) {
    const tool = a.toolName ?? "unknown";
    const existing = toolMap.get(tool) ?? { model: null, files: 0, loc: 0, confirmed: 0, estimated: 0 };
    existing.files++;
    existing.loc += locMap.get(a.file) ?? 0;
    if (a.toolModel) existing.model = a.toolModel;
    if (a.evidence.length >= 2) {
      existing.confirmed++;
    } else {
      existing.estimated++;
    }
    toolMap.set(tool, existing);
  }

  const toolBreakdown: ToolBreakdownSummary[] = [...toolMap.entries()]
    .map(([tool, data]) => ({
      tool,
      model: data.model,
      files: data.files,
      loc: data.loc,
      percentage: totalFiles > 0 ? data.files / totalFiles : 0,
      confirmedCount: data.confirmed,
      estimatedCount: data.estimated,
    }))
    .sort((a, b) => b.files - a.files);

  // Build file entries
  const files = sorted.map((a) => ({
    path: a.file,
    classification: a.classification,
    confidence: a.confidence,
    primarySource: a.primarySource,
    toolName: a.toolName,
    toolModel: a.toolModel,
    loc: locMap.get(a.file) ?? 0,
    fusionMethod: a.fusionMethod,
    conflicting: a.conflictingSources,
    evidence: a.evidence.map((e) => ({
      source: e.source,
      classification: e.classification,
      confidence: e.confidence,
    })),
  }));

  // Unique sources used
  const sources = [...new Set(sorted.flatMap((a) => a.evidence.map((e) => e.source)))].sort();

  const document: IPAttributionDocument = {
    id: `ip-cert-${randomUUID()}`,
    version: "1.0",
    subject,
    summary: {
      totalFiles,
      totalLoc,
      classifications: {
        human: makeSummary("human"),
        aiGenerated: makeSummary("ai-generated"),
        aiAssisted: makeSummary("ai-assisted"),
        mixed: makeSummary("mixed"),
        unknown: makeSummary("unknown"),
      },
      overallAiRatio,
      avgConfidence,
      conflictingFiles,
    },
    toolBreakdown,
    files,
    methodology: {
      algorithm: "bayesian-fusion-with-rule-overrides",
      algorithmVersion: "1.0",
      orgBaseRate,
      sources,
      classificationThresholds: {
        aiGenerated: 0.70,
        aiAssisted: 0.30,
      },
    },
    provenance: {
      generatedBy: "sentinel",
      generatedAt: new Date().toISOString(),
      agentVersions,
      evidenceChainHash,
    },
    signature: "",
  };

  document.signature = signDocument(document, secret);
  return document;
}

export function verifyIPAttributionCertificate(
  documentJson: string,
  secret: string,
): boolean {
  try {
    const doc: IPAttributionDocument = JSON.parse(documentJson);
    const originalSignature = doc.signature;
    doc.signature = "";
    const expected = signDocument(doc, secret);
    return originalSignature === expected;
  } catch {
    return false;
  }
}

export function buildIPAttributionSummary(
  cert: IPAttributionDocument,
): {
  certificateId: string;
  overallAiRatio: number;
  totalFiles: number;
  classifications: Record<string, number>;
  topTools: Array<{ tool: string; files: number }>;
} {
  return {
    certificateId: cert.id,
    overallAiRatio: cert.summary.overallAiRatio,
    totalFiles: cert.summary.totalFiles,
    classifications: {
      human: cert.summary.classifications.human.files,
      aiGenerated: cert.summary.classifications.aiGenerated.files,
      aiAssisted: cert.summary.classifications.aiAssisted.files,
      mixed: cert.summary.classifications.mixed.files,
      unknown: cert.summary.classifications.unknown.files,
    },
    topTools: cert.toolBreakdown.slice(0, 5).map((t) => ({ tool: t.tool, files: t.files })),
  };
}

function signDocument(doc: IPAttributionDocument, secret: string): string {
  const saved = doc.signature;
  doc.signature = "";
  const payload = JSON.stringify(doc);
  doc.signature = saved;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

// packages/compliance/src/ip-attribution/types.ts

export type Classification = "human" | "ai-generated" | "ai-assisted" | "mixed" | "unknown";

export interface SourceEvidence {
  source: "ai-detector" | "declared" | "git" | "license";
  classification: Classification;
  confidence: number;
  toolName: string | null;
  toolModel: string | null;
  rawEvidence: Record<string, unknown>;
}

export interface ReconciledAttribution {
  file: string;
  classification: Classification;
  confidence: number;
  primarySource: string;
  toolName: string | null;
  toolModel: string | null;
  conflictingSources: boolean;
  evidence: SourceEvidence[];
  fusionMethod: "rule-override" | "bayesian";
}

export interface ToolBreakdownSummary {
  tool: string;
  model: string | null;
  files: number;
  loc: number;
  percentage: number;
  confirmedCount: number;
  estimatedCount: number;
}

export interface ClassificationSummary {
  files: number;
  loc: number;
  percentage: number;
}

export interface IPAttributionDocument {
  id: string;
  version: "1.0";
  subject: {
    scanId: string;
    projectId: string;
    repository: string;
    commitHash: string;
    branch: string;
    author: string;
    timestamp: string;
  };
  summary: {
    totalFiles: number;
    totalLoc: number;
    classifications: {
      human: ClassificationSummary;
      aiGenerated: ClassificationSummary;
      aiAssisted: ClassificationSummary;
      mixed: ClassificationSummary;
      unknown: ClassificationSummary;
    };
    overallAiRatio: number;
    avgConfidence: number;
    conflictingFiles: number;
  };
  toolBreakdown: ToolBreakdownSummary[];
  files: Array<{
    path: string;
    classification: string;
    confidence: number;
    primarySource: string;
    toolName: string | null;
    toolModel: string | null;
    loc: number;
    fusionMethod: string;
    conflicting: boolean;
    evidence: Array<{
      source: string;
      classification: string;
      confidence: number;
    }>;
  }>;
  methodology: {
    algorithm: "bayesian-fusion-with-rule-overrides";
    algorithmVersion: "1.0";
    orgBaseRate: number;
    sources: string[];
    classificationThresholds: {
      aiGenerated: number;
      aiAssisted: number;
    };
  };
  provenance: {
    generatedBy: "sentinel";
    generatedAt: string;
    agentVersions: Record<string, string>;
    evidenceChainHash: string;
  };
  signature: string;
}

export interface IPAttributionReportData {
  certificateId: string;
  generatedAt: string;
  subject: IPAttributionDocument["subject"];
  summary: IPAttributionDocument["summary"];
  toolBreakdown: IPAttributionDocument["toolBreakdown"];
  files: IPAttributionDocument["files"];
  methodology: IPAttributionDocument["methodology"];
  signature: string;
  evidenceChainHash: string;
}

export interface GitFileMetadata {
  path: string;
  authors: string[];
  coAuthors: string[];
  lastModifiedBy: string;
  commitMessages: string[];
}

export interface GitMetadata {
  commitAuthor: string;
  commitEmail: string;
  coAuthorTrailers: string[];
  files: GitFileMetadata[];
}

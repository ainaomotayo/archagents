import type { SourceEvidence, GitMetadata } from "./types.js";

export const AI_COAUTHOR_PATTERNS: Array<{ pattern: RegExp; tool: string }> = [
  { pattern: /copilot|github copilot/i, tool: "copilot" },
  { pattern: /claude|anthropic/i, tool: "claude" },
  { pattern: /cursor/i, tool: "cursor" },
  { pattern: /cody|sourcegraph/i, tool: "cody" },
  { pattern: /tabnine/i, tool: "tabnine" },
  { pattern: /amazon\s*q|codewhisperer/i, tool: "amazon-q" },
  { pattern: /gemini|google/i, tool: "gemini" },
];

export const BOT_AUTHOR_PATTERNS: Array<{ pattern: RegExp; tool: string }> = [
  { pattern: /dependabot\[bot\]/i, tool: "dependabot" },
  { pattern: /renovate\[bot\]/i, tool: "renovate" },
  { pattern: /snyk-bot/i, tool: "snyk" },
  { pattern: /greenkeeper/i, tool: "greenkeeper" },
  { pattern: /github-actions\[bot\]/i, tool: "github-actions" },
];

export interface AIDetectorData {
  aiProbability: number;
  toolName: string | null;
  dominantSignal: string;
  signals: Record<string, unknown>;
}

export function adaptAIDetector(
  file: string,
  data: AIDetectorData | null,
): SourceEvidence | null {
  if (!data) return null;
  const p = data.aiProbability;

  let classification: SourceEvidence["classification"];
  let confidence: number;

  if (p >= 0.70) {
    classification = "ai-generated";
    confidence = p;
  } else if (p >= 0.30) {
    classification = "ai-assisted";
    confidence = p;
  } else {
    classification = "human";
    confidence = 1 - p;
  }

  return {
    source: "ai-detector",
    classification,
    confidence,
    toolName: data.toolName,
    toolModel: null,
    rawEvidence: {
      aiProbability: p,
      dominantSignal: data.dominantSignal,
      signals: data.signals,
    },
  };
}

export interface DeclaredData {
  name: string;
  model?: string;
  scope?: string;
}

export function adaptDeclared(
  file: string,
  data: DeclaredData | null,
): SourceEvidence | null {
  if (!data) return null;
  return {
    source: "declared",
    classification: "ai-generated",
    confidence: 0.85,
    toolName: data.name,
    toolModel: data.model ?? null,
    rawEvidence: {
      source: ".sentinel-ai.yml",
      scope: data.scope ?? "**",
      declaredName: data.name,
    },
  };
}

export function adaptGit(
  file: string,
  gitMeta: GitMetadata | null | undefined,
): SourceEvidence | null {
  if (!gitMeta) return null;

  const fileMeta = gitMeta.files.find((f) => f.path === file);
  if (!fileMeta) return null;

  // Check co-author trailers first (highest signal)
  const allCoAuthors = [
    ...gitMeta.coAuthorTrailers,
    ...fileMeta.coAuthors,
  ];
  for (const trailer of allCoAuthors) {
    for (const { pattern, tool } of AI_COAUTHOR_PATTERNS) {
      if (pattern.test(trailer)) {
        return {
          source: "git",
          classification: "ai-assisted",
          confidence: 0.90,
          toolName: tool,
          toolModel: null,
          rawEvidence: { trailer, commitAuthor: gitMeta.commitAuthor },
        };
      }
    }
  }

  // Check bot authors
  for (const { pattern, tool } of BOT_AUTHOR_PATTERNS) {
    if (pattern.test(gitMeta.commitAuthor)) {
      return {
        source: "git",
        classification: "ai-generated",
        confidence: 0.95,
        toolName: tool,
        toolModel: null,
        rawEvidence: { author: gitMeta.commitAuthor, email: gitMeta.commitEmail },
      };
    }
  }

  // Check blame authors for mixed signals
  const hasBot = fileMeta.authors.some((a) =>
    BOT_AUTHOR_PATTERNS.some(({ pattern }) => pattern.test(a)),
  );
  if (hasBot && fileMeta.authors.length > 1) {
    return {
      source: "git",
      classification: "mixed",
      confidence: 0.50,
      toolName: null,
      toolModel: null,
      rawEvidence: { blameAuthors: fileMeta.authors },
    };
  }

  // Default: human with low confidence
  return {
    source: "git",
    classification: "human",
    confidence: 0.60,
    toolName: null,
    toolModel: null,
    rawEvidence: {
      blameAuthors: fileMeta.authors,
      commitAuthor: gitMeta.commitAuthor,
    },
  };
}

export interface LicenseData {
  similarityScore: number;
  sourceMatch: string | null;
  licenseDetected: string | null;
}

export function adaptLicense(
  file: string,
  data: LicenseData | null,
): SourceEvidence | null {
  if (!data) return null;
  if (data.similarityScore <= 0.80) return null;
  return {
    source: "license",
    classification: "human",
    confidence: data.similarityScore,
    toolName: null,
    toolModel: null,
    rawEvidence: {
      similarityScore: data.similarityScore,
      sourceMatch: data.sourceMatch,
      licenseDetected: data.licenseDetected,
    },
  };
}

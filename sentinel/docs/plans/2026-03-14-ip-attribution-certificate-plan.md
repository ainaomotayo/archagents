# IP Attribution Certificate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a signed IP attribution certificate that classifies every file in a scan by provenance (human/AI/tool) using Bayesian fusion of multiple evidence sources, with JSON + PDF + SPDX + CycloneDX exports.

**Architecture:** Normalized evidence storage (FileAttribution + AttributionEvidence + IPAttributionCertificate) in `packages/compliance/src/ip-attribution/`. Four source adapters feed a Bayesian reconciler with rule-based fast paths. JSON certificate generated synchronously with scan; PDF/SPDX/CycloneDX async. Summary embedded in existing compliance certificate.

**Tech Stack:** TypeScript, Vitest, Prisma, React PDF, HMAC-SHA256, micromatch

**Design doc:** `docs/plans/2026-03-14-ip-attribution-certificate-design.md`

---

### Task 1: Types & Interfaces

**Files:**
- Create: `packages/compliance/src/ip-attribution/types.ts`

**Context:** All IP attribution interfaces used across the module. No dependencies on other files.

**Step 1: Create the types file**

```typescript
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
```

**Step 2: Commit**

```bash
git add packages/compliance/src/ip-attribution/types.ts
git commit -m "feat(ip-attribution): add type definitions"
```

---

### Task 2: Source Adapters

**Files:**
- Create: `packages/compliance/src/ip-attribution/adapters.ts`
- Create: `packages/compliance/src/__tests__/ip-attribution-adapters.test.ts`

**Context:** Four pure functions, one per provenance source. Each takes source-specific data and returns `SourceEvidence | null`. Import types from `./types.ts`.

**Step 1: Write the failing tests**

```typescript
// packages/compliance/src/__tests__/ip-attribution-adapters.test.ts
import { describe, it, expect } from "vitest";
import {
  adaptAIDetector,
  adaptDeclared,
  adaptGit,
  adaptLicense,
  AI_COAUTHOR_PATTERNS,
  BOT_AUTHOR_PATTERNS,
} from "../ip-attribution/adapters.js";

describe("adaptAIDetector", () => {
  it("classifies high probability as ai-generated", () => {
    const result = adaptAIDetector("src/foo.ts", {
      aiProbability: 0.85,
      toolName: "copilot",
      dominantSignal: "markers",
      signals: {},
    });
    expect(result).not.toBeNull();
    expect(result!.classification).toBe("ai-generated");
    expect(result!.confidence).toBe(0.85);
    expect(result!.toolName).toBe("copilot");
  });

  it("classifies medium probability as ai-assisted", () => {
    const result = adaptAIDetector("src/foo.ts", {
      aiProbability: 0.50,
      toolName: null,
      dominantSignal: "entropy",
      signals: {},
    });
    expect(result!.classification).toBe("ai-assisted");
    expect(result!.confidence).toBe(0.50);
  });

  it("classifies low probability as human", () => {
    const result = adaptAIDetector("src/foo.ts", {
      aiProbability: 0.10,
      toolName: null,
      dominantSignal: "entropy",
      signals: {},
    });
    expect(result!.classification).toBe("human");
    expect(result!.confidence).toBeCloseTo(0.90);
  });

  it("returns null when no detection data", () => {
    expect(adaptAIDetector("src/foo.ts", null)).toBeNull();
  });
});

describe("adaptDeclared", () => {
  it("returns ai-generated with 0.85 confidence for matching declaration", () => {
    const result = adaptDeclared("src/utils/helper.ts", {
      name: "copilot",
      model: "gpt-4-turbo",
      scope: "src/**",
    });
    expect(result).not.toBeNull();
    expect(result!.classification).toBe("ai-generated");
    expect(result!.confidence).toBe(0.85);
    expect(result!.toolName).toBe("copilot");
    expect(result!.toolModel).toBe("gpt-4-turbo");
  });

  it("returns null when no declaration matches", () => {
    expect(adaptDeclared("src/foo.ts", null)).toBeNull();
  });
});

describe("adaptGit", () => {
  it("detects co-author trailer for copilot", () => {
    const result = adaptGit("src/foo.ts", {
      commitAuthor: "dev",
      commitEmail: "dev@co.com",
      coAuthorTrailers: ["Co-Authored-By: GitHub Copilot"],
      files: [{ path: "src/foo.ts", authors: ["dev"], coAuthors: ["GitHub Copilot"], lastModifiedBy: "dev", commitMessages: [] }],
    });
    expect(result!.classification).toBe("ai-assisted");
    expect(result!.confidence).toBe(0.90);
    expect(result!.toolName).toBe("copilot");
  });

  it("detects bot author", () => {
    const result = adaptGit("src/foo.ts", {
      commitAuthor: "dependabot[bot]",
      commitEmail: "bot@github.com",
      coAuthorTrailers: [],
      files: [{ path: "src/foo.ts", authors: ["dependabot[bot]"], coAuthors: [], lastModifiedBy: "dependabot[bot]", commitMessages: [] }],
    });
    expect(result!.classification).toBe("ai-generated");
    expect(result!.confidence).toBe(0.95);
    expect(result!.toolName).toBe("dependabot");
  });

  it("returns human with low confidence for regular author", () => {
    const result = adaptGit("src/foo.ts", {
      commitAuthor: "dev",
      commitEmail: "dev@co.com",
      coAuthorTrailers: [],
      files: [{ path: "src/foo.ts", authors: ["dev"], coAuthors: [], lastModifiedBy: "dev", commitMessages: [] }],
    });
    expect(result!.classification).toBe("human");
    expect(result!.confidence).toBe(0.60);
  });

  it("returns null when no git metadata", () => {
    expect(adaptGit("src/foo.ts", null)).toBeNull();
    expect(adaptGit("src/foo.ts", undefined as any)).toBeNull();
  });

  it("returns null when file not in git metadata", () => {
    const result = adaptGit("src/missing.ts", {
      commitAuthor: "dev",
      commitEmail: "dev@co.com",
      coAuthorTrailers: [],
      files: [],
    });
    expect(result).toBeNull();
  });

  it("detects Claude co-author case-insensitively", () => {
    const result = adaptGit("src/foo.ts", {
      commitAuthor: "dev",
      commitEmail: "dev@co.com",
      coAuthorTrailers: ["Co-Authored-By: claude"],
      files: [{ path: "src/foo.ts", authors: ["dev"], coAuthors: ["claude"], lastModifiedBy: "dev", commitMessages: [] }],
    });
    expect(result!.toolName).toBe("claude");
  });

  it("detects mixed blame authors", () => {
    const result = adaptGit("src/foo.ts", {
      commitAuthor: "dev",
      commitEmail: "dev@co.com",
      coAuthorTrailers: [],
      files: [{ path: "src/foo.ts", authors: ["dev", "dependabot[bot]"], coAuthors: [], lastModifiedBy: "dev", commitMessages: [] }],
    });
    expect(result!.classification).toBe("mixed");
    expect(result!.confidence).toBe(0.50);
  });
});

describe("adaptLicense", () => {
  it("returns human for high OSS similarity", () => {
    const result = adaptLicense("src/foo.ts", {
      similarityScore: 0.92,
      sourceMatch: "lodash",
      licenseDetected: "MIT",
    });
    expect(result!.classification).toBe("human");
    expect(result!.confidence).toBe(0.92);
  });

  it("returns null for low similarity", () => {
    expect(adaptLicense("src/foo.ts", { similarityScore: 0.40, sourceMatch: null, licenseDetected: null })).toBeNull();
  });

  it("returns null when no license data", () => {
    expect(adaptLicense("src/foo.ts", null)).toBeNull();
  });
});

describe("AI_COAUTHOR_PATTERNS", () => {
  it("includes expected tools", () => {
    const tools = AI_COAUTHOR_PATTERNS.map((p) => p.tool);
    expect(tools).toContain("copilot");
    expect(tools).toContain("claude");
    expect(tools).toContain("cursor");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd packages/compliance && npx vitest run src/__tests__/ip-attribution-adapters.test.ts
```

Expected: FAIL (module not found)

**Step 3: Implement the adapters**

```typescript
// packages/compliance/src/ip-attribution/adapters.ts
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
```

**Step 4: Run tests to verify they pass**

```bash
cd packages/compliance && npx vitest run src/__tests__/ip-attribution-adapters.test.ts
```

Expected: 14 tests PASS

**Step 5: Commit**

```bash
git add packages/compliance/src/ip-attribution/adapters.ts packages/compliance/src/__tests__/ip-attribution-adapters.test.ts
git commit -m "feat(ip-attribution): add source adapters with tests"
```

---

### Task 3: Reconciler (Bayesian Fusion + Rule Overrides)

**Files:**
- Create: `packages/compliance/src/ip-attribution/reconciler.ts`
- Create: `packages/compliance/src/__tests__/ip-attribution-reconciler.test.ts`

**Context:** Pure function that takes `SourceEvidence[]` and `orgBaseRate` and returns `ReconciledAttribution`. Three-step process: rule-based fast paths → Bayesian fusion → conflict detection. Import types from `./types.ts`.

**Step 1: Write the failing tests**

```typescript
// packages/compliance/src/__tests__/ip-attribution-reconciler.test.ts
import { describe, it, expect } from "vitest";
import { reconcile } from "../ip-attribution/reconciler.js";
import type { SourceEvidence } from "../ip-attribution/types.js";

const aiDetectorHigh: SourceEvidence = {
  source: "ai-detector", classification: "ai-generated", confidence: 0.88,
  toolName: "copilot", toolModel: null, rawEvidence: {},
};
const declaredCopilot: SourceEvidence = {
  source: "declared", classification: "ai-generated", confidence: 0.85,
  toolName: "copilot", toolModel: "gpt-4-turbo", rawEvidence: {},
};
const gitHuman: SourceEvidence = {
  source: "git", classification: "human", confidence: 0.60,
  toolName: null, toolModel: null, rawEvidence: {},
};
const gitCoAuthor: SourceEvidence = {
  source: "git", classification: "ai-assisted", confidence: 0.90,
  toolName: "copilot", toolModel: null, rawEvidence: {},
};
const licenseHuman: SourceEvidence = {
  source: "license", classification: "human", confidence: 0.92,
  toolName: null, toolModel: null, rawEvidence: {},
};
const aiDetectorLow: SourceEvidence = {
  source: "ai-detector", classification: "human", confidence: 0.90,
  toolName: null, toolModel: null, rawEvidence: {},
};
const aiDetectorMid: SourceEvidence = {
  source: "ai-detector", classification: "ai-assisted", confidence: 0.55,
  toolName: null, toolModel: null, rawEvidence: {},
};

describe("reconcile — rule-based fast paths", () => {
  it("Rule 1: two sources agree on AI with high confidence", () => {
    const result = reconcile("src/foo.ts", [aiDetectorHigh, declaredCopilot], 0.30);
    expect(result.classification).toBe("ai-generated");
    expect(result.confidence).toBe(0.88);
    expect(result.fusionMethod).toBe("rule-override");
    expect(result.toolName).toBe("copilot");
  });

  it("Rule 2: clear human — low AI + no declarations + no git AI", () => {
    const result = reconcile("src/foo.ts", [aiDetectorLow, gitHuman], 0.30);
    expect(result.classification).toBe("human");
    expect(result.fusionMethod).toBe("rule-override");
  });

  it("Rule 3: no evidence → unknown", () => {
    const result = reconcile("src/foo.ts", [], 0.30);
    expect(result.classification).toBe("unknown");
    expect(result.confidence).toBe(0);
    expect(result.fusionMethod).toBe("rule-override");
  });
});

describe("reconcile — Bayesian fusion", () => {
  it("fuses ambiguous signals toward AI with high prior", () => {
    const result = reconcile("src/foo.ts", [aiDetectorMid, gitHuman], 0.60);
    expect(result.fusionMethod).toBe("bayesian");
    // High prior + medium AI detector → likely ai-assisted
    expect(["ai-generated", "ai-assisted"]).toContain(result.classification);
  });

  it("fuses ambiguous signals toward human with low prior", () => {
    const result = reconcile("src/foo.ts", [aiDetectorMid, gitHuman], 0.10);
    expect(result.fusionMethod).toBe("bayesian");
    expect(result.classification).toBe("human");
  });

  it("respects classification thresholds at 0.70 boundary", () => {
    // Strong AI detector + git co-author → should cross 0.70
    const result = reconcile("src/foo.ts", [
      { ...aiDetectorMid, confidence: 0.65, classification: "ai-assisted" },
      gitCoAuthor,
    ], 0.30);
    expect(result.classification).toBe("ai-generated");
  });
});

describe("reconcile — conflict detection", () => {
  it("marks conflicting sources when close confidence disagrees", () => {
    const aiSaysGenerated: SourceEvidence = {
      source: "ai-detector", classification: "ai-generated", confidence: 0.75,
      toolName: "copilot", toolModel: null, rawEvidence: {},
    };
    const result = reconcile("src/foo.ts", [aiSaysGenerated, licenseHuman], 0.30);
    // Both have high confidence, they disagree
    expect(result.conflictingSources).toBe(true);
  });

  it("does not mark conflict when confidence gap is large", () => {
    const result = reconcile("src/foo.ts", [aiDetectorHigh, gitHuman], 0.30);
    // 0.88 vs 0.60 — gap is 0.28 > 0.15
    expect(result.conflictingSources).toBe(false);
  });
});

describe("reconcile — tool attribution", () => {
  it("picks toolName from highest confidence source", () => {
    const result = reconcile("src/foo.ts", [
      { ...gitCoAuthor, toolName: "copilot", confidence: 0.90 },
      { ...declaredCopilot, toolName: "cursor", confidence: 0.85 },
    ], 0.30);
    expect(result.toolName).toBe("copilot");
  });

  it("picks toolModel from highest confidence source", () => {
    const result = reconcile("src/foo.ts", [
      { ...declaredCopilot, toolModel: "gpt-4-turbo", confidence: 0.85 },
      { ...gitCoAuthor, toolModel: null, confidence: 0.90 },
    ], 0.30);
    expect(result.toolModel).toBe("gpt-4-turbo");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd packages/compliance && npx vitest run src/__tests__/ip-attribution-reconciler.test.ts
```

**Step 3: Implement the reconciler**

```typescript
// packages/compliance/src/ip-attribution/reconciler.ts
import type { SourceEvidence, ReconciledAttribution, Classification } from "./types.js";

const AI_CLASSIFICATIONS: Classification[] = ["ai-generated", "ai-assisted"];
const AI_GENERATED_THRESHOLD = 0.70;
const AI_ASSISTED_THRESHOLD = 0.30;
const CONFLICT_GAP_THRESHOLD = 0.15;

export function reconcile(
  file: string,
  evidenceList: SourceEvidence[],
  orgBaseRate: number,
): ReconciledAttribution {
  // Rule 3: no evidence
  if (evidenceList.length === 0) {
    return makeResult(file, "unknown", 0, "none", null, null, false, [], "rule-override");
  }

  // Rule 1: two+ independent sources agree on AI with high confidence
  const highConfAI = evidenceList.filter(
    (e) => AI_CLASSIFICATIONS.includes(e.classification) && e.confidence > 0.75,
  );
  if (highConfAI.length >= 2) {
    const best = highConfAI.sort((a, b) => b.confidence - a.confidence)[0];
    return makeResult(
      file, best.classification, best.confidence, best.source,
      pickToolName(evidenceList), pickToolModel(evidenceList),
      false, evidenceList, "rule-override",
    );
  }

  // Rule 2: clear human — AI detector says human (prob < 0.15 → confidence > 0.85)
  // AND no declared or git AI evidence
  const aiDetector = evidenceList.find((e) => e.source === "ai-detector");
  const hasAIDeclaration = evidenceList.some(
    (e) => e.source === "declared" && AI_CLASSIFICATIONS.includes(e.classification),
  );
  const hasGitAI = evidenceList.some(
    (e) => e.source === "git" && AI_CLASSIFICATIONS.includes(e.classification),
  );
  if (
    aiDetector &&
    aiDetector.classification === "human" &&
    aiDetector.confidence > 0.85 &&
    !hasAIDeclaration &&
    !hasGitAI
  ) {
    return makeResult(
      file, "human", aiDetector.confidence, aiDetector.source,
      null, null, false, evidenceList, "rule-override",
    );
  }

  // Bayesian posterior fusion
  let prior = orgBaseRate;
  for (const source of evidenceList) {
    if (source.classification === "unknown" || source.classification === "mixed") continue;

    let likelihoodAI: number;
    let likelihoodHuman: number;

    if (AI_CLASSIFICATIONS.includes(source.classification)) {
      likelihoodAI = source.confidence;
      likelihoodHuman = 1 - source.confidence;
    } else {
      likelihoodAI = 1 - source.confidence;
      likelihoodHuman = source.confidence;
    }

    const posteriorAI = prior * likelihoodAI;
    const posteriorHuman = (1 - prior) * likelihoodHuman;
    const normalizer = posteriorAI + posteriorHuman;
    if (normalizer > 0) {
      prior = posteriorAI / normalizer;
    }
  }

  const finalProb = prior;
  let classification: Classification;
  if (finalProb >= AI_GENERATED_THRESHOLD) {
    classification = "ai-generated";
  } else if (finalProb >= AI_ASSISTED_THRESHOLD) {
    classification = "ai-assisted";
  } else {
    classification = "human";
  }

  // Conflict detection
  const conflicting = detectConflict(evidenceList);

  // If conflicting and fusion produced a borderline result, mark as mixed
  if (conflicting && classification !== "human") {
    const hasHumanSource = evidenceList.some(
      (e) => e.classification === "human" && e.confidence > 0.75,
    );
    if (hasHumanSource) {
      classification = "mixed";
    }
  }

  const primarySource = evidenceList.sort((a, b) => b.confidence - a.confidence)[0].source;

  return makeResult(
    file, classification, finalProb, primarySource,
    pickToolName(evidenceList), pickToolModel(evidenceList),
    conflicting, evidenceList, "bayesian",
  );
}

function detectConflict(evidenceList: SourceEvidence[]): boolean {
  if (evidenceList.length < 2) return false;
  const sorted = [...evidenceList].sort((a, b) => b.confidence - a.confidence);
  const top = sorted[0];
  const second = sorted[1];
  const gap = top.confidence - second.confidence;
  const disagree =
    (AI_CLASSIFICATIONS.includes(top.classification) && !AI_CLASSIFICATIONS.includes(second.classification)) ||
    (!AI_CLASSIFICATIONS.includes(top.classification) && AI_CLASSIFICATIONS.includes(second.classification));
  return gap < CONFLICT_GAP_THRESHOLD && disagree;
}

function pickToolName(evidenceList: SourceEvidence[]): string | null {
  const sorted = [...evidenceList].sort((a, b) => b.confidence - a.confidence);
  for (const e of sorted) {
    if (e.toolName) return e.toolName;
  }
  return null;
}

function pickToolModel(evidenceList: SourceEvidence[]): string | null {
  const sorted = [...evidenceList].sort((a, b) => b.confidence - a.confidence);
  for (const e of sorted) {
    if (e.toolModel) return e.toolModel;
  }
  return null;
}

function makeResult(
  file: string,
  classification: Classification,
  confidence: number,
  primarySource: string,
  toolName: string | null,
  toolModel: string | null,
  conflictingSources: boolean,
  evidence: SourceEvidence[],
  fusionMethod: "rule-override" | "bayesian",
): ReconciledAttribution {
  return { file, classification, confidence, primarySource, toolName, toolModel, conflictingSources, evidence, fusionMethod };
}
```

**Step 4: Run tests to verify they pass**

```bash
cd packages/compliance && npx vitest run src/__tests__/ip-attribution-reconciler.test.ts
```

Expected: 12 tests PASS

**Step 5: Commit**

```bash
git add packages/compliance/src/ip-attribution/reconciler.ts packages/compliance/src/__tests__/ip-attribution-reconciler.test.ts
git commit -m "feat(ip-attribution): add Bayesian reconciler with rule overrides"
```

---

### Task 4: Certificate Generator (JSON + HMAC Signing)

**Files:**
- Create: `packages/compliance/src/ip-attribution/certificate.ts`
- Create: `packages/compliance/src/__tests__/ip-attribution-certificate.test.ts`

**Context:** Pure functions to build the `IPAttributionDocument`, sign it with HMAC-SHA256, and verify signatures. Follows the pattern in `packages/assessor/src/certificate.ts`. Import types from `./types.ts`.

**Step 1: Write tests**

Test cases: document generation with deterministic file ordering, HMAC round-trip, summary stats, tool breakdown, methodology section, compliance certificate summary builder, verification with wrong secret fails.

**Step 2: Implement**

Key functions:
- `generateIPAttributionCertificate(scan, attributions, orgBaseRate, agentVersions, evidenceChainHash, secret)` → `{ document, signature }`
- `verifyIPAttributionCertificate(documentJson, secret)` → boolean
- `buildIPAttributionSummary(cert)` → compliance certificate embedding object

Uses `createHmac("sha256", secret)` from `node:crypto`. Files sorted alphabetically by path before signing for determinism.

**Step 3: Run tests, commit**

```bash
git commit -m "feat(ip-attribution): add certificate generation and HMAC signing"
```

---

### Task 5: SPDX 2.3 Export

**Files:**
- Create: `packages/compliance/src/ip-attribution/spdx-export.ts`
- Create: `packages/compliance/src/__tests__/ip-attribution-spdx.test.ts`

**Context:** Pure function that takes `IPAttributionDocument` and returns an SPDX 2.3 tag-value format string. No external dependencies.

**Step 1: Write tests**

Test cases: document header contains required SPDX fields (SPDXVersion, DataLicense, SPDXID, DocumentName, Creator), file entries present with FileName + FileComment containing classification, annotations present with AnnotationType: REVIEW, empty files array produces valid minimal document, signature in document comment.

**Step 2: Implement**

`generateSpdxExport(document: IPAttributionDocument): string` — builds tag-value sections: document header → file entries with annotations.

**Step 3: Run tests, commit**

```bash
git commit -m "feat(ip-attribution): add SPDX 2.3 tag-value export"
```

---

### Task 6: CycloneDX 1.5 Export

**Files:**
- Create: `packages/compliance/src/ip-attribution/cyclonedx-export.ts`
- Create: `packages/compliance/src/__tests__/ip-attribution-cyclonedx.test.ts`

**Context:** Pure function that takes `IPAttributionDocument` and returns a CycloneDX 1.5 JSON string. No external dependencies.

**Step 1: Write tests**

Test cases: output parses as valid JSON with bomFormat/specVersion/version, components present with type "file", evidence.identity on components with confidence, metadata.properties contain sentinel:certificateId and sentinel:signature, empty files produces valid minimal BOM.

**Step 2: Implement**

`generateCycloneDxExport(document: IPAttributionDocument): string` — builds CycloneDX JSON structure with metadata + components array.

**Step 3: Run tests, commit**

```bash
git commit -m "feat(ip-attribution): add CycloneDX 1.5 JSON export"
```

---

### Task 7: PDF Report

**Files:**
- Create: `packages/compliance/src/reports/IPAttributionReport.tsx`
- Modify: `packages/compliance/src/reports/generator.ts`

**Context:** React PDF component following the pattern in `ComplianceSummaryReport.tsx`. Uses `@react-pdf/renderer` with `Document`, `Page`, `View`, `Text`, `StyleSheet`. Add `generateIPAttributionPdf` to the generator barrel file.

**Step 1: Implement the report component**

Sections: Header (certificate ID, date, project info), Provenance Summary (classification counts with bars), Tool Attribution table, File Attributions table (path, classification, confidence, tool, source), Methodology section, Signature footer.

**Step 2: Add to generator.ts**

```typescript
import { IPAttributionReport, type IPAttributionReportData } from "./IPAttributionReport.js";

export async function generateIPAttributionPdf(data: IPAttributionReportData): Promise<Buffer> {
  return renderToBuffer(createElement(IPAttributionReport, { data }) as any) as Promise<Buffer>;
}
```

**Step 3: Commit**

```bash
git commit -m "feat(ip-attribution): add PDF report template"
```

---

### Task 8: Prisma Schema & Migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260314200000_add_ip_attribution/migration.sql`

**Context:** Add `FileAttribution`, `AttributionEvidence`, and `IPAttributionCertificate` models. Add `ipAttributionCertificate` reverse relation to `Scan`. Follow existing migration pattern (manual SQL since no live DB).

**Step 1: Add models to schema.prisma**

Add the three models from the design doc after the `DecisionTrace` model. Add `ipAttributionCertificate IPAttributionCertificate?` to the `Scan` model.

**Step 2: Create migration SQL**

Create tables with UUID PKs, proper column types, foreign keys (ipAttributionCertificate.scanId → scans.id, fileAttribution.certificateId → ip_attribution_certificates.id, attributionEvidence.attributionId → file_attributions.id), unique constraint on ip_attribution_certificates.scan_id, indexes matching schema.

**Step 3: Regenerate Prisma client**

```bash
cd packages/db && npx prisma generate
```

**Step 4: Commit**

```bash
git commit -m "feat(ip-attribution): add Prisma schema and migration"
```

---

### Task 9: Service Layer

**Files:**
- Create: `packages/compliance/src/ip-attribution/service.ts`
- Create: `packages/compliance/src/__tests__/ip-attribution-service.test.ts`

**Context:** `IPAttributionService` class with `generateForScan()` that orchestrates the full pipeline: gather sources → adapt → reconcile → generate certificate → persist. Plus query methods. Uses mock DB in tests (same pattern as `decision-trace-service.test.ts`).

**Step 1: Write tests**

Test cases: `generateForScan` with AI detector findings produces certificate with correct stats; scan with no AI findings produces all-human certificate; `getByScanId` returns persisted certificate; `getAttributions` returns file list; `getAttributionWithEvidence` returns evidence chain; idempotent re-generation for same scan; `getOrgToolBreakdown` aggregation; `getFileHistory` across scans.

**Step 2: Implement**

The service:
1. Queries findings, DecisionTraces, scan metadata
2. For each unique file: runs adapters (AI detector data from DecisionTrace, declared from enrichment metadata, git from scan.metadata.gitMetadata, license from LicenseFindings)
3. Calls `reconcile()` per file
4. Calls `generateIPAttributionCertificate()` with all reconciled attributions
5. Persists IPAttributionCertificate + FileAttribution + AttributionEvidence rows in one flow
6. Returns certificateId

**Step 3: Run tests, commit**

```bash
git commit -m "feat(ip-attribution): add service layer with generation and queries"
```

---

### Task 10: Barrel Exports

**Files:**
- Modify: `packages/compliance/src/index.ts`

**Context:** Export all public APIs from the ip-attribution module.

**Step 1: Add exports**

```typescript
// IP Attribution
export { reconcile } from "./ip-attribution/reconciler.js";
export {
  adaptAIDetector, adaptDeclared, adaptGit, adaptLicense,
  AI_COAUTHOR_PATTERNS, BOT_AUTHOR_PATTERNS,
} from "./ip-attribution/adapters.js";
export {
  generateIPAttributionCertificate, verifyIPAttributionCertificate,
  buildIPAttributionSummary,
} from "./ip-attribution/certificate.js";
export { generateSpdxExport } from "./ip-attribution/spdx-export.js";
export { generateCycloneDxExport } from "./ip-attribution/cyclonedx-export.js";
export { IPAttributionService } from "./ip-attribution/service.js";
export type {
  Classification, SourceEvidence, ReconciledAttribution,
  IPAttributionDocument, IPAttributionReportData,
  ToolBreakdownSummary, GitMetadata, GitFileMetadata,
} from "./ip-attribution/types.js";
```

**Step 2: Build compliance package**

```bash
cd packages/compliance && npx tsc
```

**Step 3: Commit**

```bash
git commit -m "feat(ip-attribution): add barrel exports"
```

---

### Task 11: API Routes

**Files:**
- Create: `apps/api/src/routes/ip-attribution.ts`
- Modify: `apps/api/src/server.ts`

**Context:** Route builder following the `buildDecisionTraceRoutes` pattern. Register routes in server.ts with authHook + withTenant. The SENTINEL_SECRET env var is available as `process.env.SENTINEL_SECRET`.

**Step 1: Create route builder**

12 routes as specified in design: getByScan, getDocument, verify, getAttributions, getFileEvidence, downloadPdf, downloadSpdx, downloadCycloneDx, getOrgToolBreakdown, getOrgAiTrend, getFileHistory.

**Step 2: Register routes in server.ts**

Add import and instantiation of `buildIPAttributionRoutes({ db, secret: process.env.SENTINEL_SECRET! })`. Register all GET/POST endpoints with authHook + withTenant, following the existing pattern at lines 1988-2000.

**Step 3: Type-check**

```bash
cd packages/compliance && npx tsc && cd ../../apps/api && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git commit -m "feat(ip-attribution): add API routes"
```

---

### Task 12: Wire into Assessor Pipeline

**Files:**
- Modify: `apps/api/src/stores.ts`
- Modify: `apps/api/src/worker.ts`

**Context:** After findings are persisted and DecisionTrace rows created, generate the IP attribution certificate synchronously. After scan finalization, publish an event for async PDF/SPDX/CycloneDX export.

**Step 1: Modify stores.ts**

After the DecisionTrace dual-write block (step 2b), add step 2c: call `IPAttributionService.generateForScan()` with scanId, orgId, and scan subject data. Best-effort try/catch like the existing DecisionTrace block.

**Step 2: Modify worker.ts**

After the existing AI metrics post-scan hook, add an IP attribution export hook: publish `sentinel.ip-attribution.export` event with scanId, orgId, and certificateId. Add a handler that generates PDF/SPDX/CycloneDX and updates the certificate row with URLs.

**Step 3: Type-check and commit**

```bash
git commit -m "feat(ip-attribution): wire into assessor pipeline and export hook"
```

---

### Task 13: Dashboard Types & API Client

**Files:**
- Modify: `apps/dashboard/lib/types.ts`
- Modify: `apps/dashboard/lib/api.ts`

**Context:** Add `FileAttribution`, `AttributionEvidence`, `IPAttributionCertificate` interfaces to dashboard types. Add `getIPAttributionCertificate(scanId)`, `getIPAttributions(certificateId)`, `getFileEvidence(certificateId, file)` to API client using the `tryApi` pattern.

**Step 1: Add types and API functions**

**Step 2: Commit**

```bash
git commit -m "feat(ip-attribution): add dashboard types and API client"
```

---

### Task 14: Dashboard Components

**Files:**
- Create: `apps/dashboard/components/provenance-bar.tsx`
- Create: `apps/dashboard/components/ip-attribution-card.tsx`
- Create: `apps/dashboard/components/attribution-table.tsx`
- Create: `apps/dashboard/__tests__/provenance-bar.test.tsx`
- Create: `apps/dashboard/__tests__/ip-attribution-card.test.tsx`
- Create: `apps/dashboard/__tests__/attribution-table.test.tsx`

**Context:** Follow existing component patterns: `signal-bar.tsx` for simple bars, `decision-trace-card.tsx` for server component pattern with `getDecisionTrace` fetch. Tests use `// @vitest-environment jsdom` pragma.

**Step 1: Create provenance-bar.tsx**

Horizontal stacked bar. Props: `classifications` object with files/loc/percentage per type. Color map: human=green, ai-generated=red, ai-assisted=amber, mixed=purple, unknown=gray.

**Step 2: Create ip-attribution-card.tsx**

Async server component. Fetches `getIPAttributionCertificate(scanId)`. Returns null when absent. Renders: summary row (total files, AI ratio), provenance bar, tool breakdown mini-table, download links (PDF/SPDX/CycloneDX — show badges only when URL non-null).

**Step 3: Create attribution-table.tsx**

Client component ("use client"). Props: `certificateId`. Fetches `getIPAttributions(certificateId)` on mount. Sortable table with columns: File, Classification (color badge), Confidence (bar), Tool, Source, LOC.

**Step 4: Write component tests**

11 tests across 3 files covering rendering, null handling, badge colors, bar proportions, download links, sorting.

**Step 5: Commit**

```bash
git commit -m "feat(ip-attribution): add dashboard components and tests"
```

---

### Task 15: Dashboard Page Integration

**Files:**
- Modify: `apps/dashboard/app/(dashboard)/scans/[id]/page.tsx` (or wherever scan detail lives)

**Context:** Add `<IPAttributionCard scanId={scan.id} />` to the scan detail page, conditionally rendered.

**Step 1: Import and render**

Add import for `IPAttributionCard`. Place it after the existing certificate section. The component self-handles the null case (returns null when no certificate exists).

**Step 2: Commit**

```bash
git commit -m "feat(ip-attribution): add IP attribution to scan detail page"
```

---

### Task 16: Schema Compatibility Tests

**Files:**
- Create: `packages/compliance/src/__tests__/ip-attribution-schema-compat.test.ts`

**Context:** Validate that the generated documents conform to expected shapes.

**Step 1: Write tests**

Test cases: IPAttributionDocument has all required top-level keys; SPDX output starts with `SPDXVersion: SPDX-2.3`; CycloneDX output parses with `bomFormat: "CycloneDX"` and `specVersion: "1.5"`.

**Step 2: Run and commit**

```bash
git commit -m "test(ip-attribution): add schema compatibility tests"
```

---

**Summary:** 16 tasks, ~87 tests across 14 test files. Estimated: 12 commits covering types → adapters → reconciler → certificate → SPDX → CycloneDX → PDF → schema → service → exports → routes → pipeline wiring → dashboard types → dashboard components → page integration → schema compat tests.

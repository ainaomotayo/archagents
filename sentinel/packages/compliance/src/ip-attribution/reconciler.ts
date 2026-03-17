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

  // Rule 2: clear human — AI detector says human (prob < 0.15 -> confidence > 0.85)
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

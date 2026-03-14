# IP Attribution Certificate Design

**Goal:** Generate a dedicated, HMAC-signed document linking each file to its provenance (human-written, Copilot, Claude, etc.) with confidence scores, reconciling multiple evidence sources via Bayesian fusion with rule-based overrides.

**Status:** Approved

**Date:** 2026-03-14

---

## Background

The AI detector agent currently flags files as AI-generated with a probability score, and the decision trace captures per-signal decomposition. But there is no single attestable artifact that maps every file in a scan to its provenance — combining detection signals, pre-declared metadata, git history, and license analysis into one authoritative, signable document.

Enterprise IP counsel, M&A due diligence, and regulatory auditors need a document they can hand to legal review that answers: "For each file in this codebase, who or what wrote it, with what confidence, and based on what evidence?"

This design adds:
- File-level provenance classification with multi-source reconciliation
- A signed IP Attribution Certificate (JSON + PDF + SPDX + CycloneDX)
- Normalized evidence storage for cross-scan, cross-project enterprise reporting
- Integration with the existing compliance certificate (layered summary)

## Decisions

| Dimension | Choice | Rationale |
|-----------|--------|-----------|
| Granularity | File-level | Maps to existing FileSignal/DecisionTrace data; sufficient for compliance/legal; extensible to function-level later |
| Architecture | Layered (own model + summary in compliance cert) | Legal teams get a dedicated provenance document; compliance teams get a unified certificate |
| Conflict resolution | Highest-confidence-wins via Bayesian fusion + rule overrides | Most defensible in legal/audit context; transparent confidence chain |
| Output formats | JSON + PDF + SPDX 2.3 + CycloneDX 1.5 | JSON for API/machines, PDF for legal, SBOM formats for supply chain tooling |
| Algorithm | Bayesian posterior fusion with rule-based fast paths | Statistical rigor for ambiguous cases, deterministic handling for obvious cases |
| Data model | Normalized (FileAttribution + AttributionEvidence) + signed document | Relational queryability for enterprise reporting + self-contained signable artifact |
| Pipeline | Synchronous JSON generation + async PDF/SPDX/CycloneDX export | JSON immediately available with scan; heavy exports don't block scan path |
| Code organization | Module within compliance package | Leverages existing DecisionTrace, AI metrics, evidence chain, PDF infrastructure |

---

## Section 1: Data Model

### Prisma Models

#### FileAttribution

One row per file per scan. The final reconciled classification.

```prisma
model FileAttribution {
  id              String   @id @default(uuid()) @db.Uuid
  certificateId   String   @map("certificate_id") @db.Uuid
  scanId          String   @map("scan_id") @db.Uuid
  orgId           String   @map("org_id") @db.Uuid

  file            String
  classification  String   // "human" | "ai-generated" | "ai-assisted" | "mixed" | "unknown"
  confidence      Float    // 0.0-1.0, final reconciled confidence
  primarySource   String   @map("primary_source") // "ai-detector" | "declared" | "git" | "license"
  toolName        String?  @map("tool_name")
  toolModel       String?  @map("tool_model")
  loc             Int      @default(0)

  createdAt       DateTime @default(now()) @map("created_at")

  certificate     IPAttributionCertificate @relation(fields: [certificateId], references: [id])
  evidence        AttributionEvidence[]

  @@index([scanId])
  @@index([orgId, classification])
  @@index([orgId, toolName])
  @@map("file_attributions")
}
```

#### AttributionEvidence

One row per source per file. Raw evidence from each provenance source.

```prisma
model AttributionEvidence {
  id              String   @id @default(uuid()) @db.Uuid
  attributionId   String   @map("attribution_id") @db.Uuid

  source          String   // "ai-detector" | "declared" | "git" | "license"
  classification  String
  confidence      Float
  rawEvidence     Json     @map("raw_evidence")

  createdAt       DateTime @default(now()) @map("created_at")

  attribution     FileAttribution @relation(fields: [attributionId], references: [id])

  @@index([attributionId])
  @@map("attribution_evidence")
}
```

#### IPAttributionCertificate

The signed certificate artifact. One per scan.

```prisma
model IPAttributionCertificate {
  id              String   @id @default(uuid()) @db.Uuid
  scanId          String   @unique @map("scan_id") @db.Uuid
  orgId           String   @map("org_id") @db.Uuid

  totalFiles      Int      @map("total_files")
  humanFiles      Int      @map("human_files")
  aiGeneratedFiles Int     @map("ai_generated_files")
  aiAssistedFiles Int      @map("ai_assisted_files")
  mixedFiles      Int      @map("mixed_files")
  unknownFiles    Int      @map("unknown_files")
  overallAiRatio  Float    @map("overall_ai_ratio")

  toolBreakdown   Json     @map("tool_breakdown")
  document        Json
  signature       String

  pdfUrl          String?  @map("pdf_url")
  spdxUrl         String?  @map("spdx_url")
  cyclonedxUrl    String?  @map("cyclonedx_url")

  createdAt       DateTime @default(now()) @map("created_at")

  scan            Scan     @relation(fields: [scanId], references: [id])
  attributions    FileAttribution[]

  @@index([orgId])
  @@map("ip_attribution_certificates")
}
```

The `Scan` model gets a reverse relation: `ipAttributionCertificate IPAttributionCertificate?`

### Classification Taxonomy

| Classification | Meaning | Criteria |
|---------------|---------|----------|
| `human` | Written entirely by humans | Confidence > 0.7 that NOT AI |
| `ai-generated` | Primarily AI-generated | AI confidence > 0.7, tool identified |
| `ai-assisted` | Human-written with AI help | AI confidence 0.3-0.7 OR declared as assisted |
| `mixed` | Multiple authors/tools | Conflicting sources with similar confidence |
| `unknown` | Insufficient evidence | No strong signal from any source |

### Compliance Certificate Integration

The existing `ComplianceCertificate.compliance` JSON field gets a new `ipAttribution` key:

```typescript
compliance: {
  // ... existing fields ...
  ipAttribution?: {
    certificateId: string;
    overallAiRatio: number;
    humanFiles: number;
    aiGeneratedFiles: number;
    aiAssistedFiles: number;
    topTools: Array<{ tool: string; percentage: number }>;
    generatedAt: string;
  }
}
```

---

## Section 2: Reconciliation Algorithm

### Source Adapters

Each provenance source produces a standardized `SourceEvidence`:

```typescript
interface SourceEvidence {
  source: "ai-detector" | "declared" | "git" | "license";
  classification: Classification;
  confidence: number;
  toolName: string | null;
  toolModel: string | null;
  rawEvidence: Record<string, unknown>;
}
```

**AI Detector adapter:** Reads `DecisionTrace` + `Finding`.

```
if aiProbability >= 0.70 → "ai-generated", confidence: aiProbability
if aiProbability >= 0.30 → "ai-assisted", confidence: aiProbability
if aiProbability < 0.30  → "human", confidence: 1 - aiProbability
toolName: from DecisionTrace.toolName or dominant marker
```

**Declared Metadata adapter:** Reads enriched `DecisionTrace` or `.sentinel-ai.yml` match.

```
if declared tool matches file scope:
  → "ai-generated", confidence: 0.85 (configurable)
  toolName/toolModel from declaration
if no declaration matches:
  → null (no evidence emitted)
```

**Git Metadata adapter:** Reads `gitMetadata` from scan payload.

```
if co-author trailer matches known AI tool → "ai-assisted", confidence: 0.90
if commit author matches known bot        → "ai-generated", confidence: 0.95
if all blame authors are same human       → "human", confidence: 0.60
if mixed blame authors                    → "mixed", confidence: 0.50
if no git metadata for file               → null
```

**License/IP adapter:** Reads `LicenseFinding`.

```
if similarityScore > 0.80 to known OSS → "human", confidence: similarityScore
else → null
```

### Reconciliation: Bayesian Fusion with Rule Overrides

Pure function: `reconcile(evidenceList: SourceEvidence[]): ReconciledAttribution`

**Step 1 — Rule-based fast paths:**

```
Rule 1: Two+ independent sources agree on AI with confidence > 0.75
  → use highest-confidence source's classification, SKIP fusion

Rule 2: AI detector < 0.15 AND no declarations AND no git AI evidence
  → "human", confidence: 1 - aiProbability, SKIP fusion

Rule 3: No evidence at all
  → "unknown", confidence: 0.0, SKIP fusion
```

**Step 2 — Bayesian posterior fusion (ambiguous cases):**

```
prior = orgBaseRate (from AIMetricsSnapshot, default 0.30)

for each source:
  if source says AI:
    likelihood_ai = source.confidence
    likelihood_human = 1 - source.confidence
  else if source says human:
    likelihood_ai = 1 - source.confidence
    likelihood_human = source.confidence
  else: continue

  posterior_ai = prior × likelihood_ai
  posterior_human = (1 - prior) × likelihood_human
  prior = posterior_ai / (posterior_ai + posterior_human)

finalProbability = prior
→ >= 0.70: "ai-generated"
→ >= 0.30: "ai-assisted"
→ < 0.30:  "human"
```

**Step 3 — Conflict detection:**

```
if max_confidence - second_max_confidence < 0.15 AND they disagree:
  → "mixed", conflictingSources: true
```

**Step 4 — Tool attribution:** First non-null toolName from sources, ordered by confidence DESC.

### Output

```typescript
interface ReconciledAttribution {
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
```

---

## Section 3: Certificate Generation & Signing

### IPAttributionDocument Structure

```typescript
interface IPAttributionDocument {
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
      human:       { files: number; loc: number; percentage: number };
      aiGenerated: { files: number; loc: number; percentage: number };
      aiAssisted:  { files: number; loc: number; percentage: number };
      mixed:       { files: number; loc: number; percentage: number };
      unknown:     { files: number; loc: number; percentage: number };
    };
    overallAiRatio: number;
    avgConfidence: number;
    conflictingFiles: number;
  };

  toolBreakdown: Array<{
    tool: string;
    model: string | null;
    files: number;
    loc: number;
    percentage: number;
    confirmedCount: number;
    estimatedCount: number;
  }>;

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
```

### Generation Flow

```typescript
function generateIPAttributionCertificate(
  scan: { id, projectId, commitHash, branch, author, timestamp },
  attributions: ReconciledAttribution[],
  orgBaseRate: number,
  agentVersions: Record<string, string>,
  evidenceChainHash: string,
  secret: string,
): { document: IPAttributionDocument; signature: string }
```

1. Compute aggregate stats from attributions
2. Compute tool breakdown (confirmed vs estimated)
3. Build `files` array sorted alphabetically by path (deterministic for reproducible signatures)
4. Populate `methodology` with algorithm parameters
5. Set `signature: ""`, serialize to JSON, HMAC-SHA256 with org secret
6. Return signed document

### Verification

```typescript
function verifyIPAttributionCertificate(documentJson: string, secret: string): boolean
```

Parse JSON, clear signature, recompute HMAC, compare.

### Compliance Certificate Embedding

After IP attribution certificate generation, its summary is embedded into the compliance certificate's `compliance.ipAttribution` field before the compliance certificate is signed.

---

## Section 4: Export Formats

### PDF Report

React PDF template via `generateIPAttributionPdf(data: IPAttributionReportData): Promise<Buffer>`.

Layout includes: header with certificate ID/date, project metadata, provenance summary with stacked bars, tool attribution table, file-level attribution table (path, classification, confidence, tool, source), methodology section, and HMAC signature footer.

### SPDX 2.3 Export

Tag-value format. Maps Sentinel concepts to SPDX elements:

| Sentinel Concept | SPDX Element |
|-----------------|--------------|
| Each file | `File` with `fileName`, `SPDXID` |
| Classification | `File.comment` with structured key=value |
| AI tool attribution | `Annotation` (type: REVIEW) on File |
| Overall certificate | `Document` with namespace + creator |
| Signature | `Document.comment` |

Generator: `generateSpdxExport(document: IPAttributionDocument): string`

### CycloneDX 1.5 Export

JSON format. Uses CycloneDX's native `evidence.identity` on components:

| Sentinel Concept | CycloneDX Element |
|-----------------|-------------------|
| Each file | `component` (type: file) |
| Classification | `component.evidence.identity` with confidence |
| Tool attribution | `evidence.identity.methods[].technique` + value |
| Certificate metadata | `metadata.properties` with custom sentinel: keys |

Generator: `generateCycloneDxExport(document: IPAttributionDocument): string`

### Async Export Pipeline

JSON certificate generated synchronously with scan. PDF/SPDX/CycloneDX generated async via event:

```
worker publishes "sentinel.ip-attribution.export" { scanId, orgId, certificateId }
handler generates all three → uploads to storage → updates pdfUrl/spdxUrl/cyclonedxUrl
```

---

## Section 5: API Endpoints & Service Layer

### Service

```typescript
export class IPAttributionService {
  constructor(private db: any, private secret: string) {}

  async generateForScan(scanId, orgId, scan): Promise<string>
  async getByScanId(scanId): Promise<IPAttributionCertificate | null>
  async getDocument(certificateId): Promise<IPAttributionDocument | null>
  async getAttributions(certificateId): Promise<FileAttribution[]>
  async getAttributionWithEvidence(certificateId, file): Promise<...>
  async getOrgToolBreakdown(orgId, since): Promise<ToolBreakdownEntry[]>
  async getOrgAiRatioTrend(orgId, days): Promise<Array<{ date, aiRatio }>>
  async getFileHistory(orgId, filePath): Promise<Array<{ scanId, classification, confidence, date }>>
}
```

### API Routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/v1/scans/:id/ip-certificate` | Certificate for a scan |
| `GET` | `/v1/ip-certificates/:id` | Certificate by ID |
| `GET` | `/v1/ip-certificates/:id/document` | Full signed JSON |
| `POST` | `/v1/ip-certificates/:id/verify` | Verify signature |
| `GET` | `/v1/ip-certificates/:id/attributions` | File-level attributions |
| `GET` | `/v1/ip-certificates/:id/attributions/:file` | Single file + evidence |
| `GET` | `/v1/ip-certificates/:id/exports/pdf` | Download PDF |
| `GET` | `/v1/ip-certificates/:id/exports/spdx` | Download SPDX |
| `GET` | `/v1/ip-certificates/:id/exports/cyclonedx` | Download CycloneDX |
| `GET` | `/v1/org/ip-attribution/tool-breakdown` | Org-wide tool breakdown |
| `GET` | `/v1/org/ip-attribution/ai-trend` | Org AI ratio trend |
| `GET` | `/v1/org/ip-attribution/file-history` | File provenance across scans |

All behind `authHook` + `withTenant`.

### Dashboard Components

- **`ip-attribution-card.tsx`** — Server component on scan detail page. Summary stats, provenance bars, tool breakdown, download links.
- **`attribution-table.tsx`** — Client component. Sortable/filterable file-level table with evidence expansion.
- **`provenance-bar.tsx`** — Horizontal stacked bar (human/ai-generated/ai-assisted/mixed/unknown).

---

## Section 6: Git Metadata Extraction

### Extended Scan Payload

```typescript
// Added to SentinelDiffPayload:
gitMetadata?: {
  commitAuthor: string;
  commitEmail: string;
  coAuthorTrailers: string[];
  files: Array<{
    path: string;
    authors: string[];
    coAuthors: string[];
    lastModifiedBy: string;
    commitMessages: string[];
  }>;
};
```

Collected at CLI/CI submission time via `git log` and `git blame`. Worker does not need repo access.

### Known AI Tool Patterns

```typescript
const AI_COAUTHOR_PATTERNS = [
  { pattern: /copilot|github copilot/i, tool: "copilot" },
  { pattern: /claude|anthropic/i, tool: "claude" },
  { pattern: /cursor/i, tool: "cursor" },
  { pattern: /cody|sourcegraph/i, tool: "cody" },
  { pattern: /tabnine/i, tool: "tabnine" },
  { pattern: /amazon\s*q|codewhisperer/i, tool: "amazon-q" },
  { pattern: /gemini|google/i, tool: "gemini" },
];

const BOT_AUTHOR_PATTERNS = [
  { pattern: /dependabot\[bot\]/i, tool: "dependabot" },
  { pattern: /renovate\[bot\]/i, tool: "renovate" },
  { pattern: /snyk-bot/i, tool: "snyk" },
  { pattern: /github-actions\[bot\]/i, tool: "github-actions" },
];
```

### Missing Metadata Handling

If `gitMetadata` is absent (older CLI, non-git repos), the git adapter returns null for all files. The reconciler proceeds with remaining sources. The `methodology.sources` array in the signed document reflects which adapters ran.

---

## Section 7: Testing Plan

### Unit Tests (pure functions, no DB)

| Test file | Count | Coverage |
|-----------|-------|----------|
| `ip-attribution-reconciler.test.ts` | ~12 | Bayesian fusion, rule overrides, conflict detection, org base rate |
| `ip-attribution-classifier.test.ts` | ~6 | Classification thresholds, boundary edges, mixed classification |
| `ip-attribution-adapters.test.ts` | ~14 | All 4 adapters: AI detector, declared, git, license |
| `ip-attribution-certificate.test.ts` | ~8 | Document generation, signing, verification, summary embedding |
| `ip-attribution-spdx.test.ts` | ~5 | Tag-value format, file entries, annotations, headers |
| `ip-attribution-cyclonedx.test.ts` | ~5 | JSON schema, evidence.identity mapping, metadata properties |
| `git-metadata-extract.test.ts` | ~7 | Co-author patterns, bot detection, blame, case-insensitive, graceful null |

### Integration Tests (with DB)

| Test file | Count | Coverage |
|-----------|-------|----------|
| `ip-attribution-service.test.ts` | ~8 | End-to-end generation, cross-scan queries, evidence chain, idempotency |
| `ip-attribution-routes.test.ts` | ~8 | All endpoints, 404 handling, signature verification, auth |

### Component Tests (dashboard)

| Test file | Count | Coverage |
|-----------|-------|----------|
| `ip-attribution-card.test.tsx` | ~4 | Summary stats, download links, hidden when absent |
| `attribution-table.test.tsx` | ~4 | File rows, evidence expansion, sorting, filtering |
| `provenance-bar.test.tsx` | ~3 | Proportions, color coding, zero segments |

### Schema Compatibility Tests

| Test file | Count | Coverage |
|-----------|-------|----------|
| `ip-attribution-schema-compat.test.ts` | ~3 | Document shape, SPDX headers, CycloneDX format |

**Total: ~87 tests across 14 test files.**

---

## Out of Scope

- Function-level granularity (file-level first; model extensible later)
- Real-time attribution streaming (certificates generated at scan completion)
- Custom AI tool pattern configuration per org (hardcoded registry for now)
- SPDX JSON/RDF serialization formats (tag-value only initially)
- Historical backfill of existing scans
- IDE plugin telemetry as a provenance source
- Raw prompt content storage (only prompt hash from DecisionTrace)

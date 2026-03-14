import type { ReconciledAttribution, SourceEvidence, GitMetadata, IPAttributionDocument } from "./types.js";
import { adaptAIDetector, adaptDeclared, adaptGit, adaptLicense, type DeclaredData } from "./adapters.js";
import { reconcile } from "./reconciler.js";
import { generateIPAttributionCertificate } from "./certificate.js";
import { parseSentinelAIConfig, matchDeclaredTool } from "../decision-trace/enrichment.js";

interface ScanData {
  id: string;
  projectId: string;
  orgId: string;
  commitHash: string;
  branch: string;
  author: string;
  metadata: any;
}

export class IPAttributionService {
  constructor(private db: any) {}

  async generateForScan(
    scanId: string,
    orgId: string,
    secret: string,
    orgBaseRate = 0.30,
  ): Promise<string | null> {
    const scan: ScanData | null = await this.db.scan.findUnique({
      where: { id: scanId },
      select: {
        id: true,
        projectId: true,
        orgId: true,
        commitHash: true,
        branch: true,
        author: true,
        metadata: true,
      },
    });
    if (!scan) return null;

    // Gather all findings for this scan with their decision traces
    const findings = await this.db.finding.findMany({
      where: { scanId },
      select: {
        id: true,
        file: true,
        agentName: true,
        rawData: true,
        decisionTrace: {
          select: {
            overallScore: true,
            toolName: true,
            modelVersion: true,
            signals: true,
          },
        },
      },
    });

    // Collect unique files
    const fileSet = new Set<string>();
    for (const f of findings) {
      fileSet.add(f.file);
    }

    // Parse declared metadata
    const declaredConfig = parseSentinelAIConfig(scan.metadata);
    const gitMetadata: GitMetadata | null = scan.metadata?.gitMetadata ?? null;

    // Build per-file evidence
    const attributions: ReconciledAttribution[] = [];
    const fileLocs: Array<{ path: string; loc: number }> = [];

    for (const file of fileSet) {
      const evidence: SourceEvidence[] = [];

      // AI detector source -- find ai-detector findings for this file
      const aiFindings = findings.filter(
        (f: any) => f.file === file && f.agentName === "ai-detector" && f.decisionTrace,
      );
      if (aiFindings.length > 0) {
        const best = aiFindings[0];
        const trace = best.decisionTrace;
        const adapted = adaptAIDetector(file, {
          aiProbability: trace.overallScore,
          toolName: trace.toolName,
          dominantSignal: (trace.signals as any)?.dominantSignal ?? "unknown",
          signals: trace.signals as Record<string, unknown>,
        });
        if (adapted) evidence.push(adapted);
      }

      // Declared source
      const declaredTool = matchDeclaredTool(file, declaredConfig);
      if (declaredTool) {
        const adapted = adaptDeclared(file, declaredTool as DeclaredData);
        if (adapted) evidence.push(adapted);
      }

      // Git source
      if (gitMetadata) {
        const adapted = adaptGit(file, gitMetadata);
        if (adapted) evidence.push(adapted);
      }

      // License source -- find ip-license findings
      const licenseFindings = findings.filter(
        (f: any) => f.file === file && f.agentName === "ip-license",
      );
      if (licenseFindings.length > 0) {
        const licData = licenseFindings[0].rawData;
        if (licData && typeof licData === "object") {
          const adapted = adaptLicense(file, {
            similarityScore: (licData as any).similarityScore ?? 0,
            sourceMatch: (licData as any).sourceMatch ?? null,
            licenseDetected: (licData as any).licenseDetected ?? null,
          });
          if (adapted) evidence.push(adapted);
        }
      }

      // Reconcile
      const reconciled = reconcile(file, evidence, orgBaseRate);
      attributions.push(reconciled);

      // Estimate LOC from raw data
      const fileFinding = findings.find((f: any) => f.file === file);
      const loc = (fileFinding?.rawData as any)?.loc ?? 0;
      fileLocs.push({ path: file, loc });
    }

    if (attributions.length === 0) return null;

    // Collect agent versions
    const agentVersions: Record<string, string> = {};
    for (const f of findings) {
      if (!agentVersions[f.agentName]) {
        agentVersions[f.agentName] = (f.rawData as any)?.agentVersion ?? "unknown";
      }
    }

    // Generate evidence chain hash
    const { createHash } = await import("node:crypto");
    const evidenceChainHash = createHash("sha256")
      .update(JSON.stringify(attributions.map((a) => ({ file: a.file, classification: a.classification, confidence: a.confidence }))))
      .digest("hex");

    // Generate certificate
    const document = generateIPAttributionCertificate(
      {
        scanId,
        projectId: scan.projectId,
        repository: scan.metadata?.repository ?? scan.projectId,
        commitHash: scan.commitHash,
        branch: scan.branch,
        author: scan.author,
        timestamp: new Date().toISOString(),
      },
      attributions,
      fileLocs,
      orgBaseRate,
      agentVersions,
      evidenceChainHash,
      secret,
    );

    // Persist
    const cert = await this.db.iPAttributionCertificate.create({
      data: {
        scanId,
        orgId,
        projectId: scan.projectId,
        document: document as any,
        signature: document.signature,
        overallAiRatio: document.summary.overallAiRatio,
        totalFiles: document.summary.totalFiles,
        totalLoc: document.summary.totalLoc,
        conflictingFiles: document.summary.conflictingFiles,
      },
    });

    // Persist file attributions + evidence
    for (const attr of attributions) {
      const fa = await this.db.fileAttribution.create({
        data: {
          certificateId: cert.id,
          file: attr.file,
          classification: attr.classification,
          confidence: attr.confidence,
          primarySource: attr.primarySource,
          toolName: attr.toolName,
          toolModel: attr.toolModel,
          loc: fileLocs.find((f) => f.path === attr.file)?.loc ?? 0,
          fusionMethod: attr.fusionMethod,
          conflicting: attr.conflictingSources,
        },
      });

      // Persist evidence rows
      if (attr.evidence.length > 0) {
        await this.db.attributionEvidence.createMany({
          data: attr.evidence.map((e) => ({
            attributionId: fa.id,
            source: e.source,
            classification: e.classification,
            confidence: e.confidence,
            toolName: e.toolName,
            toolModel: e.toolModel,
            rawEvidence: e.rawEvidence,
          })),
        });
      }
    }

    return cert.id;
  }

  async getByScanId(scanId: string): Promise<IPAttributionDocument | null> {
    const cert = await this.db.iPAttributionCertificate.findUnique({
      where: { scanId },
    });
    if (!cert) return null;
    return cert.document as IPAttributionDocument;
  }

  async getAttributions(scanId: string) {
    const cert = await this.db.iPAttributionCertificate.findUnique({
      where: { scanId },
      select: { id: true },
    });
    if (!cert) return [];
    return this.db.fileAttribution.findMany({
      where: { certificateId: cert.id },
      orderBy: { file: "asc" },
    });
  }

  async getAttributionWithEvidence(scanId: string, file: string) {
    const cert = await this.db.iPAttributionCertificate.findUnique({
      where: { scanId },
      select: { id: true },
    });
    if (!cert) return null;
    return this.db.fileAttribution.findFirst({
      where: { certificateId: cert.id, file },
      include: { evidence: true },
    });
  }

  async getOrgToolBreakdown(orgId: string) {
    const certs = await this.db.iPAttributionCertificate.findMany({
      where: { orgId },
      select: { document: true },
    });
    const breakdown = new Map<string, { files: number; loc: number }>();
    for (const cert of certs) {
      const doc = cert.document as IPAttributionDocument;
      for (const tb of doc.toolBreakdown) {
        const existing = breakdown.get(tb.tool) ?? { files: 0, loc: 0 };
        existing.files += tb.files;
        existing.loc += tb.loc;
        breakdown.set(tb.tool, existing);
      }
    }
    return [...breakdown.entries()].map(([tool, data]) => ({ tool, ...data })).sort((a, b) => b.files - a.files);
  }

  async getFileHistory(orgId: string, file: string) {
    return this.db.fileAttribution.findMany({
      where: {
        file,
        certificate: { orgId },
      },
      include: {
        certificate: {
          select: { scanId: true, createdAt: true },
        },
      },
      orderBy: { certificate: { createdAt: "desc" } },
    });
  }
}

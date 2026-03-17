import type { IPAttributionDocument } from "./types.js";

export function generateSpdxExport(document: IPAttributionDocument): string {
  const lines: string[] = [];

  // Document header
  lines.push("SPDXVersion: SPDX-2.3");
  lines.push("DataLicense: CC0-1.0");
  lines.push(`SPDXID: SPDXRef-DOCUMENT`);
  lines.push(`DocumentName: ip-attribution-${document.subject.scanId}`);
  lines.push(`DocumentNamespace: https://sentinel.dev/spdx/${document.id}`);
  lines.push(`Creator: Tool: Sentinel IP Attribution v${document.methodology.algorithmVersion}`);
  lines.push(`Created: ${document.provenance.generatedAt}`);
  lines.push(`DocumentComment: <text>IP Attribution Certificate ${document.id}. Signature: ${document.signature}</text>`);
  lines.push("");

  // Package (the repository)
  lines.push(`PackageName: ${document.subject.repository}`);
  lines.push(`SPDXID: SPDXRef-Package`);
  lines.push(`PackageVersion: ${document.subject.commitHash}`);
  lines.push(`PackageDownloadLocation: NOASSERTION`);
  lines.push(`FilesAnalyzed: true`);
  lines.push(`PackageComment: <text>AI ratio: ${(document.summary.overallAiRatio * 100).toFixed(1)}%, ${document.summary.totalFiles} files analyzed</text>`);
  lines.push("");

  // File entries
  for (const file of document.files) {
    const spdxId = `SPDXRef-${sanitizeSpdxId(file.path)}`;
    lines.push(`FileName: ./${file.path}`);
    lines.push(`SPDXID: ${spdxId}`);
    lines.push(`FileChecksum: SHA256: ${document.provenance.evidenceChainHash}`);
    lines.push(`FileComment: <text>Classification: ${file.classification} (confidence: ${(file.confidence * 100).toFixed(1)}%, source: ${file.primarySource}${file.toolName ? `, tool: ${file.toolName}` : ""})</text>`);
    lines.push("");

    // Annotation for classification
    lines.push(`Annotator: Tool: Sentinel`);
    lines.push(`AnnotationDate: ${document.provenance.generatedAt}`);
    lines.push(`AnnotationComment: <text>IP Attribution: ${file.classification}${file.toolName ? ` (${file.toolName})` : ""}, fusion: ${file.fusionMethod}, conflicting: ${file.conflicting}</text>`);
    lines.push(`AnnotationType: REVIEW`);
    lines.push(`SPDXREF: ${spdxId}`);
    lines.push("");
  }

  return lines.join("\n");
}

function sanitizeSpdxId(path: string): string {
  return path.replace(/[^a-zA-Z0-9.-]/g, "-");
}

import type { IPAttributionDocument } from "./types.js";

export function generateCycloneDxExport(document: IPAttributionDocument): string {
  const bom = {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    serialNumber: `urn:uuid:${document.id}`,
    metadata: {
      timestamp: document.provenance.generatedAt,
      tools: [
        {
          vendor: "Sentinel",
          name: "IP Attribution",
          version: document.methodology.algorithmVersion,
        },
      ],
      properties: [
        { name: "sentinel:certificateId", value: document.id },
        { name: "sentinel:signature", value: document.signature },
        { name: "sentinel:scanId", value: document.subject.scanId },
        { name: "sentinel:overallAiRatio", value: String(document.summary.overallAiRatio) },
        { name: "sentinel:evidenceChainHash", value: document.provenance.evidenceChainHash },
      ],
    },
    components: document.files.map((file, idx) => ({
      type: "file",
      "bom-ref": `file-${idx}`,
      name: file.path,
      description: `Classification: ${file.classification}${file.toolName ? ` (${file.toolName})` : ""}`,
      properties: [
        { name: "sentinel:classification", value: file.classification },
        { name: "sentinel:confidence", value: String(file.confidence) },
        { name: "sentinel:primarySource", value: file.primarySource },
        { name: "sentinel:fusionMethod", value: file.fusionMethod },
        { name: "sentinel:conflicting", value: String(file.conflicting) },
        ...(file.toolName ? [{ name: "sentinel:toolName", value: file.toolName }] : []),
        ...(file.toolModel ? [{ name: "sentinel:toolModel", value: file.toolModel }] : []),
      ],
      evidence: {
        identity: {
          field: "name",
          confidence: file.confidence,
          methods: file.evidence.map((e) => ({
            technique: e.source,
            confidence: e.confidence,
            value: e.classification,
          })),
        },
      },
    })),
  };

  return JSON.stringify(bom, null, 2);
}

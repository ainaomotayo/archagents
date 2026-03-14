import {
  IPAttributionService,
  verifyIPAttributionCertificate,
  generateSpdxExport,
  generateCycloneDxExport,
  generateIPAttributionPdf,
  type IPAttributionReportData,
} from "@sentinel/compliance";

interface IPAttributionRouteDeps {
  db: any;
  secret: string;
}

export function buildIPAttributionRoutes(deps: IPAttributionRouteDeps) {
  const service = new IPAttributionService(deps.db);

  return {
    getByScan: async (scanId: string) => {
      const doc = await service.getByScanId(scanId);
      if (!doc) return { error: "Not found", statusCode: 404 };
      return doc;
    },

    getDocument: async (scanId: string) => {
      const doc = await service.getByScanId(scanId);
      if (!doc) return { error: "Not found", statusCode: 404 };
      return { document: doc, verified: verifyIPAttributionCertificate(JSON.stringify(doc), deps.secret) };
    },

    verify: async (scanId: string) => {
      const doc = await service.getByScanId(scanId);
      if (!doc) return { error: "Not found", statusCode: 404 };
      return { verified: verifyIPAttributionCertificate(JSON.stringify(doc), deps.secret) };
    },

    getAttributions: async (scanId: string) => {
      return service.getAttributions(scanId);
    },

    getFileEvidence: async (scanId: string, file: string) => {
      const result = await service.getAttributionWithEvidence(scanId, file);
      if (!result) return { error: "Not found", statusCode: 404 };
      return result;
    },

    downloadSpdx: async (scanId: string) => {
      const doc = await service.getByScanId(scanId);
      if (!doc) return { error: "Not found", statusCode: 404 };
      return { content: generateSpdxExport(doc), contentType: "text/plain" };
    },

    downloadCycloneDx: async (scanId: string) => {
      const doc = await service.getByScanId(scanId);
      if (!doc) return { error: "Not found", statusCode: 404 };
      return { content: generateCycloneDxExport(doc), contentType: "application/json" };
    },

    downloadPdf: async (scanId: string) => {
      const doc = await service.getByScanId(scanId);
      if (!doc) return { error: "Not found", statusCode: 404 };
      const reportData: IPAttributionReportData = {
        certificateId: doc.id,
        generatedAt: doc.provenance.generatedAt,
        subject: doc.subject,
        summary: doc.summary,
        toolBreakdown: doc.toolBreakdown,
        files: doc.files,
        methodology: doc.methodology,
        signature: doc.signature,
        evidenceChainHash: doc.provenance.evidenceChainHash,
      };
      const buffer = await generateIPAttributionPdf(reportData);
      return { content: buffer, contentType: "application/pdf" };
    },

    getOrgToolBreakdown: async (orgId: string) => {
      return service.getOrgToolBreakdown(orgId);
    },

    getFileHistory: async (orgId: string, file: string) => {
      return service.getFileHistory(orgId, file);
    },

    getOrgAiTrend: async (orgId: string, days: number) => {
      return service.getOrgAiRatioTrend(orgId, days);
    },

    generate: async (scanId: string, orgId: string) => {
      const certId = await service.generateForScan(scanId, orgId, deps.secret);
      if (!certId) return { error: "No findings to attribute", statusCode: 404 };
      return { certificateId: certId };
    },
  };
}

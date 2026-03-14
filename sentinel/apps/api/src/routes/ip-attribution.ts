import {
  IPAttributionService,
  verifyIPAttributionCertificate,
  generateSpdxExport,
  generateCycloneDxExport,
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

    getOrgToolBreakdown: async (orgId: string) => {
      return service.getOrgToolBreakdown(orgId);
    },

    getFileHistory: async (orgId: string, file: string) => {
      return service.getFileHistory(orgId, file);
    },

    generate: async (scanId: string, orgId: string) => {
      const certId = await service.generateForScan(scanId, orgId, deps.secret);
      if (!certId) return { error: "No findings to attribute", statusCode: 404 };
      return { certificateId: certId };
    },
  };
}

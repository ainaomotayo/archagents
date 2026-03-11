import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { ComplianceSummaryReport, type ComplianceSummaryData } from "./ComplianceSummaryReport.js";
import { AuditEvidenceReport, type AuditEvidenceData } from "./AuditEvidenceReport.js";
import { ExecutiveReport, type ExecutiveReportData } from "./ExecutiveReport.js";

export type { ComplianceSummaryData } from "./ComplianceSummaryReport.js";
export type { AuditEvidenceData, EvidenceItem } from "./AuditEvidenceReport.js";
export type { ExecutiveReportData } from "./ExecutiveReport.js";

export async function generateComplianceSummaryPdf(data: ComplianceSummaryData): Promise<Buffer> {
  return renderToBuffer(createElement(ComplianceSummaryReport, { data }) as any) as Promise<Buffer>;
}

export async function generateAuditEvidencePdf(data: AuditEvidenceData): Promise<Buffer> {
  return renderToBuffer(createElement(AuditEvidenceReport, { data }) as any) as Promise<Buffer>;
}

export async function generateExecutivePdf(data: ExecutiveReportData): Promise<Buffer> {
  return renderToBuffer(createElement(ExecutiveReport, { data }) as any) as Promise<Buffer>;
}

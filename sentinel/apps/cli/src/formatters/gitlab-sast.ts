import { randomUUID } from "node:crypto";
import type { Finding, SecurityFinding, DependencyFinding } from "@sentinel/shared";

export interface GitLabIdentifier {
  type: string;
  name: string;
  value: string;
}

export interface GitLabVulnerability {
  id: string;
  category: string;
  name: string;
  message: string;
  description: string;
  severity: string;
  confidence: string;
  location: {
    file: string;
    start_line: number;
    end_line: number;
  };
  identifiers: GitLabIdentifier[];
}

export interface GitLabSastReport {
  version: string;
  scan: {
    type: string;
    analyzer: {
      id: string;
      name: string;
      version: string;
    };
    status: string;
  };
  vulnerabilities: GitLabVulnerability[];
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function getIdentifiers(finding: Finding): GitLabIdentifier[] {
  const ids: GitLabIdentifier[] = [];

  if (finding.type === "security") {
    const sf = finding as SecurityFinding;
    if (sf.cweId) {
      ids.push({ type: "cwe", name: sf.cweId, value: sf.cweId });
    }
  }

  if (finding.type === "dependency") {
    const df = finding as DependencyFinding;
    if (df.cveId) {
      ids.push({ type: "cve", name: df.cveId, value: df.cveId });
    }
  }

  return ids;
}

function getName(finding: Finding): string {
  if (finding.type === "security") {
    return (finding as SecurityFinding).title;
  }
  if (finding.type === "dependency") {
    const df = finding as DependencyFinding;
    return `${df.package}: ${df.detail}`;
  }
  return `${finding.type} finding in ${finding.file}`;
}

function getDescription(finding: Finding): string {
  if (finding.type === "security") {
    return (finding as SecurityFinding).description;
  }
  if (finding.type === "dependency") {
    return (finding as DependencyFinding).detail;
  }
  return "";
}

export function formatGitLabSast(findings: Finding[]): GitLabSastReport {
  const vulnerabilities: GitLabVulnerability[] = findings.map((f) => ({
    id: randomUUID(),
    category: "sast",
    name: getName(f),
    message: getName(f),
    description: getDescription(f),
    severity: titleCase(f.severity),
    confidence: titleCase(f.confidence),
    location: {
      file: f.file,
      start_line: f.lineStart,
      end_line: f.lineEnd,
    },
    identifiers: getIdentifiers(f),
  }));

  return {
    version: "15.1.0",
    scan: {
      type: "sast",
      analyzer: {
        id: "sentinel",
        name: "Sentinel",
        version: "0.1.0",
      },
      status: "success",
    },
    vulnerabilities,
  };
}

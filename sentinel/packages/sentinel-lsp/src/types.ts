export interface SentinelFinding {
  id: string;
  scanId: string;
  orgId: string;
  agentName: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string | null;
  file: string;
  lineStart: number;
  lineEnd: number;
  title: string | null;
  description: string | null;
  remediation: string | null;
  cweId: string | null;
  confidence: number;
  suppressed: boolean;
  createdAt: string;
}

export interface SentinelProject {
  id: string;
  name: string;
  repoUrl: string | null;
}

export interface SentinelEvent {
  id: string;
  orgId: string;
  topic: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface LspServerConfig {
  apiUrl: string;
  apiToken: string;
  orgId: string;
  projectId?: string;
  topics?: string[];
}

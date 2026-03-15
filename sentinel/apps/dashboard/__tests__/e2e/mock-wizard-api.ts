/**
 * Lightweight mock API server for wizard E2E tests.
 * Maintains in-memory state with full DAG unlocking logic.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "http";

// ── Control definitions (mirrors backend) ──────────────────────────────
interface ControlDef {
  code: string;
  article: string;
  title: string;
  phase: number;
  dependencies: string[];
  requirements: { key: string; label: string; completed: boolean; optional: boolean }[];
  skipUnlocksDependents: boolean;
}

const CONTROLS: ControlDef[] = [
  { code: "AIA-9", article: "Art. 9", title: "Risk Management System", phase: 1, dependencies: [], requirements: [
    { key: "risk_identified", label: "Risks to health, safety, fundamental rights identified", completed: false, optional: false },
    { key: "risk_mitigated", label: "Risk mitigation measures documented", completed: false, optional: false },
    { key: "risk_residual", label: "Residual risk assessment performed", completed: false, optional: false },
    { key: "risk_testing", label: "Testing procedures defined for risk measures", completed: false, optional: false },
    { key: "risk_lifecycle", label: "Risk management covers entire lifecycle", completed: false, optional: false },
  ], skipUnlocksDependents: false },
  { code: "AIA-10", article: "Art. 10", title: "Data & Data Governance", phase: 1, dependencies: [], requirements: [
    { key: "data_quality", label: "Data quality criteria defined and measured", completed: false, optional: false },
    { key: "data_relevance", label: "Training data relevance and representativeness assessed", completed: false, optional: false },
    { key: "data_bias", label: "Bias examination and mitigation documented", completed: false, optional: false },
    { key: "data_gaps", label: "Data gaps identified and addressed", completed: false, optional: false },
    { key: "data_governance", label: "Data governance procedures established", completed: false, optional: false },
    { key: "data_privacy", label: "Personal data processing compliance verified", completed: false, optional: true },
  ], skipUnlocksDependents: false },
  { code: "AIA-12", article: "Art. 12", title: "Record-Keeping (Logging)", phase: 1, dependencies: [], requirements: [
    { key: "log_events", label: "Logged events and data points specified", completed: false, optional: false },
    { key: "log_retention", label: "Log retention periods defined", completed: false, optional: false },
    { key: "log_traceability", label: "Traceability of AI system decisions enabled", completed: false, optional: false },
  ], skipUnlocksDependents: true },
  { code: "AIA-11", article: "Art. 11", title: "Technical Documentation", phase: 2, dependencies: ["AIA-9", "AIA-10"], requirements: [
    { key: "tech_doc_system", label: "General description of the AI system documented", completed: false, optional: false },
    { key: "tech_doc_design", label: "Design specifications and development process described", completed: false, optional: false },
    { key: "tech_doc_monitoring", label: "Monitoring and functioning information provided", completed: false, optional: false },
    { key: "tech_doc_validation", label: "Validation and testing procedures documented", completed: false, optional: false },
  ], skipUnlocksDependents: false },
  { code: "AIA-13", article: "Art. 13", title: "Transparency & User Info", phase: 2, dependencies: ["AIA-9"], requirements: [
    { key: "transparency_purpose", label: "Intended purpose clearly communicated", completed: false, optional: false },
    { key: "transparency_limitations", label: "Known limitations and risks disclosed", completed: false, optional: false },
    { key: "transparency_accuracy", label: "Accuracy levels and expected errors documented", completed: false, optional: false },
    { key: "transparency_human", label: "Human oversight measures described to users", completed: false, optional: false },
  ], skipUnlocksDependents: true },
  { code: "AIA-14", article: "Art. 14", title: "Human Oversight", phase: 2, dependencies: ["AIA-9"], requirements: [
    { key: "oversight_design", label: "Human oversight built into system design", completed: false, optional: false },
    { key: "oversight_interface", label: "Interface enables effective oversight by natural persons", completed: false, optional: false },
    { key: "oversight_override", label: "Override and intervention mechanisms available", completed: false, optional: false },
    { key: "oversight_stop", label: "Ability to stop or reverse system outputs", completed: false, optional: false },
    { key: "oversight_training", label: "Oversight personnel adequately trained", completed: false, optional: true },
  ], skipUnlocksDependents: true },
  { code: "AIA-15", article: "Art. 15", title: "Accuracy, Robustness & Cybersecurity", phase: 2, dependencies: ["AIA-9", "AIA-10"], requirements: [
    { key: "accuracy_levels", label: "Accuracy levels declared and measured", completed: false, optional: false },
    { key: "accuracy_metrics", label: "Accuracy metrics appropriate for intended purpose", completed: false, optional: false },
    { key: "robustness_errors", label: "Resilience to errors and faults demonstrated", completed: false, optional: false },
    { key: "robustness_adversarial", label: "Robustness against adversarial attacks assessed", completed: false, optional: false },
    { key: "cyber_measures", label: "Cybersecurity measures implemented", completed: false, optional: false },
    { key: "cyber_integrity", label: "Data and model integrity protections in place", completed: false, optional: false },
  ], skipUnlocksDependents: false },
  { code: "AIA-17", article: "Art. 17", title: "Quality Management System", phase: 3, dependencies: ["AIA-11", "AIA-15"], requirements: [
    { key: "qms_strategy", label: "Quality management strategy documented", completed: false, optional: false },
    { key: "qms_design", label: "Design and development quality controls defined", completed: false, optional: false },
    { key: "qms_testing", label: "Testing and validation procedures established", completed: false, optional: false },
    { key: "qms_standards", label: "Applicable standards and specifications identified", completed: false, optional: false },
    { key: "qms_resources", label: "Resource management and responsibilities assigned", completed: false, optional: false },
  ], skipUnlocksDependents: false },
  { code: "AIA-26", article: "Art. 26", title: "Obligations of Deployers", phase: 3, dependencies: ["AIA-13", "AIA-14"], requirements: [
    { key: "deployer_use", label: "Use in accordance with instructions verified", completed: false, optional: false },
    { key: "deployer_oversight", label: "Human oversight persons assigned and capable", completed: false, optional: false },
    { key: "deployer_monitoring", label: "Input data relevance monitored", completed: false, optional: false },
    { key: "deployer_inform", label: "Individuals informed of AI system use", completed: false, optional: false },
  ], skipUnlocksDependents: true },
  { code: "AIA-47", article: "Art. 47", title: "EU Declaration of Conformity", phase: 3, dependencies: ["AIA-11", "AIA-17"], requirements: [
    { key: "doc_identifier", label: "Unique declaration identifier assigned", completed: false, optional: false },
    { key: "doc_conformity", label: "Conformity assessment procedure completed", completed: false, optional: false },
    { key: "doc_standards", label: "Applied standards and specifications referenced", completed: false, optional: false },
  ], skipUnlocksDependents: false },
  { code: "AIA-60", article: "Art. 60", title: "Serious Incident Reporting", phase: 4, dependencies: ["AIA-17", "AIA-26"], requirements: [
    { key: "incident_process", label: "Incident reporting process defined", completed: false, optional: false },
    { key: "incident_timelines", label: "Notification timelines established", completed: false, optional: false },
    { key: "incident_authority", label: "Relevant market surveillance authority identified", completed: false, optional: false },
    { key: "incident_corrective", label: "Corrective action procedures documented", completed: false, optional: false },
  ], skipUnlocksDependents: false },
  { code: "AIA-61", article: "Art. 61", title: "Post-Market Monitoring", phase: 4, dependencies: ["AIA-17", "AIA-60"], requirements: [
    { key: "pms_plan", label: "Post-market monitoring plan established", completed: false, optional: false },
    { key: "pms_data", label: "Relevant data collection procedures defined", completed: false, optional: false },
    { key: "pms_analysis", label: "Data analysis and evaluation methods documented", completed: false, optional: false },
    { key: "pms_update", label: "System update procedures based on monitoring defined", completed: false, optional: false },
    { key: "pms_reporting", label: "Regular reporting cadence established", completed: false, optional: false },
  ], skipUnlocksDependents: false },
];

const CONTROL_MAP = new Map(CONTROLS.map((c) => [c.code, c]));

// ── In-memory state ────────────────────────────────────────────────────
interface Step {
  id: string;
  wizardId: string;
  controlCode: string;
  phase: number;
  state: string;
  requirements: { key: string; label: string; completed: boolean; optional: boolean }[];
  justification: string | null;
  skipReason: string | null;
  completedAt: string | null;
  updatedAt: string;
  evidence: Evidence[];
}

interface Evidence {
  id: string;
  stepId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storageKey: string;
  sha256: string;
  uploadedBy: string;
  uploadedAt: string;
}

interface WizardDoc {
  id: string;
  wizardId: string;
  documentType: string;
  reportId: string | null;
  status: string;
  error: string | null;
  generatedAt: string | null;
}

interface Wizard {
  id: string;
  orgId: string;
  frameworkCode: string;
  name: string;
  status: string;
  progress: number;
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  steps: Step[];
  documents: WizardDoc[];
}

let wizards: Map<string, Wizard> = new Map();
let idCounter = 0;

function nextId(prefix = "wiz"): string {
  return `${prefix}-${++idCounter}`;
}

function makeSteps(wizardId: string): Step[] {
  return CONTROLS.map((c) => ({
    id: nextId("step"),
    wizardId,
    controlCode: c.code,
    phase: c.phase,
    state: c.dependencies.length === 0 ? "available" : "locked",
    requirements: c.requirements.map((r) => ({ ...r })),
    justification: null,
    skipReason: null,
    completedAt: null,
    updatedAt: new Date().toISOString(),
    evidence: [],
  }));
}

function computeProgress(wizard: Wizard): number {
  const done = wizard.steps.filter((s) => s.state === "completed" || s.state === "skipped").length;
  return done / wizard.steps.length;
}

function unlockDependents(wizard: Wizard, completedCode: string): void {
  for (const control of CONTROLS) {
    if (!control.dependencies.includes(completedCode)) continue;
    const step = wizard.steps.find((s) => s.controlCode === control.code);
    if (!step || step.state !== "locked") continue;
    // Check all deps satisfied
    const allDepsMet = control.dependencies.every((dep) => {
      const depStep = wizard.steps.find((s) => s.controlCode === dep);
      return depStep && (depStep.state === "completed" || depStep.state === "skipped");
    });
    if (allDepsMet) {
      step.state = "available";
    }
  }
}

// ── HTTP helpers ───────────────────────────────────────────────────────
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
    req.on("end", () => resolve(data));
  });
}

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}

function notFound(res: ServerResponse, msg = "Not found"): void {
  json(res, { error: msg }, 404);
}

// ── Route matching ─────────────────────────────────────────────────────
function matchRoute(method: string, url: string): { handler: string; params: Record<string, string> } | null {
  const routes: Array<{ method: string; pattern: RegExp; handler: string; paramNames: string[] }> = [
    { method: "GET", pattern: /^\/v1\/compliance\/wizards$/, handler: "listWizards", paramNames: [] },
    { method: "POST", pattern: /^\/v1\/compliance\/wizards$/, handler: "createWizard", paramNames: [] },
    { method: "GET", pattern: /^\/v1\/compliance\/wizards\/([^/]+)$/, handler: "getWizard", paramNames: ["wizardId"] },
    { method: "DELETE", pattern: /^\/v1\/compliance\/wizards\/([^/]+)$/, handler: "deleteWizard", paramNames: ["wizardId"] },
    { method: "PATCH", pattern: /^\/v1\/compliance\/wizards\/([^/]+)\/steps\/([^/]+)$/, handler: "updateStep", paramNames: ["wizardId", "code"] },
    { method: "POST", pattern: /^\/v1\/compliance\/wizards\/([^/]+)\/steps\/([^/]+)\/complete$/, handler: "completeStep", paramNames: ["wizardId", "code"] },
    { method: "POST", pattern: /^\/v1\/compliance\/wizards\/([^/]+)\/steps\/([^/]+)\/skip$/, handler: "skipStep", paramNames: ["wizardId", "code"] },
    { method: "GET", pattern: /^\/v1\/compliance\/wizards\/([^/]+)\/progress$/, handler: "getProgress", paramNames: ["wizardId"] },
    { method: "POST", pattern: /^\/v1\/compliance\/wizards\/([^/]+)\/documents\/generate$/, handler: "generateDocs", paramNames: ["wizardId"] },
    { method: "GET", pattern: /^\/v1\/compliance\/wizards\/([^/]+)\/documents$/, handler: "listDocs", paramNames: ["wizardId"] },
    { method: "POST", pattern: /^\/v1\/compliance\/wizards\/([^/]+)\/steps\/([^/]+)\/evidence$/, handler: "uploadEvidence", paramNames: ["wizardId", "code"] },
  ];

  for (const route of routes) {
    if (route.method !== method) continue;
    const match = url.match(route.pattern);
    if (match) {
      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => { params[name] = match[i + 1]; });
      return { handler: route.handler, params };
    }
  }
  return null;
}

// ── Handlers ───────────────────────────────────────────────────────────
const handlers: Record<string, (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => Promise<void>> = {
  async listWizards(_req, res) {
    json(res, Array.from(wizards.values()));
  },

  async createWizard(req, res) {
    const body = JSON.parse(await readBody(req));
    const id = nextId("wiz");
    const wizard: Wizard = {
      id,
      orgId: "org-1",
      frameworkCode: body.frameworkCode ?? "eu_ai_act",
      name: body.name,
      status: "active",
      progress: 0,
      metadata: {},
      createdBy: "user-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      steps: makeSteps(id),
      documents: [],
    };
    wizards.set(id, wizard);
    json(res, wizard, 201);
  },

  async getWizard(_req, res, params) {
    const wizard = wizards.get(params.wizardId);
    if (!wizard) return notFound(res, "Wizard not found");
    wizard.progress = computeProgress(wizard);
    json(res, wizard);
  },

  async deleteWizard(_req, res, params) {
    wizards.delete(params.wizardId);
    json(res, { deleted: true });
  },

  async updateStep(req, res, params) {
    const wizard = wizards.get(params.wizardId);
    if (!wizard) return notFound(res);
    const step = wizard.steps.find((s) => s.controlCode === params.code);
    if (!step) return notFound(res, "Step not found");
    if (step.state === "locked") return json(res, { error: "STEP_LOCKED" }, 409);

    const body = JSON.parse(await readBody(req));
    if (step.state === "available") step.state = "in_progress";
    if (body.justification !== undefined) step.justification = body.justification;
    if (body.requirements) {
      for (const { key, completed } of body.requirements) {
        const req = step.requirements.find((r) => r.key === key);
        if (req) req.completed = completed;
      }
    }
    step.updatedAt = new Date().toISOString();
    json(res, step);
  },

  async completeStep(_req, res, params) {
    const wizard = wizards.get(params.wizardId);
    if (!wizard) return notFound(res);
    const step = wizard.steps.find((s) => s.controlCode === params.code);
    if (!step) return notFound(res, "Step not found");

    const incomplete = step.requirements.filter((r) => !r.optional && !r.completed);
    if (incomplete.length > 0) return json(res, { error: "REQUIREMENTS_INCOMPLETE" }, 422);

    step.state = "completed";
    step.completedAt = new Date().toISOString();
    step.updatedAt = new Date().toISOString();
    unlockDependents(wizard, params.code);
    wizard.progress = computeProgress(wizard);

    // Check if all steps done
    if (wizard.steps.every((s) => s.state === "completed" || s.state === "skipped")) {
      wizard.status = "completed";
      wizard.completedAt = new Date().toISOString();
    }

    json(res, step);
  },

  async skipStep(req, res, params) {
    const wizard = wizards.get(params.wizardId);
    if (!wizard) return notFound(res);
    const step = wizard.steps.find((s) => s.controlCode === params.code);
    if (!step) return notFound(res, "Step not found");

    const body = JSON.parse(await readBody(req));
    if (!body.reason) return json(res, { error: "SKIP_REASON_REQUIRED" }, 422);

    step.state = "skipped";
    step.skipReason = body.reason;
    step.updatedAt = new Date().toISOString();

    const control = CONTROL_MAP.get(params.code);
    if (control?.skipUnlocksDependents) {
      unlockDependents(wizard, params.code);
    }

    wizard.progress = computeProgress(wizard);
    json(res, step);
  },

  async getProgress(_req, res, params) {
    const wizard = wizards.get(params.wizardId);
    if (!wizard) return notFound(res);
    wizard.progress = computeProgress(wizard);

    const phaseProgress: Record<number, { completed: number; total: number }> = {};
    for (const phase of [1, 2, 3, 4]) {
      const steps = wizard.steps.filter((s) => s.phase === phase);
      phaseProgress[phase] = {
        completed: steps.filter((s) => s.state === "completed" || s.state === "skipped").length,
        total: steps.length,
      };
    }

    json(res, {
      overall: wizard.progress,
      completedSteps: wizard.steps.filter((s) => s.state === "completed").length,
      totalSteps: wizard.steps.length,
      skippedSteps: wizard.steps.filter((s) => s.state === "skipped").length,
      phaseProgress,
      availableSteps: wizard.steps.filter((s) => s.state === "available").map((s) => s.controlCode),
      blockingSteps: [],
    });
  },

  async generateDocs(req, res, params) {
    const wizard = wizards.get(params.wizardId);
    if (!wizard) return notFound(res);
    const body = JSON.parse(await readBody(req));
    const docs: WizardDoc[] = (body.documentTypes ?? []).map((dt: string) => {
      const doc: WizardDoc = {
        id: nextId("doc"),
        wizardId: params.wizardId,
        documentType: dt,
        reportId: nextId("report"),
        status: "ready",
        error: null,
        generatedAt: new Date().toISOString(),
      };
      wizard.documents.push(doc);
      return doc;
    });
    json(res, { documents: docs });
  },

  async listDocs(_req, res, params) {
    const wizard = wizards.get(params.wizardId);
    if (!wizard) return notFound(res);
    json(res, wizard.documents);
  },

  async uploadEvidence(req, res, params) {
    const wizard = wizards.get(params.wizardId);
    if (!wizard) return notFound(res);
    const step = wizard.steps.find((s) => s.controlCode === params.code);
    if (!step) return notFound(res, "Step not found");

    const body = JSON.parse(await readBody(req));
    const evidence: Evidence = {
      id: nextId("ev"),
      stepId: step.id,
      fileName: body.fileName ?? "evidence.pdf",
      mimeType: body.mimeType ?? "application/pdf",
      fileSize: body.fileSize ?? 1024,
      storageKey: `s3://bucket/${nextId("key")}`,
      sha256: body.sha256 ?? "a".repeat(64),
      uploadedBy: "user-1",
      uploadedAt: new Date().toISOString(),
    };
    step.evidence.push(evidence);
    json(res, { evidence }, 201);
  },
};

// ── Server ─────────────────────────────────────────────────────────────
export function resetState(): void {
  wizards = new Map();
  idCounter = 0;
}

export function createMockServer(port = 8081): Promise<ReturnType<typeof createServer>> {
  return new Promise((resolve) => {
  const server = createServer(async (req, res) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,X-Sentinel-Role,X-Sentinel-Org-Id,X-Sentinel-User-Id",
      });
      res.end();
      return;
    }

    const url = (req.url ?? "").split("?")[0];
    const method = req.method ?? "GET";
    const route = matchRoute(method, url);

    if (!route) {
      return notFound(res, `Route ${method}:${url} not found`);
    }

    try {
      await handlers[route.handler](req, res, route.params);
    } catch (err: any) {
      json(res, { error: err.message }, 500);
    }
  });

  server.listen(port, () => {
    console.log(`Mock wizard API running on port ${port}`);
    resolve(server);
  });
  }); // end Promise
}

// Run standalone if executed directly
if (process.argv[1]?.endsWith("mock-wizard-api.ts") || process.argv[1]?.endsWith("mock-wizard-api.js")) {
  const port = parseInt(process.env.MOCK_API_PORT ?? "8081", 10);
  createMockServer(port).catch(console.error);
}

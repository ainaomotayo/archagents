// tests/e2e/fixtures/factory.ts
import { ScanService } from "../services/scan-service.js";
import { FindingService } from "../services/finding-service.js";
import { CertificateService } from "../services/certificate-service.js";
import { HealthService } from "../services/health-service.js";
import { EventStreamClient } from "../services/event-stream.js";
import { SchedulerService } from "../services/scheduler-service.js";
import { ReportService } from "../services/report-service.js";

export interface E2EContext {
  scanService: ScanService;
  findingService: FindingService;
  certificateService: CertificateService;
  healthService: HealthService;
  eventStream: EventStreamClient;
  schedulerService: SchedulerService;
  reportService: ReportService;
  orgId: string;
  projectId: string;
}

export function createE2EContext(): E2EContext {
  const apiUrl = process.env.E2E_API_URL ?? "http://localhost:8081";
  const secret = process.env.E2E_SECRET ?? "e2e-test-secret";
  const orgId = process.env.E2E_ORG_ID ?? "org-e2e-test";
  const projectId = process.env.E2E_PROJECT_ID ?? "proj-e2e-test";
  const schedulerUrl = process.env.E2E_SCHEDULER_URL ?? "http://localhost:9091";

  return {
    scanService: new ScanService(apiUrl, secret, orgId),
    findingService: new FindingService(apiUrl, secret, orgId),
    certificateService: new CertificateService(apiUrl, secret, orgId),
    healthService: new HealthService(),
    eventStream: new EventStreamClient(apiUrl, orgId),
    schedulerService: new SchedulerService(schedulerUrl),
    reportService: new ReportService(apiUrl, secret, orgId),
    orgId,
    projectId,
  };
}

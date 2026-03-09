# P0: Wire API Server, Database, and Dashboard

**Goal:** Make SENTINEL serve real requests end-to-end — a CLI scan submission flows through the API, persists to PostgreSQL, agents process via Redis Streams, assessor scores and certifies, and the dashboard displays real data.

**Current state:** Core libraries (auth, audit, events, assessor, shared types) are production-ready. The API server has route handlers that aren't mounted. The database has a Prisma schema but no generated client or migrations. The dashboard returns hardcoded mock data.

---

## Task 1: Generate Prisma Client and Create Migrations

**Files to modify:**
- `packages/db/src/index.ts`
- `packages/db/src/types.ts`
- `packages/db/package.json`
- `packages/db/prisma/schema.prisma` (minor additions)

**Files to create:**
- `packages/db/prisma/migrations/` (auto-generated)
- `packages/db/src/client.ts`
- `packages/db/src/seed.ts`

### Steps

1. **Add Prisma binary targets for Docker (Alpine)**

   In `schema.prisma`, ensure the generator block includes:
   ```prisma
   generator client {
     provider      = "prisma-client-js"
     binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
   }
   ```

2. **Generate Prisma Client and initial migration**

   ```bash
   cd packages/db
   npx prisma generate
   npx prisma migrate dev --name init
   ```

   This creates `prisma/migrations/YYYYMMDD_init/migration.sql` with all 9 tables.

3. **Create `src/client.ts` — singleton Prisma Client factory**

   ```typescript
   import { PrismaClient } from "@prisma/client";

   let prisma: PrismaClient | undefined;

   export function getDb(): PrismaClient {
     if (!prisma) {
       prisma = new PrismaClient({
         log: process.env.NODE_ENV === "development" ? ["query"] : ["error"],
       });
     }
     return prisma;
   }

   export async function disconnectDb(): Promise<void> {
     if (prisma) {
       await prisma.$disconnect();
       prisma = undefined;
     }
   }

   export { PrismaClient };
   ```

4. **Update `src/index.ts` to export the client and tenant isolation**

   ```typescript
   export { getDb, disconnectDb, PrismaClient } from "./client.js";
   export { withTenant } from "./tenant.js";
   ```

5. **Update `src/types.ts`** — replace minimal stubs with re-exports from generated Prisma types:

   ```typescript
   export type {
     Organization,
     Project,
     Scan,
     Finding,
     Certificate,
     AgentResult,
     Policy,
     AuditEvent,
     User,
   } from "@prisma/client";
   ```

6. **Add PostgreSQL Row-Level Security policies**

   Create `packages/db/prisma/migrations/YYYYMMDD_rls/migration.sql`:

   ```sql
   -- Enable RLS on all tenant-scoped tables
   ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "Scan" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "Finding" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "Certificate" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "AgentResult" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "Policy" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

   -- RLS policies: restrict to current tenant
   CREATE POLICY tenant_isolation_project ON "Project"
     USING ("orgId" = current_setting('app.current_org_id', true)::text);
   CREATE POLICY tenant_isolation_scan ON "Scan"
     USING ("orgId" = current_setting('app.current_org_id', true)::text);
   CREATE POLICY tenant_isolation_finding ON "Finding"
     USING ("orgId" = current_setting('app.current_org_id', true)::text);
   CREATE POLICY tenant_isolation_certificate ON "Certificate"
     USING ("orgId" = current_setting('app.current_org_id', true)::text);
   CREATE POLICY tenant_isolation_agent_result ON "AgentResult"
     USING ("scanId" IN (SELECT id FROM "Scan" WHERE "orgId" = current_setting('app.current_org_id', true)::text));
   CREATE POLICY tenant_isolation_policy ON "Policy"
     USING ("orgId" = current_setting('app.current_org_id', true)::text);
   CREATE POLICY tenant_isolation_audit ON "AuditEvent"
     USING ("orgId" = current_setting('app.current_org_id', true)::text);
   CREATE POLICY tenant_isolation_user ON "User"
     USING ("orgId" = current_setting('app.current_org_id', true)::text);

   -- Bypass RLS for the application role (Prisma connects as this user)
   -- RLS is enforced via withTenant() setting session vars, not via DB roles
   ALTER TABLE "Project" FORCE ROW LEVEL SECURITY;
   ALTER TABLE "Scan" FORCE ROW LEVEL SECURITY;
   -- ... repeat for all tables
   ```

7. **Create `src/seed.ts`** for development data:

   ```typescript
   import { PrismaClient } from "@prisma/client";

   const prisma = new PrismaClient();

   async function main() {
     const org = await prisma.organization.upsert({
       where: { slug: "demo" },
       update: {},
       create: {
         name: "Demo Organization",
         slug: "demo",
         plan: "professional",
         settings: {},
       },
     });

     await prisma.project.createMany({
       data: [
         { orgId: org.id, name: "sentinel-core", repoUrl: "https://github.com/demo/sentinel-core" },
         { orgId: org.id, name: "payment-service", repoUrl: "https://github.com/demo/payment-service" },
         { orgId: org.id, name: "auth-gateway", repoUrl: "https://github.com/demo/auth-gateway" },
       ],
       skipDuplicates: true,
     });

     await prisma.user.upsert({
       where: { email: "admin@demo.com" },
       update: {},
       create: {
         orgId: org.id,
         email: "admin@demo.com",
         name: "Admin",
         role: "admin",
         authProvider: "github",
       },
     });
   }

   main().then(() => prisma.$disconnect());
   ```

8. **Update `package.json` scripts:**

   ```json
   {
     "scripts": {
       "build": "prisma generate && tsc",
       "db:generate": "prisma generate",
       "db:migrate": "prisma migrate deploy",
       "db:push": "prisma db push",
       "db:seed": "tsx src/seed.ts",
       "test": "vitest run"
     }
   }
   ```

### Tests

- `packages/db/src/client.test.ts`: Verify `getDb()` returns singleton, `disconnectDb()` clears it.
- `packages/db/src/tenant.test.ts`: Verify `withTenant()` calls `SET app.current_org_id` and wraps in transaction. (Existing tests may cover this — verify.)

### Acceptance criteria

- `prisma migrate deploy` runs without errors against a fresh PostgreSQL database.
- `prisma db seed` populates demo org, projects, and admin user.
- `withTenant(db, orgId, fn)` correctly scopes queries to the given org.
- All 9 tables are created with proper indexes and foreign keys.
- RLS policies are applied and verified with a cross-tenant query test.

---

## Task 2: Wire API Routes into Fastify Server

**Files to modify:**
- `apps/api/src/server.ts` (major rewrite)
- `apps/api/src/routes/scans.ts` (add HTTP registration)
- `apps/api/package.json` (add @sentinel/db dependency)

**Files to create:**
- `apps/api/src/routes/findings.ts`
- `apps/api/src/routes/certificates.ts`
- `apps/api/src/routes/policies.ts`
- `apps/api/src/routes/audit.ts`
- `apps/api/src/stores.ts` (Prisma-backed store implementations)
- `apps/api/src/worker.ts` (assessor worker process)

### Steps

1. **Create `src/stores.ts`** — Prisma implementations of store interfaces used by route handlers:

   ```typescript
   import { PrismaClient } from "@sentinel/db";

   export function createScanStore(db: PrismaClient) {
     return {
       async create(args: { data: Record<string, unknown> }) {
         return db.scan.create({ data: args.data as any });
       },
       async findUnique(args: { where: { id: string } }) {
         return db.scan.findUnique({
           where: args.where,
           include: { findings: true, certificate: true, agentResults: true },
         });
       },
     };
   }

   export function createAuditEventStore(db: PrismaClient) {
     return {
       async findFirst(args: any) {
         return db.auditEvent.findFirst(args);
       },
       async create(args: any) {
         return db.auditEvent.create(args);
       },
     };
   }

   export function createAssessmentStore(db: PrismaClient) {
     return {
       async saveAssessment(data: any) {
         await db.scan.update({
           where: { id: data.scanId },
           data: {
             status: data.status,
             riskScore: data.riskScore,
             completedAt: new Date(),
           },
         });
         // Upsert findings from assessment
         for (const finding of data.findings) {
           await db.finding.create({ data: { ...finding, scanId: data.scanId, orgId: data.orgId } });
         }
       },
       async saveCertificate(data: any) {
         await db.certificate.create({
           data: {
             scanId: data.scanId,
             orgId: data.orgId,
             status: data.status,
             riskScore: data.riskScore,
             verdict: data.verdict,
             scanMetadata: data.scanMetadata,
             compliance: data.compliance,
             signature: data.signature,
             expiresAt: new Date(data.expiresAt),
           },
         });
       },
     };
   }
   ```

2. **Rewrite `src/server.ts`** to instantiate all dependencies and mount routes:

   ```typescript
   import Fastify from "fastify";
   import Redis from "ioredis";
   import { getDb, disconnectDb } from "@sentinel/db";
   import { EventBus } from "@sentinel/events";
   import { AuditLog } from "@sentinel/audit";
   import { createAuthHook } from "./middleware/auth.js";
   import { buildScanRoutes } from "./routes/scans.js";
   import { buildFindingRoutes } from "./routes/findings.js";
   import { buildCertificateRoutes } from "./routes/certificates.js";
   import { buildPolicyRoutes } from "./routes/policies.js";
   import { buildAuditRoutes } from "./routes/audit.js";
   import { createScanStore, createAuditEventStore } from "./stores.js";

   const app = Fastify({ logger: true });

   // --- Infrastructure ---
   const db = getDb();
   const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
   const eventBus = new EventBus(redis);
   const auditLog = new AuditLog(createAuditEventStore(db));

   // --- Auth middleware ---
   const authHook = createAuthHook({
     getOrgSecret: async (apiKey) => {
       if (!apiKey) return process.env.SENTINEL_SECRET ?? null;
       // In production: look up org secret from DB by API key
       return process.env.SENTINEL_SECRET ?? null;
     },
   });

   // --- Routes ---
   const scanRoutes = buildScanRoutes({
     scanStore: createScanStore(db),
     eventBus,
     auditLog,
   });

   // Health (no auth)
   app.get("/health", async () => ({
     status: "ok",
     version: "0.1.0",
     uptime: process.uptime(),
   }));

   // Scan endpoints
   app.post("/v1/scans", { preHandler: authHook }, async (request, reply) => {
     const body = request.body as any;
     const orgId = (request as any).orgId ?? "default";
     const result = await scanRoutes.submitScan({ orgId, body });
     reply.code(201).send(result);
   });

   app.get("/v1/scans/:id", { preHandler: authHook }, async (request) => {
     const { id } = request.params as { id: string };
     const scan = await scanRoutes.getScan(id);
     if (!scan) throw { statusCode: 404, message: "Scan not found" };
     return scan;
   });

   app.get("/v1/scans/:id/poll", { preHandler: authHook }, async (request) => {
     const { id } = request.params as { id: string };
     const scan = await scanRoutes.getScan(id);
     if (!scan) throw { statusCode: 404, message: "Scan not found" };
     return {
       status: scan.status,
       assessment: scan.status === "completed" ? scan : undefined,
     };
   });

   // Findings
   app.get("/v1/findings", { preHandler: authHook }, async (request) => {
     const { limit = 50, offset = 0, severity, category } = request.query as any;
     const findings = await db.finding.findMany({
       where: {
         ...(severity && { severity }),
         ...(category && { category }),
       },
       take: Number(limit),
       skip: Number(offset),
       orderBy: { createdAt: "desc" },
     });
     const total = await db.finding.count();
     return { findings, total, limit: Number(limit), offset: Number(offset) };
   });

   // Certificates
   app.get("/v1/certificates", { preHandler: authHook }, async (request) => {
     const { limit = 50, offset = 0 } = request.query as any;
     const certificates = await db.certificate.findMany({
       take: Number(limit),
       skip: Number(offset),
       orderBy: { issuedAt: "desc" },
     });
     const total = await db.certificate.count();
     return { certificates, total, limit: Number(limit), offset: Number(offset) };
   });

   app.get("/v1/certificates/:id", { preHandler: authHook }, async (request) => {
     const { id } = request.params as { id: string };
     const cert = await db.certificate.findUnique({ where: { id } });
     if (!cert) throw { statusCode: 404, message: "Certificate not found" };
     return cert;
   });

   app.post("/v1/certificates/:id/verify", { preHandler: authHook }, async (request) => {
     const { id } = request.params as { id: string };
     const cert = await db.certificate.findUnique({ where: { id } });
     if (!cert) throw { statusCode: 404, message: "Certificate not found" };
     const { verifyCertificate } = await import("@sentinel/assessor");
     const valid = verifyCertificate(
       JSON.stringify(cert.verdict),
       process.env.SENTINEL_SECRET!,
     );
     return { valid, certificateId: id };
   });

   // Policies
   app.get("/v1/policies", { preHandler: authHook }, async () => {
     return db.policy.findMany({ orderBy: { createdAt: "desc" } });
   });

   app.post("/v1/policies", { preHandler: authHook }, async (request, reply) => {
     const body = request.body as any;
     const policy = await db.policy.create({ data: body });
     reply.code(201).send(policy);
   });

   // Audit log
   app.get("/v1/audit", { preHandler: authHook }, async (request) => {
     const { limit = 50, offset = 0 } = request.query as any;
     const events = await db.auditEvent.findMany({
       take: Number(limit),
       skip: Number(offset),
       orderBy: { timestamp: "desc" },
     });
     const total = await db.auditEvent.count();
     return { events, total, limit: Number(limit), offset: Number(offset) };
   });

   // Projects
   app.get("/v1/projects", { preHandler: authHook }, async () => {
     return db.project.findMany({
       include: { _count: { select: { scans: true } } },
       orderBy: { createdAt: "desc" },
     });
   });

   // --- Graceful shutdown ---
   const shutdown = async () => {
     app.log.info("Shutting down...");
     await app.close();
     await eventBus.disconnect();
     await disconnectDb();
     process.exit(0);
   };
   process.on("SIGTERM", shutdown);
   process.on("SIGINT", shutdown);

   // --- Start ---
   const port = parseInt(process.env.PORT ?? "8080", 10);
   if (process.env.NODE_ENV !== "test") {
     app.listen({ port, host: "0.0.0.0" });
   }

   export { app };
   ```

3. **Create `src/worker.ts`** — the assessor worker that consumes agent findings:

   ```typescript
   import Redis from "ioredis";
   import { EventBus } from "@sentinel/events";
   import { Assessor } from "@sentinel/assessor";
   import { getDb } from "@sentinel/db";
   import { createAssessmentStore } from "./stores.js";

   const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
   const eventBus = new EventBus(redis);
   const db = getDb();
   const assessor = new Assessor();
   const store = createAssessmentStore(db);

   // Collect findings per scan, then assess when all agents report
   const pendingScans = new Map<string, { findings: any[]; agents: Set<string>; timer: NodeJS.Timeout }>();

   const EXPECTED_AGENTS = ["security", "ip-license", "dependency", "ai-detector", "quality", "policy"];
   const AGENT_TIMEOUT_MS = 30_000;

   async function handleFinding(id: string, data: Record<string, unknown>) {
     const { scanId, agentName, findings, agentResult } = data as any;

     let pending = pendingScans.get(scanId);
     if (!pending) {
       pending = {
         findings: [],
         agents: new Set(),
         timer: setTimeout(() => finalizeScan(scanId, true), AGENT_TIMEOUT_MS),
       };
       pendingScans.set(scanId, pending);
     }

     pending.findings.push({ scanId, agentName, findings, agentResult });
     pending.agents.add(agentName);

     // Check if all agents have reported
     if (EXPECTED_AGENTS.every((a) => pending!.agents.has(a))) {
       clearTimeout(pending.timer);
       await finalizeScan(scanId, false);
     }
   }

   async function finalizeScan(scanId: string, hasTimeouts: boolean) {
     const pending = pendingScans.get(scanId);
     if (!pending) return;
     pendingScans.delete(scanId);

     const scan = await db.scan.findUnique({ where: { id: scanId } });
     if (!scan) return;

     const assessment = assessor.assess({
       scanId,
       projectId: scan.projectId,
       commitHash: scan.commitHash,
       findingEvents: pending.findings,
       hasTimeouts,
       orgSecret: process.env.SENTINEL_SECRET!,
     });

     await assessor.persist(store, assessment, scanId, scan.orgId);

     // Publish result event for CLI polling
     await eventBus.publish("sentinel.results", {
       scanId,
       status: assessment.status,
       riskScore: assessment.riskScore,
       certificateId: assessment.certificate?.id,
     });
   }

   // Start consuming
   eventBus.subscribe(
     "sentinel.findings",
     "assessors",
     `assessor-${process.pid}`,
     handleFinding,
   );

   console.log("Assessor worker started, consuming sentinel.findings...");
   ```

4. **Update `apps/api/package.json`** to add new dependencies:

   ```json
   {
     "dependencies": {
       "@sentinel/shared": "workspace:*",
       "@sentinel/events": "workspace:*",
       "@sentinel/auth": "workspace:*",
       "@sentinel/audit": "workspace:*",
       "@sentinel/db": "workspace:*",
       "@sentinel/assessor": "workspace:*",
       "fastify": "^5.2",
       "ioredis": "^5.6"
     }
   }
   ```

5. **Update `docker/api.Dockerfile`** to run migrations on startup:

   Add before the CMD:
   ```dockerfile
   # Run database migrations before starting
   COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
   ```

   Update CMD or add entrypoint script:
   ```dockerfile
   CMD ["sh", "-c", "npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma && node apps/api/dist/server.js"]
   ```

### Tests

- Update `apps/api/src/routes/scans.test.ts`: Verify route registration works with Fastify `app.inject()`.
- Add `apps/api/src/server.test.ts`: Integration test — POST /v1/scans with signed request → verify 201 response.
- Add `apps/api/src/stores.test.ts`: Unit tests for Prisma store adapters with mocked PrismaClient.
- Add `apps/api/src/worker.test.ts`: Test assessor worker with mock finding events → verify assessment persisted.

### Acceptance criteria

- `POST /v1/scans` accepts a signed diff payload, creates a scan in PostgreSQL, publishes to Redis Streams, and returns `{ scanId, status: "pending", pollUrl }`.
- `GET /v1/scans/:id/poll` returns the current scan status and assessment when complete.
- `GET /v1/findings` returns paginated findings from the database.
- `GET /v1/certificates` returns paginated certificates.
- `GET /v1/certificates/:id/verify` verifies the HMAC signature.
- `GET /v1/policies`, `POST /v1/policies` work for CRUD.
- `GET /v1/audit` returns paginated audit events.
- `GET /v1/projects` returns projects with scan counts.
- The assessor worker consumes findings from Redis, scores them, generates certificates, and persists to the database.
- All existing tests continue to pass.
- `GET /health` returns `{ status: "ok", version, uptime }`.

---

## Task 3: Replace Dashboard Mock Data with Real API Calls

**Files to modify:**
- `apps/dashboard/lib/api.ts` (major rewrite — replace mock returns with fetch calls)
- `apps/dashboard/app/(dashboard)/audit/page.tsx` (replace direct MOCK import)
- `apps/dashboard/app/(dashboard)/policies/page.tsx` (replace direct MOCK import)
- `apps/dashboard/app/(dashboard)/policies/[id]/page.tsx` (replace direct MOCK import)
- `apps/dashboard/app/(dashboard)/drift/page.tsx` (replace direct MOCK import)
- `apps/dashboard/app/(dashboard)/settings/page.tsx` (replace direct MOCK import)
- `apps/dashboard/app/(dashboard)/reports/page.tsx` (update to use API data)
- `apps/dashboard/app/api/scans/[id]/stream/route.ts` (connect to real backend)
- `apps/dashboard/.env.example` (add SENTINEL_API_URL)

**Files to create:**
- `apps/dashboard/lib/api-client.ts` (HTTP client with auth headers)

### Steps

1. **Create `lib/api-client.ts`** — authenticated HTTP client for server components:

   ```typescript
   const API_URL = process.env.SENTINEL_API_URL ?? "http://localhost:8080";
   const API_SECRET = process.env.SENTINEL_SECRET ?? "";

   import { signRequest } from "@sentinel/auth";

   export async function apiGet<T>(path: string, query?: Record<string, string>): Promise<T> {
     const url = new URL(path, API_URL);
     if (query) {
       for (const [k, v] of Object.entries(query)) {
         url.searchParams.set(k, v);
       }
     }

     const body = "";
     const signature = signRequest(body, API_SECRET);

     const res = await fetch(url.toString(), {
       headers: {
         "X-Sentinel-Signature": signature,
         "X-Sentinel-API-Key": "dashboard",
       },
       next: { revalidate: 30 }, // ISR: revalidate every 30 seconds
     });

     if (!res.ok) {
       throw new Error(`API ${res.status}: ${await res.text()}`);
     }
     return res.json();
   }

   export async function apiPost<T>(path: string, data: unknown): Promise<T> {
     const url = new URL(path, API_URL);
     const bodyStr = JSON.stringify(data);
     const signature = signRequest(bodyStr, API_SECRET);

     const res = await fetch(url.toString(), {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
         "X-Sentinel-Signature": signature,
         "X-Sentinel-API-Key": "dashboard",
       },
       body: bodyStr,
     });

     if (!res.ok) {
       throw new Error(`API ${res.status}: ${await res.text()}`);
     }
     return res.json();
   }
   ```

2. **Rewrite `lib/api.ts`** — replace every mock return with a real API call:

   ```typescript
   import { apiGet } from "./api-client";
   import type { OverviewStats, Scan, Project, Finding, Certificate } from "./types";

   export async function getOverviewStats(): Promise<OverviewStats> {
     // Aggregate from multiple endpoints
     const [scans, findings, certificates] = await Promise.all([
       apiGet<{ total: number }>("/v1/scans?limit=0"),
       apiGet<{ total: number }>("/v1/findings?limit=0"),
       apiGet<{ certificates: Certificate[] }>("/v1/certificates?limit=100"),
     ]);

     const activeCerts = certificates.certificates.filter((c) => c.status === "active");
     const revokedCerts = certificates.certificates.filter((c) => c.status === "revoked");
     const passRate = activeCerts.length > 0
       ? Math.round((activeCerts.filter((c) => c.riskScore <= 20).length / activeCerts.length) * 100)
       : 0;

     return {
       totalScans: scans.total,
       activeRevocations: revokedCerts.length,
       openFindings: findings.total,
       passRate,
     };
   }

   export async function getRecentScans(limit = 5): Promise<Scan[]> {
     // Note: API needs a /v1/scans GET endpoint (add to Task 2 if missing)
     const data = await apiGet<{ scans: Scan[] }>(`/v1/scans?limit=${limit}`);
     return data.scans;
   }

   export async function getProjects(): Promise<Project[]> {
     return apiGet<Project[]>("/v1/projects");
   }

   export async function getProjectById(id: string): Promise<Project | null> {
     try {
       return await apiGet<Project>(`/v1/projects/${id}`);
     } catch {
       return null;
     }
   }

   export async function getFindings(): Promise<Finding[]> {
     const data = await apiGet<{ findings: Finding[] }>("/v1/findings?limit=100");
     return data.findings;
   }

   export async function getFindingById(id: string): Promise<Finding | null> {
     try {
       return await apiGet<Finding>(`/v1/findings/${id}`);
     } catch {
       return null;
     }
   }

   export async function getCertificates(): Promise<Certificate[]> {
     const data = await apiGet<{ certificates: Certificate[] }>("/v1/certificates?limit=100");
     return data.certificates;
   }

   export async function getCertificateById(id: string): Promise<Certificate | null> {
     try {
       return await apiGet<Certificate>(`/v1/certificates/${id}`);
     } catch {
       return null;
     }
   }

   export async function getPolicies() {
     return apiGet<any[]>("/v1/policies");
   }

   export async function getAuditLog(limit = 50) {
     const data = await apiGet<{ events: any[] }>(`/v1/audit?limit=${limit}`);
     return data.events;
   }
   ```

3. **Update pages that directly import MOCK data:**

   Each page currently does `import { MOCK_X } from "@/lib/mock-data"`. Replace with API function calls.

   **`app/(dashboard)/audit/page.tsx`:**
   ```typescript
   // Before: import { MOCK_AUDIT_LOG } from "@/lib/mock-data";
   // After:
   import { getAuditLog } from "@/lib/api";

   export default async function AuditLogPage() {
     const events = await getAuditLog();
     // ... rest of render unchanged
   }
   ```

   **`app/(dashboard)/policies/page.tsx`:**
   ```typescript
   import { getPolicies } from "@/lib/api";

   export default async function PoliciesPage() {
     const policies = await getPolicies();
     // ... rest of render unchanged
   }
   ```

   Apply the same pattern to: `policies/[id]/page.tsx`, `drift/page.tsx`, `reports/page.tsx`.

4. **Add error boundaries and empty states** to all pages:

   Each page should handle the case where the API returns no data:
   ```typescript
   export default async function FindingsPage() {
     let findings: Finding[] = [];
     try {
       findings = await getFindings();
     } catch (error) {
       // Log error server-side, show fallback
     }

     if (findings.length === 0) {
       return (
         <div>
           <PageHeader title="Findings" description="..." />
           <div className="mt-12 text-center text-text-tertiary">
             <p>No findings yet. Run a scan to get started.</p>
           </div>
         </div>
       );
     }

     // ... existing render
   }
   ```

5. **Update SSE endpoint** `app/api/scans/[id]/stream/route.ts`:

   Replace mock step simulation with real Redis subscription:
   ```typescript
   import Redis from "ioredis";

   export async function GET(request: Request, { params }: { params: { id: string } }) {
     const scanId = params.id;
     const encoder = new TextEncoder();

     const stream = new ReadableStream({
       async start(controller) {
         const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
         const sub = redis.duplicate();
         await sub.subscribe(`scan:${scanId}`);

         sub.on("message", (channel, message) => {
           controller.enqueue(encoder.encode(`data: ${message}\n\n`));
           const parsed = JSON.parse(message);
           if (parsed.status === "completed" || parsed.status === "failed") {
             sub.unsubscribe();
             sub.disconnect();
             controller.close();
           }
         });

         // Timeout after 5 minutes
         setTimeout(() => {
           sub.unsubscribe();
           sub.disconnect();
           controller.close();
         }, 300_000);
       },
     });

     return new Response(stream, {
       headers: {
         "Content-Type": "text/event-stream",
         "Cache-Control": "no-cache",
         Connection: "keep-alive",
       },
     });
   }
   ```

6. **Add environment variables** to `apps/dashboard/.env.example`:

   ```env
   SENTINEL_API_URL=http://localhost:8080
   SENTINEL_SECRET=<same-secret-as-api>
   ```

7. **Add `@sentinel/auth` as a dependency** in `apps/dashboard/package.json`:

   ```json
   {
     "dependencies": {
       "@sentinel/auth": "workspace:*"
     }
   }
   ```

8. **Delete `lib/mock-data.ts`** once all imports are removed. If some pages still need it as fallback during the transition, keep it but gate behind a `USE_MOCK_DATA` env var.

### Tests

- Update `apps/dashboard/__tests__/` with API integration tests using `msw` (Mock Service Worker) to mock the API server.
- Test that each page renders with empty data (no findings, no projects, etc.).
- Test that error boundaries catch API failures gracefully.

### Acceptance criteria

- Dashboard overview page shows real stats from the API (total scans, findings, pass rate).
- Projects page lists real projects from the database.
- Findings page shows real findings from completed scans.
- Certificates page shows real certificates.
- Policies and audit log pages fetch from the API.
- Empty states display correctly when no data exists.
- SSE endpoint streams real scan progress from Redis.
- No references to `MOCK_*` constants remain in page components.

---

## Task 4: Update Docker Compose and E2E Validation

**Files to modify:**
- `docker/api.Dockerfile` (add migration step, add worker)
- `docker-compose.sentinel.yml` (add assessor worker service)
- `docker-compose.yml` (update dev config)
- `apps/dashboard/Dockerfile` (add SENTINEL_API_URL build arg)

**Files to create:**
- `docker/entrypoint-api.sh` (migration + server startup)

### Steps

1. **Create `docker/entrypoint-api.sh`:**

   ```bash
   #!/bin/sh
   set -e
   echo "Running database migrations..."
   npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma
   echo "Starting API server..."
   exec node apps/api/dist/server.js
   ```

2. **Update `docker/api.Dockerfile`:**

   ```dockerfile
   # ... builder stage unchanged ...

   FROM node:22-alpine
   WORKDIR /app
   RUN apk add --no-cache wget
   COPY --from=builder /app/apps/api/dist ./apps/api/dist
   COPY --from=builder /app/node_modules ./node_modules
   COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
   COPY docker/entrypoint-api.sh /entrypoint.sh
   RUN chmod +x /entrypoint.sh
   EXPOSE 8080
   ENV NODE_ENV=production
   ENTRYPOINT ["/entrypoint.sh"]
   ```

3. **Add assessor worker service to `docker-compose.sentinel.yml`:**

   ```yaml
   assessor-worker:
     build:
       context: .
       dockerfile: docker/api.Dockerfile
     restart: unless-stopped
     depends_on:
       postgres:
         condition: service_healthy
       redis:
         condition: service_healthy
     networks:
       - sentinel-internal
     environment:
       DATABASE_URL: ${DATABASE_URL}
       REDIS_URL: ${REDIS_URL}
       SENTINEL_SECRET: ${SENTINEL_SECRET}
       NODE_ENV: production
     command: ["node", "apps/api/dist/worker.js"]
     healthcheck:
       test: ["CMD-SHELL", "wget -qO- http://localhost:8081/health || exit 1"]
       interval: 15s
       timeout: 5s
       retries: 3
       start_period: 20s
   ```

4. **Update `docker-compose.yml`** dev config to include local API + worker:

   ```yaml
   services:
     postgres:
       # ... existing ...
     redis:
       # ... existing ...
     api:
       build:
         context: .
         dockerfile: docker/api.Dockerfile
       ports:
         - "8080:8080"
       depends_on:
         postgres: { condition: service_healthy }
         redis: { condition: service_healthy }
       environment:
         DATABASE_URL: postgresql://sentinel:sentinel_dev@postgres:5432/sentinel
         REDIS_URL: redis://redis:6379
         SENTINEL_SECRET: dev-secret-change-in-production
   ```

### Acceptance criteria

- `docker compose -f docker-compose.sentinel.yml up -d --build` starts all services.
- API server runs migrations automatically on startup.
- Assessor worker connects to Redis and consumes findings.
- Dashboard connects to API and renders real data.
- Full pipeline test: CLI → API → Redis → Agent → Assessor → Database → Dashboard.

---

## Execution Order

```
Task 1: Database (Prisma generate, migrations, RLS, seed)
   ↓
Task 2: API Server (wire routes, stores, worker)
   ↓ (can start in parallel after Task 1 schema is stable)
Task 3: Dashboard (replace mocks with API calls)
   ↓
Task 4: Docker Compose (migration entrypoint, worker service, E2E)
```

Tasks 1 and 2 are sequential (routes need the database). Task 3 can begin as soon as Task 2 has the first endpoints working. Task 4 is the integration test that validates everything works together.

---

## API Endpoints Summary (Task 2 deliverables)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Health check with version and uptime |
| `POST` | `/v1/scans` | HMAC | Submit scan diff, returns scanId + pollUrl |
| `GET` | `/v1/scans/:id` | HMAC | Get scan with findings and certificate |
| `GET` | `/v1/scans/:id/poll` | HMAC | Poll scan status |
| `GET` | `/v1/findings` | HMAC | List findings (paginated, filterable) |
| `GET` | `/v1/findings/:id` | HMAC | Get single finding |
| `GET` | `/v1/certificates` | HMAC | List certificates (paginated) |
| `GET` | `/v1/certificates/:id` | HMAC | Get single certificate |
| `POST` | `/v1/certificates/:id/verify` | HMAC | Verify certificate signature |
| `GET` | `/v1/policies` | HMAC | List policies |
| `POST` | `/v1/policies` | HMAC | Create policy |
| `GET` | `/v1/projects` | HMAC | List projects with scan counts |
| `GET` | `/v1/projects/:id` | HMAC | Get project detail |
| `GET` | `/v1/audit` | HMAC | List audit events (paginated) |

---

## Dependencies Between Tasks

```
┌─────────────────┐
│  Task 1: DB     │
│  (Prisma, RLS)  │
└────────┬────────┘
         │
         v
┌─────────────────┐     ┌──────────────────┐
│  Task 2: API    │────>│  Task 3: Dashboard│
│  (Routes, Worker)│     │  (Real API calls) │
└────────┬────────┘     └────────┬─────────┘
         │                       │
         v                       v
┌──────────────────────────────────────────┐
│  Task 4: Docker Compose + E2E Validation │
└──────────────────────────────────────────┘
```

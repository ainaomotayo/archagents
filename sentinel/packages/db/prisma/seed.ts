import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding SENTINEL database...");

  // Create organization
  const org = await prisma.organization.upsert({
    where: { slug: "default" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "SENTINEL Demo Org",
      slug: "default",
      plan: "enterprise",
    },
  });

  console.log(`Organization: ${org.name} (${org.id})`);

  // Create projects
  const projects = await Promise.all([
    prisma.project.upsert({
      where: { id: "00000000-0000-0000-0001-000000000001" },
      update: {},
      create: {
        id: "00000000-0000-0000-0001-000000000001",
        orgId: org.id,
        name: "sentinel-api",
        repoUrl: "https://github.com/acme/sentinel-api",
      },
    }),
    prisma.project.upsert({
      where: { id: "00000000-0000-0000-0001-000000000002" },
      update: {},
      create: {
        id: "00000000-0000-0000-0001-000000000002",
        orgId: org.id,
        name: "frontend-app",
        repoUrl: "https://github.com/acme/frontend-app",
      },
    }),
    prisma.project.upsert({
      where: { id: "00000000-0000-0000-0001-000000000003" },
      update: {},
      create: {
        id: "00000000-0000-0000-0001-000000000003",
        orgId: org.id,
        name: "payment-service",
        repoUrl: "https://github.com/acme/payment-service",
      },
    }),
  ]);

  console.log(`Projects: ${projects.map((p) => p.name).join(", ")}`);

  // Create scans with varying statuses and risk scores
  const now = new Date();
  const scanData = [
    { projectIdx: 0, commit: "a1b2c3d", branch: "main", status: "completed", riskScore: 12, daysAgo: 0 },
    { projectIdx: 0, commit: "e4f5g6h", branch: "feat/auth", status: "completed", riskScore: 35, daysAgo: 1 },
    { projectIdx: 0, commit: "i7j8k9l", branch: "main", status: "completed", riskScore: 8, daysAgo: 3 },
    { projectIdx: 1, commit: "m0n1o2p", branch: "main", status: "completed", riskScore: 62, daysAgo: 0 },
    { projectIdx: 1, commit: "q3r4s5t", branch: "fix/xss", status: "completed", riskScore: 45, daysAgo: 2 },
    { projectIdx: 1, commit: "u6v7w8x", branch: "main", status: "failed", riskScore: null, daysAgo: 4 },
    { projectIdx: 2, commit: "y9z0a1b", branch: "main", status: "completed", riskScore: 5, daysAgo: 1 },
    { projectIdx: 2, commit: "c2d3e4f", branch: "feat/stripe", status: "running", riskScore: null, daysAgo: 0 },
    { projectIdx: 2, commit: "g5h6i7j", branch: "main", status: "completed", riskScore: 18, daysAgo: 5 },
    { projectIdx: 0, commit: "k8l9m0n", branch: "main", status: "completed", riskScore: 22, daysAgo: 7 },
  ];

  const scans = [];
  for (let i = 0; i < scanData.length; i++) {
    const s = scanData[i];
    const startedAt = new Date(now.getTime() - s.daysAgo * 86400000 - i * 3600000);
    const scan = await prisma.scan.create({
      data: {
        projectId: projects[s.projectIdx].id,
        orgId: org.id,
        commitHash: s.commit,
        branch: s.branch,
        author: "developer@acme.com",
        status: s.status,
        riskScore: s.riskScore,
        startedAt,
        completedAt: s.status === "running" ? null : new Date(startedAt.getTime() + 45000),
      },
    });
    scans.push(scan);
  }

  console.log(`Scans: ${scans.length} created`);

  // Create findings for completed scans with risk > 0
  const severities = ["critical", "high", "medium", "low", "info"];
  const categories = ["injection", "xss", "auth", "crypto", "dependency", "config", "ai-hallucination"];
  const findingTemplates = [
    { type: "sql-injection", title: "SQL Injection in query builder", severity: "critical", category: "injection", file: "src/db/queries.ts", cwe: "CWE-89" },
    { type: "xss-reflected", title: "Reflected XSS in search handler", severity: "high", category: "xss", file: "src/handlers/search.ts", cwe: "CWE-79" },
    { type: "weak-crypto", title: "Use of MD5 for password hashing", severity: "high", category: "crypto", file: "src/auth/hash.ts", cwe: "CWE-328" },
    { type: "missing-auth", title: "Missing authentication on admin endpoint", severity: "critical", category: "auth", file: "src/routes/admin.ts", cwe: "CWE-306" },
    { type: "dep-vuln", title: "Vulnerable dependency: lodash@4.17.20", severity: "medium", category: "dependency", file: "package.json", cwe: "CWE-1395" },
    { type: "hardcoded-secret", title: "Hardcoded API key in configuration", severity: "high", category: "config", file: "src/config.ts", cwe: "CWE-798" },
    { type: "ai-unsafe-eval", title: "AI-generated code uses eval()", severity: "critical", category: "ai-hallucination", file: "src/utils/transform.ts", cwe: "CWE-95" },
    { type: "ai-insecure-random", title: "AI used Math.random() for token generation", severity: "medium", category: "ai-hallucination", file: "src/auth/tokens.ts", cwe: "CWE-330" },
    { type: "path-traversal", title: "Path traversal in file upload handler", severity: "high", category: "injection", file: "src/upload/handler.ts", cwe: "CWE-22" },
    { type: "open-redirect", title: "Open redirect in OAuth callback", severity: "medium", category: "auth", file: "src/auth/callback.ts", cwe: "CWE-601" },
  ];

  let findingCount = 0;
  for (const scan of scans) {
    if (scan.status !== "completed" || !scan.riskScore || scan.riskScore === 0) continue;
    const numFindings = Math.min(Math.ceil(scan.riskScore / 10), findingTemplates.length);
    const selected = findingTemplates.slice(0, numFindings);
    for (const tmpl of selected) {
      await prisma.finding.create({
        data: {
          scanId: scan.id,
          orgId: org.id,
          agentName: "sentinel-scanner",
          type: tmpl.type,
          severity: tmpl.severity,
          category: tmpl.category,
          file: tmpl.file,
          lineStart: Math.floor(Math.random() * 100) + 1,
          lineEnd: Math.floor(Math.random() * 100) + 101,
          title: tmpl.title,
          description: `Detected ${tmpl.title.toLowerCase()} that could lead to security vulnerabilities.`,
          remediation: `Review and fix the ${tmpl.type} issue. See ${tmpl.cwe} for details.`,
          cweId: tmpl.cwe,
          confidence: 0.85 + Math.random() * 0.15,
        },
      });
      findingCount++;
    }
  }

  console.log(`Findings: ${findingCount} created`);

  // Create certificates for low-risk completed scans
  let certCount = 0;
  for (const scan of scans) {
    if (scan.status !== "completed" || !scan.riskScore) continue;
    if (scan.riskScore > 30) continue;

    const issuedAt = scan.completedAt ?? new Date();
    await prisma.certificate.create({
      data: {
        scanId: scan.id,
        orgId: org.id,
        status: scan.riskScore <= 20 ? "pass" : "provisional_pass",
        riskScore: scan.riskScore,
        verdict: { result: scan.riskScore <= 20 ? "pass" : "provisional_pass", riskScore: scan.riskScore },
        scanMetadata: { commitHash: scan.commitHash, branch: scan.branch },
        compliance: { frameworks: ["SOC2", "ISO27001"], checks: 42, passed: 42 - Math.floor(scan.riskScore / 5) },
        signature: `sig_${scan.id.slice(0, 8)}`,
        issuedAt,
        expiresAt: new Date(issuedAt.getTime() + 30 * 86400000),
      },
    });
    certCount++;
  }

  console.log(`Certificates: ${certCount} created`);

  // Create policies
  const policies = await Promise.all([
    prisma.policy.create({
      data: {
        orgId: org.id,
        name: "Critical Vulnerability Gate",
        rules: { maxCritical: 0, maxHigh: 3, blockOnFail: true },
        createdBy: "admin",
      },
    }),
    prisma.policy.create({
      data: {
        orgId: org.id,
        name: "AI Code Review Required",
        rules: { requireAiScan: true, minConfidence: 0.8, categories: ["ai-hallucination"] },
        createdBy: "admin",
      },
    }),
    prisma.policy.create({
      data: {
        orgId: org.id,
        name: "Dependency Freshness",
        rules: { maxDependencyAge: 180, blockOutdated: false, warnOnly: true },
        createdBy: "admin",
      },
    }),
  ]);

  console.log(`Policies: ${policies.map((p) => p.name).join(", ")}`);

  console.log("\nSeed complete!");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });

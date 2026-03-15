// deploy/scripts/validate-drift.ts
// CI script that validates Docker Compose services match Helm values and the service catalog.
import { readFileSync } from "fs";
import { parse } from "yaml";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

interface DriftError {
  severity: "error" | "warning";
  message: string;
}

function loadYaml(path: string): any {
  return parse(readFileSync(resolve(ROOT, path), "utf-8"));
}

function validate(): DriftError[] {
  const errors: DriftError[] = [];
  const catalog = loadYaml("services.yaml");
  const compose = loadYaml("../docker-compose.yml");
  const helmValues = loadYaml("helm/values.yaml");

  // 1. Every service in catalog must exist in Compose (or profile-gated)
  for (const name of Object.keys(catalog.services)) {
    const composeSvc = compose.services?.[name];
    if (!composeSvc) {
      errors.push({
        severity: "error",
        message: `Service "${name}" in catalog but missing from docker-compose.yml`,
      });
    }
  }

  // 2. Health check ports match
  for (const [name, svc] of Object.entries(catalog.services) as any[]) {
    if (!svc.healthCheck?.port) continue;
    const composeSvc = compose.services?.[name];
    if (!composeSvc?.healthcheck) continue;
    const testStr = Array.isArray(composeSvc.healthcheck.test)
      ? composeSvc.healthcheck.test.join(" ")
      : composeSvc.healthcheck.test || "";
    const portMatch = testStr.match(/:(\d+)/);
    if (portMatch && String(svc.healthCheck.port) !== portMatch[1]) {
      errors.push({
        severity: "error",
        message: `Port mismatch "${name}": catalog=${svc.healthCheck.port}, compose=${portMatch[1]}`,
      });
    }
  }

  // 3. Helm workers map to catalog
  if (helmValues.workers) {
    for (const [name, worker] of Object.entries(helmValues.workers) as any[]) {
      if (!worker.enabled) continue;
      const catalogName =
        name === "githubBridge"
          ? "github-bridge"
          : name === "assessor"
            ? "assessor-worker"
            : name === "report"
              ? "report-worker"
              : name === "notification"
                ? "notification-worker"
                : name;
      if (!catalog.services[catalogName]) {
        errors.push({
          severity: "warning",
          message: `Helm worker "${name}" no matching catalog service (expected "${catalogName}")`,
        });
      }
    }
  }

  // 4. Helm agents map to catalog
  for (const tier of ["critical", "batch"]) {
    const agents = helmValues.agents?.[tier];
    if (!agents) continue;
    for (const [name, agent] of Object.entries(agents) as any[]) {
      if (!agent.enabled) continue;
      const catalogName = `agent-${name}`;
      if (!catalog.services[catalogName]) {
        errors.push({
          severity: "warning",
          message: `Helm agent "${name}" (${tier}) no matching catalog service`,
        });
      }
    }
  }

  // 5. Resource limits sanity
  function checkResources(component: string, resources: any) {
    if (!resources?.requests?.memory || !resources?.limits?.memory) return;
    const parseMem = (s: string) => {
      const m = s.match(/^(\d+)(Gi|Mi|Ki)?$/);
      if (!m) return 0;
      const v = parseInt(m[1]);
      return m[2] === "Gi" ? v * 1024 : m[2] === "Ki" ? v / 1024 : v;
    };
    if (parseMem(resources.requests.memory) > parseMem(resources.limits.memory)) {
      errors.push({
        severity: "error",
        message: `${component}: memory request > limit`,
      });
    }
  }
  checkResources("api", helmValues.api?.resources);
  checkResources("dashboard", helmValues.dashboard?.resources);

  return errors;
}

const errors = validate();
const errorCount = errors.filter((e) => e.severity === "error").length;
const warnCount = errors.filter((e) => e.severity === "warning").length;

console.log(`\nDrift validation: ${errors.length} issues found`);
console.log(`  Errors: ${errorCount}`);
console.log(`  Warnings: ${warnCount}\n`);
for (const err of errors) {
  console.log(`  ${err.severity === "error" ? "X" : "!"} ${err.message}`);
}
if (errorCount > 0) {
  console.log("\nDrift validation FAILED");
  process.exit(1);
}
process.exit(0);

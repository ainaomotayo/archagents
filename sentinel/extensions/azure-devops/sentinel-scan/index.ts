import * as tl from "azure-pipelines-task-lib/task";
import { execSync } from "child_process";

async function run(): Promise<void> {
  try {
    const apiUrl = tl.getInput("apiUrl", true)!;
    const apiKey = tl.getInput("apiKey", true)!;
    const secret = tl.getInput("secret", true)!;
    const timeout = tl.getInput("timeout", false) ?? "120";
    const outputFormat = tl.getInput("outputFormat", false) ?? "summary";

    // Install CLI
    tl.debug("Installing @sentinel/cli...");
    execSync("npm install -g @sentinel/cli", { stdio: "inherit" });

    // Build argument list (avoid shell interpolation for security)
    const args = ["ci", "--api-url", apiUrl, "--timeout", timeout];
    if (outputFormat === "json") args.push("--json");
    else if (outputFormat === "sarif") args.push("--sarif");

    // Run scan using tl.tool() for safe argument passing
    const tool = tl.tool("sentinel").arg(args);
    const exitCode = tool.execSync({
      env: {
        ...process.env,
        SENTINEL_API_KEY: apiKey,
        SENTINEL_SECRET: secret,
      } as any,
    }).code;

    if (exitCode === 0) {
      tl.setResult(tl.TaskResult.Succeeded, "SENTINEL scan passed.");
    } else if (exitCode === 1 && tl.getBoolInput("failOnFindings", false)) {
      tl.setResult(tl.TaskResult.Failed, "SENTINEL scan found security issues.");
    } else if (exitCode === 1) {
      tl.warning("SENTINEL scan found issues but failOnFindings is disabled.");
      tl.setResult(tl.TaskResult.SucceededWithIssues, "Findings detected.");
    } else if (exitCode === 3) {
      tl.setResult(tl.TaskResult.SucceededWithIssues, "SENTINEL scan: provisional pass.");
    } else {
      tl.setResult(tl.TaskResult.Failed, `SENTINEL scan error (exit code ${exitCode}).`);
    }
  } catch (err: any) {
    tl.setResult(tl.TaskResult.Failed, `SENTINEL scan error: ${err.message}`);
  }
}

run();

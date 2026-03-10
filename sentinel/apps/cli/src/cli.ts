#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("sentinel")
  .description("AI-Generated Code Governance & Compliance")
  .version("0.1.0");

program
  .command("init")
  .description("Install git hooks and configure project")
  .action(async () => {
    const { installHook } = await import("./git/hook.js");
    await installHook(process.cwd());
    console.log("SENTINEL initialized. Post-commit hook installed.");
  });

program
  .command("scan")
  .description("Scan current changes (runs git diff and submits to API)")
  .option("--api-url <url>", "API base URL", "http://localhost:8080")
  .option("--timeout <seconds>", "Poll timeout in seconds", "120")
  .option("--json", "Output machine-readable JSON report")
  .option("--sarif", "Output findings in SARIF 2.1.0 format")
  .option("--staged", "Scan only staged changes (git diff --cached)")
  .option("--post-commit", "Triggered by post-commit hook (scan HEAD)")
  .action(async (opts) => {
    const { execSync } = await import("child_process");
    const { runCi } = await import("./commands/ci.js");

    // Determine which diff to capture
    let diffCmd = "git diff HEAD";
    if (opts.staged) {
      diffCmd = "git diff --cached";
    } else if (opts.postCommit) {
      diffCmd = "git diff HEAD~1 HEAD";
    }

    let diff: string;
    try {
      diff = execSync(diffCmd, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    } catch {
      console.error("Error: failed to run git diff. Are you in a git repository?");
      process.exit(2);
    }

    if (!diff.trim()) {
      console.log("No changes to scan.");
      process.exit(0);
    }

    const code = await runCi({
      apiUrl: opts.apiUrl,
      apiKey: process.env.SENTINEL_API_KEY ?? "",
      secret: process.env.SENTINEL_SECRET ?? "",
      timeout: parseInt(opts.timeout, 10),
      json: opts.json ?? false,
      sarif: opts.sarif ?? false,
      stdinContent: diff,
    });
    process.exit(code);
  });

program
  .command("ci")
  .description("CI/CD mode — synchronous scan with exit codes")
  .option("--api-url <url>", "API base URL", "http://localhost:8080")
  .option("--timeout <seconds>", "Poll timeout in seconds", "120")
  .option("--json", "Output machine-readable JSON report")
  .option("--sarif", "Output findings in SARIF 2.1.0 format")
  .action(async (opts) => {
    const { runCi } = await import("./commands/ci.js");
    const code = await runCi({
      apiUrl: opts.apiUrl,
      apiKey: process.env.SENTINEL_API_KEY ?? "",
      secret: process.env.SENTINEL_SECRET ?? "",
      timeout: parseInt(opts.timeout, 10),
      json: opts.json ?? false,
      sarif: opts.sarif ?? false,
    });
    process.exit(code);
  });

program.parse();

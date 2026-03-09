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
  .description("Scan current changes")
  .option("--local", "Run analysis locally only")
  .option("--post-commit", "Triggered by post-commit hook")
  .action(async (options) => {
    console.log("Scanning...", options);
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

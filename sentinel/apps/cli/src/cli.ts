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
  .action(async () => {
    console.log("CI mode not yet implemented");
    process.exit(2);
  });

program.parse();

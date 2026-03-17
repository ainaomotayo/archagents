import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GenericDetector } from "../generic.js";

describe("GenericDetector", () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it("has name='generic' and priority=99", () => {
    const detector = new GenericDetector();
    expect(detector.name).toBe("generic");
    expect(detector.priority).toBe(99);
  });

  it("canDetect always returns true", () => {
    const detector = new GenericDetector();
    expect(detector.canDetect()).toBe(true);
  });

  it("detect reads from git commands", () => {
    const mockExec = vi.fn((cmd: string) => {
      if (cmd.includes("rev-parse HEAD")) return "abc123sha\n";
      if (cmd.includes("branch --show-current")) return "feature/local\n";
      if (cmd.includes("config user.name")) return "Local Dev\n";
      if (cmd.includes("remote get-url origin")) return "git@github.com:myorg/myrepo.git\n";
      return "";
    });

    const detector = new GenericDetector(mockExec);
    const env = detector.detect();

    expect(env).toEqual({
      provider: "generic",
      commitSha: "abc123sha",
      branch: "feature/local",
      actor: "Local Dev",
      repository: "myorg/myrepo",
    });
  });

  it("detect parses HTTPS remote URLs", () => {
    const mockExec = vi.fn((cmd: string) => {
      if (cmd.includes("rev-parse HEAD")) return "abc123sha\n";
      if (cmd.includes("branch --show-current")) return "main\n";
      if (cmd.includes("config user.name")) return "Dev\n";
      if (cmd.includes("remote get-url origin")) return "https://github.com/org/repo.git\n";
      return "";
    });

    const detector = new GenericDetector(mockExec);
    const env = detector.detect();

    expect(env.repository).toBe("org/repo");
  });

  it("detect uses 'unknown' fallbacks when git fails", () => {
    const mockExec = vi.fn(() => {
      throw new Error("git not found");
    });

    const detector = new GenericDetector(mockExec);
    const env = detector.detect();

    expect(env).toEqual({
      provider: "generic",
      commitSha: "unknown",
      branch: "unknown",
      actor: "unknown",
      repository: "unknown",
    });
  });
});

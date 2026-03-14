import { describe, it, expect } from "vitest";
import {
  adaptAIDetector,
  adaptDeclared,
  adaptGit,
  adaptLicense,
  AI_COAUTHOR_PATTERNS,
  BOT_AUTHOR_PATTERNS,
} from "../ip-attribution/adapters.js";

describe("adaptAIDetector", () => {
  it("classifies high probability as ai-generated", () => {
    const result = adaptAIDetector("src/foo.ts", {
      aiProbability: 0.85,
      toolName: "copilot",
      dominantSignal: "markers",
      signals: {},
    });
    expect(result).not.toBeNull();
    expect(result!.classification).toBe("ai-generated");
    expect(result!.confidence).toBe(0.85);
    expect(result!.toolName).toBe("copilot");
  });

  it("classifies medium probability as ai-assisted", () => {
    const result = adaptAIDetector("src/foo.ts", {
      aiProbability: 0.50,
      toolName: null,
      dominantSignal: "entropy",
      signals: {},
    });
    expect(result!.classification).toBe("ai-assisted");
    expect(result!.confidence).toBe(0.50);
  });

  it("classifies low probability as human", () => {
    const result = adaptAIDetector("src/foo.ts", {
      aiProbability: 0.10,
      toolName: null,
      dominantSignal: "entropy",
      signals: {},
    });
    expect(result!.classification).toBe("human");
    expect(result!.confidence).toBeCloseTo(0.90);
  });

  it("returns null when no detection data", () => {
    expect(adaptAIDetector("src/foo.ts", null)).toBeNull();
  });
});

describe("adaptDeclared", () => {
  it("returns ai-generated with 0.85 confidence for matching declaration", () => {
    const result = adaptDeclared("src/utils/helper.ts", {
      name: "copilot",
      model: "gpt-4-turbo",
      scope: "src/**",
    });
    expect(result).not.toBeNull();
    expect(result!.classification).toBe("ai-generated");
    expect(result!.confidence).toBe(0.85);
    expect(result!.toolName).toBe("copilot");
    expect(result!.toolModel).toBe("gpt-4-turbo");
  });

  it("returns null when no declaration matches", () => {
    expect(adaptDeclared("src/foo.ts", null)).toBeNull();
  });
});

describe("adaptGit", () => {
  it("detects co-author trailer for copilot", () => {
    const result = adaptGit("src/foo.ts", {
      commitAuthor: "dev",
      commitEmail: "dev@co.com",
      coAuthorTrailers: ["Co-Authored-By: GitHub Copilot"],
      files: [{ path: "src/foo.ts", authors: ["dev"], coAuthors: ["GitHub Copilot"], lastModifiedBy: "dev", commitMessages: [] }],
    });
    expect(result!.classification).toBe("ai-assisted");
    expect(result!.confidence).toBe(0.90);
    expect(result!.toolName).toBe("copilot");
  });

  it("detects bot author", () => {
    const result = adaptGit("src/foo.ts", {
      commitAuthor: "dependabot[bot]",
      commitEmail: "bot@github.com",
      coAuthorTrailers: [],
      files: [{ path: "src/foo.ts", authors: ["dependabot[bot]"], coAuthors: [], lastModifiedBy: "dependabot[bot]", commitMessages: [] }],
    });
    expect(result!.classification).toBe("ai-generated");
    expect(result!.confidence).toBe(0.95);
    expect(result!.toolName).toBe("dependabot");
  });

  it("returns human with low confidence for regular author", () => {
    const result = adaptGit("src/foo.ts", {
      commitAuthor: "dev",
      commitEmail: "dev@co.com",
      coAuthorTrailers: [],
      files: [{ path: "src/foo.ts", authors: ["dev"], coAuthors: [], lastModifiedBy: "dev", commitMessages: [] }],
    });
    expect(result!.classification).toBe("human");
    expect(result!.confidence).toBe(0.60);
  });

  it("returns null when no git metadata", () => {
    expect(adaptGit("src/foo.ts", null)).toBeNull();
    expect(adaptGit("src/foo.ts", undefined as any)).toBeNull();
  });

  it("returns null when file not in git metadata", () => {
    const result = adaptGit("src/missing.ts", {
      commitAuthor: "dev",
      commitEmail: "dev@co.com",
      coAuthorTrailers: [],
      files: [],
    });
    expect(result).toBeNull();
  });

  it("detects Claude co-author case-insensitively", () => {
    const result = adaptGit("src/foo.ts", {
      commitAuthor: "dev",
      commitEmail: "dev@co.com",
      coAuthorTrailers: ["Co-Authored-By: claude"],
      files: [{ path: "src/foo.ts", authors: ["dev"], coAuthors: ["claude"], lastModifiedBy: "dev", commitMessages: [] }],
    });
    expect(result!.toolName).toBe("claude");
  });

  it("detects mixed blame authors", () => {
    const result = adaptGit("src/foo.ts", {
      commitAuthor: "dev",
      commitEmail: "dev@co.com",
      coAuthorTrailers: [],
      files: [{ path: "src/foo.ts", authors: ["dev", "dependabot[bot]"], coAuthors: [], lastModifiedBy: "dev", commitMessages: [] }],
    });
    expect(result!.classification).toBe("mixed");
    expect(result!.confidence).toBe(0.50);
  });
});

describe("adaptLicense", () => {
  it("returns human for high OSS similarity", () => {
    const result = adaptLicense("src/foo.ts", {
      similarityScore: 0.92,
      sourceMatch: "lodash",
      licenseDetected: "MIT",
    });
    expect(result!.classification).toBe("human");
    expect(result!.confidence).toBe(0.92);
  });

  it("returns null for low similarity", () => {
    expect(adaptLicense("src/foo.ts", { similarityScore: 0.40, sourceMatch: null, licenseDetected: null })).toBeNull();
  });

  it("returns null when no license data", () => {
    expect(adaptLicense("src/foo.ts", null)).toBeNull();
  });
});

describe("AI_COAUTHOR_PATTERNS", () => {
  it("includes expected tools", () => {
    const tools = AI_COAUTHOR_PATTERNS.map((p) => p.tool);
    expect(tools).toContain("copilot");
    expect(tools).toContain("claude");
    expect(tools).toContain("cursor");
  });
});

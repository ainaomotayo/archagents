import { describe, it, expect } from "vitest";
import {
  parsePnpmLockfile,
  parsePipRequirements,
  generateSbom,
  sbomToJson,
  type SbomEntry,
  type Sbom,
} from "./sbom-generator.js";

describe("parsePnpmLockfile", () => {
  it("should return empty array for empty input", () => {
    expect(parsePnpmLockfile("")).toEqual([]);
    expect(parsePnpmLockfile("  ")).toEqual([]);
  });

  it("should parse scoped packages from lockfile", () => {
    const lock = `
lockfileVersion: '9.0'
dependencies:
  '@sentinel/shared':
    specifier: workspace:*
    version: link:../shared
packages:
  '@fastify/cors@10.0.2':
    resolution: {integrity: sha512-abc}
  '@types/node@22.12.0':
    resolution: {integrity: sha512-def}
`;
    const entries = parsePnpmLockfile(lock);
    expect(entries.length).toBe(2);
    expect(entries[0].name).toBe("@fastify/cors");
    expect(entries[0].version).toBe("10.0.2");
    expect(entries[0].type).toBe("npm");
    expect(entries[1].name).toBe("@types/node");
    expect(entries[1].version).toBe("22.12.0");
  });

  it("should parse unscoped packages from lockfile", () => {
    const lock = `
lockfileVersion: '9.0'
packages:
  'vitest@3.0.5':
    resolution: {integrity: sha512-xyz}
  'typescript@5.7.3':
    resolution: {integrity: sha512-uvw}
`;
    const entries = parsePnpmLockfile(lock);
    expect(entries.length).toBe(2);
    expect(entries[0].name).toBe("vitest");
    expect(entries[0].version).toBe("3.0.5");
    expect(entries[1].name).toBe("typescript");
    expect(entries[1].version).toBe("5.7.3");
  });

  it("should mark direct dependencies correctly", () => {
    const lock = `
lockfileVersion: '9.0'
dependencies:
  'vitest':
    specifier: ^3.0
    version: 3.0.5
packages:
  'vitest@3.0.5':
    resolution: {integrity: sha512-xyz}
  'chai@5.0.0':
    resolution: {integrity: sha512-abc}
`;
    const entries = parsePnpmLockfile(lock);
    const vitest = entries.find((e) => e.name === "vitest");
    const chai = entries.find((e) => e.name === "chai");
    expect(vitest?.directDependency).toBe(true);
    expect(chai?.directDependency).toBe(false);
  });

  it("should default license to UNKNOWN", () => {
    const lock = `
packages:
  'debug@4.4.0':
    resolution: {integrity: sha512-abc}
`;
    const entries = parsePnpmLockfile(lock);
    expect(entries[0].license).toBe("UNKNOWN");
  });
});

describe("parsePipRequirements", () => {
  it("should return empty array for empty input", () => {
    expect(parsePipRequirements("")).toEqual([]);
    expect(parsePipRequirements("  ")).toEqual([]);
  });

  it("should parse pinned versions (==)", () => {
    const reqs = `
flask==3.1.0
requests==2.32.3
`;
    const entries = parsePipRequirements(reqs);
    expect(entries.length).toBe(2);
    expect(entries[0]).toEqual({
      name: "flask",
      version: "3.1.0",
      type: "pypi",
      license: "UNKNOWN",
      directDependency: true,
    });
    expect(entries[1].name).toBe("requests");
    expect(entries[1].version).toBe("2.32.3");
  });

  it("should parse minimum versions (>=)", () => {
    const reqs = "numpy>=1.26.0\npandas>=2.0";
    const entries = parsePipRequirements(reqs);
    expect(entries.length).toBe(2);
    expect(entries[0].name).toBe("numpy");
    expect(entries[0].version).toBe("1.26.0");
  });

  it("should handle packages without version specifiers", () => {
    const reqs = "black\nruff\nmypy";
    const entries = parsePipRequirements(reqs);
    expect(entries.length).toBe(3);
    expect(entries[0].version).toBe("unspecified");
  });

  it("should skip comments and flags", () => {
    const reqs = `
# This is a comment
-r base.txt
-e git+https://github.com/example/repo.git
flask==3.1.0
`;
    const entries = parsePipRequirements(reqs);
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe("flask");
  });
});

describe("generateSbom", () => {
  it("should produce a valid CycloneDX 1.5 SBOM", () => {
    const entries: SbomEntry[] = [
      {
        name: "express",
        version: "4.21.0",
        type: "npm",
        license: "MIT",
        directDependency: true,
      },
    ];
    const sbom = generateSbom(entries, "0.1.0");
    expect(sbom.format).toBe("CycloneDX");
    expect(sbom.specVersion).toBe("1.5");
    expect(sbom.project).toBe("sentinel");
    expect(sbom.version).toBe("0.1.0");
    expect(sbom.generatedAt).toBeTruthy();
    expect(sbom.components).toEqual(entries);
  });

  it("should set generatedAt to a valid ISO timestamp", () => {
    const sbom = generateSbom([], "1.0.0");
    const date = new Date(sbom.generatedAt);
    expect(date.getTime()).not.toBeNaN();
  });

  it("should handle empty components list", () => {
    const sbom = generateSbom([], "0.0.1");
    expect(sbom.components).toEqual([]);
  });
});

describe("sbomToJson", () => {
  it("should produce valid JSON string", () => {
    const sbom: Sbom = {
      format: "CycloneDX",
      specVersion: "1.5",
      project: "sentinel",
      version: "0.1.0",
      generatedAt: "2026-03-09T00:00:00.000Z",
      components: [],
    };
    const json = sbomToJson(sbom);
    const parsed = JSON.parse(json);
    expect(parsed.format).toBe("CycloneDX");
    expect(parsed.specVersion).toBe("1.5");
  });

  it("should produce formatted JSON with indentation", () => {
    const sbom = generateSbom([], "1.0.0");
    const json = sbomToJson(sbom);
    expect(json).toContain("\n");
    expect(json).toContain("  ");
  });
});

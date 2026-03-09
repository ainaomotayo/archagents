/**
 * SBOM (Software Bill of Materials) generation for SENTINEL.
 * Produces CycloneDX 1.5 format SBOMs from pnpm lockfiles and pip requirements.
 */

export interface SbomEntry {
  name: string;
  version: string;
  type: "npm" | "pypi";
  license: string;
  directDependency: boolean;
}

export interface Sbom {
  format: "CycloneDX";
  specVersion: "1.5";
  project: string;
  version: string;
  generatedAt: string;
  components: SbomEntry[];
  signature?: string;
}

/**
 * Parse a pnpm-lock.yaml content string and extract dependency entries.
 *
 * Handles the pnpm v9 lockfile format where packages are listed under
 * the `packages:` key with entries like `/@scope/name@version:` or `/name@version:`.
 */
export function parsePnpmLockfile(lockContent: string): SbomEntry[] {
  const entries: SbomEntry[] = [];
  if (!lockContent || lockContent.trim().length === 0) {
    return entries;
  }

  const lines = lockContent.split("\n");
  let inPackages = false;
  let inDependencies = false;
  const directDeps = new Set<string>();

  // First pass: collect direct dependencies from the `dependencies:` / `devDependencies:` sections
  let inDepSection = false;
  for (const line of lines) {
    if (/^(dependencies|devDependencies):/.test(line)) {
      inDepSection = true;
      continue;
    }
    if (inDepSection && /^\S/.test(line)) {
      inDepSection = false;
    }
    if (inDepSection) {
      const depMatch = line.match(/^\s+'?([^':]+)'?:/);
      if (depMatch) {
        directDeps.add(depMatch[1]);
      }
    }
  }

  // Second pass: collect packages
  for (const line of lines) {
    if (/^packages:/.test(line)) {
      inPackages = true;
      inDependencies = false;
      continue;
    }
    if (inPackages && /^\S/.test(line) && !/^packages:/.test(line)) {
      inPackages = false;
    }

    if (inPackages) {
      // Match patterns like:  /@scope/name@version: or /name@version:
      // Also handle pnpm v9 format: '@scope/name@version':
      const pkgMatch = line.match(
        /^\s+'?\/?(@[^@/]+\/[^@]+|[^@/][^@]*)@([^:'(]+)/,
      );
      if (pkgMatch) {
        const name = pkgMatch[1].trim();
        const version = pkgMatch[2].trim();
        entries.push({
          name,
          version,
          type: "npm",
          license: "UNKNOWN",
          directDependency: directDeps.has(name),
        });
      }
    }
  }

  return entries;
}

/**
 * Parse a pip requirements.txt or `pip freeze` output and extract dependency entries.
 *
 * Supports formats:
 *   - `package==version`
 *   - `package>=version` (uses the specified version as minimum)
 *   - `package` (no version pinned)
 *   - Lines starting with # or -r/-e are skipped
 */
export function parsePipRequirements(requirementsContent: string): SbomEntry[] {
  const entries: SbomEntry[] = [];
  if (!requirementsContent || requirementsContent.trim().length === 0) {
    return entries;
  }

  const lines = requirementsContent.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("-")) {
      continue;
    }

    // Match package==version, package>=version, package~=version, package!=version
    const match = line.match(/^([a-zA-Z0-9_.-]+)\s*([><=!~]+)\s*([^\s;#]+)/);
    if (match) {
      entries.push({
        name: match[1],
        version: match[3],
        type: "pypi",
        license: "UNKNOWN",
        directDependency: true,
      });
    } else {
      // Package name only, no version specifier
      const nameOnly = line.match(/^([a-zA-Z0-9_.-]+)/);
      if (nameOnly) {
        entries.push({
          name: nameOnly[1],
          version: "unspecified",
          type: "pypi",
          license: "UNKNOWN",
          directDependency: true,
        });
      }
    }
  }

  return entries;
}

/**
 * Generate a CycloneDX 1.5 format SBOM from a list of entries.
 */
export function generateSbom(
  entries: SbomEntry[],
  projectVersion: string,
): Sbom {
  return {
    format: "CycloneDX",
    specVersion: "1.5",
    project: "sentinel",
    version: projectVersion,
    generatedAt: new Date().toISOString(),
    components: entries,
  };
}

/**
 * Serialize an SBOM to a formatted JSON string.
 */
export function sbomToJson(sbom: Sbom): string {
  return JSON.stringify(sbom, null, 2);
}

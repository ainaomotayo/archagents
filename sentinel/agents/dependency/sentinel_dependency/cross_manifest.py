"""Cross-file manifest analysis.

Detects issues when a diff touches multiple manifest files:
- Duplicate declarations: same package in multiple manifests of the same ecosystem
- Cross-ecosystem overlap: functionally equivalent packages across ecosystems
- Version conflicts: same package declared with different versions
"""

from __future__ import annotations

from collections import defaultdict

from sentinel_agents.types import Confidence, Finding, Severity

from sentinel_dependency.manifest_parser import DependencyDeclaration

# Cross-ecosystem equivalence groups — packages that serve the same purpose
_CROSS_ECOSYSTEM: list[dict[str, list[str]]] = [
    # HTTP clients
    {"PyPI": ["requests", "httpx", "aiohttp"], "npm": ["axios", "got", "node-fetch", "undici"]},
    # Web frameworks
    {"PyPI": ["flask", "django", "fastapi"], "npm": ["express", "fastify", "koa"]},
    # ORM / DB
    {"PyPI": ["sqlalchemy", "peewee"], "npm": ["knex", "prisma", "sequelize", "typeorm"]},
    # Testing
    {"PyPI": ["pytest", "unittest2"], "npm": ["jest", "vitest", "mocha"]},
    # Task queue / job
    {"PyPI": ["celery", "rq", "dramatiq"], "npm": ["bull", "bullmq", "agenda"]},
    # Linting / formatting
    {"PyPI": ["ruff", "flake8", "black"], "npm": ["eslint", "prettier", "biome"]},
]


def detect_cross_manifest_issues(
    deps: list[DependencyDeclaration],
) -> list[Finding]:
    """Analyse dependencies parsed from multiple manifest files.

    Returns findings for:
    1. Duplicate declarations — same package in >1 manifest of same ecosystem
    2. Version conflicts — same package with different versions across manifests
    3. Cross-ecosystem overlap — equivalent packages in different ecosystems
    """
    if not deps:
        return []

    findings: list[Finding] = []

    # Group by (ecosystem, package_name)
    by_pkg: dict[tuple[str, str], list[DependencyDeclaration]] = defaultdict(list)
    for dep in deps:
        by_pkg[(dep.ecosystem, dep.package_name)].append(dep)

    # 1 + 2: Duplicate declarations and version conflicts
    for (ecosystem, pkg_name), decls in by_pkg.items():
        if len(decls) < 2:
            continue

        # Multiple manifests declaring the same package
        manifest_files = sorted({d.file_path for d in decls})
        if len(manifest_files) < 2:
            continue  # same file, not cross-manifest

        # Check for version conflicts
        versions = {d.version for d in decls if d.version}
        if len(versions) > 1:
            findings.append(Finding(
                type="dependency",
                file=decls[0].file_path,
                line_start=decls[0].line_number,
                line_end=decls[0].line_number,
                severity=Severity.HIGH,
                confidence=Confidence.HIGH,
                title=f"Version conflict: {pkg_name} ({', '.join(sorted(versions))})",
                description=(
                    f"Package '{pkg_name}' is declared with different versions "
                    f"across manifests: {', '.join(manifest_files)}. "
                    f"Versions found: {', '.join(sorted(versions))}."
                ),
                remediation=f"Align '{pkg_name}' to a single version across all manifests.",
                category="version-conflict",
                scanner="cross-manifest",
                extra={
                    "package": pkg_name,
                    "findingType": "version-conflict",
                    "manifests": manifest_files,
                    "versions": sorted(versions),
                },
            ))
        else:
            findings.append(Finding(
                type="dependency",
                file=decls[0].file_path,
                line_start=decls[0].line_number,
                line_end=decls[0].line_number,
                severity=Severity.LOW,
                confidence=Confidence.HIGH,
                title=f"Duplicate declaration: {pkg_name}",
                description=(
                    f"Package '{pkg_name}' is declared in multiple manifests: "
                    f"{', '.join(manifest_files)}. This may cause version drift."
                ),
                remediation=f"Consolidate '{pkg_name}' into a single manifest.",
                category="duplicate-dependency",
                scanner="cross-manifest",
                extra={
                    "package": pkg_name,
                    "findingType": "duplicate-dependency",
                    "manifests": manifest_files,
                },
            ))

    # 3: Cross-ecosystem overlap
    ecosystems_present = {dep.ecosystem for dep in deps}
    if len(ecosystems_present) >= 2:
        for group in _CROSS_ECOSYSTEM:
            matched: list[DependencyDeclaration] = []
            for dep in deps:
                eco_pkgs = group.get(dep.ecosystem, [])
                if dep.package_name in eco_pkgs:
                    matched.append(dep)

            # Only flag if we have matches from 2+ ecosystems
            matched_ecosystems = {m.ecosystem for m in matched}
            if len(matched_ecosystems) >= 2:
                pkg_names = sorted({f"{m.package_name} ({m.ecosystem})" for m in matched})
                findings.append(Finding(
                    type="dependency",
                    file=matched[0].file_path,
                    line_start=matched[0].line_number,
                    line_end=matched[0].line_number,
                    severity=Severity.INFO,
                    confidence=Confidence.MEDIUM,
                    title=f"Cross-ecosystem overlap: {', '.join(pkg_names)}",
                    description=(
                        f"Functionally equivalent packages detected across ecosystems: "
                        f"{', '.join(pkg_names)}. This is expected in polyglot projects "
                        f"but worth noting for dependency review."
                    ),
                    remediation="Review whether both ecosystem dependencies are needed.",
                    category="cross-ecosystem-overlap",
                    scanner="cross-manifest",
                    extra={
                        "findingType": "cross-ecosystem-overlap",
                        "packages": [
                            {"name": m.package_name, "ecosystem": m.ecosystem}
                            for m in matched
                        ],
                    },
                ))

    return findings

from __future__ import annotations

import re

from sentinel_agents.types import DiffEvent, Finding, Severity, Confidence

# Category mapping: what packages serve the same purpose
PACKAGE_CATEGORIES: dict[str, list[list[str]]] = {
    "javascript": [
        ["axios", "got", "node-fetch", "undici", "ky", "superagent"],  # HTTP client
        ["lodash", "underscore", "ramda"],  # Utility library
        ["moment", "dayjs", "date-fns", "luxon"],  # Date handling
        ["jest", "vitest", "mocha", "ava", "tap"],  # Testing
        ["express", "fastify", "koa", "hapi"],  # Web framework
        ["winston", "pino", "bunyan", "morgan"],  # Logging
        ["knex", "prisma", "sequelize", "typeorm", "drizzle"],  # ORM/Query builder
        ["react", "vue", "svelte", "angular", "solid"],  # UI framework
        ["webpack", "vite", "rollup", "esbuild", "parcel"],  # Bundler
    ],
    "python": [
        ["requests", "httpx", "aiohttp", "urllib3"],  # HTTP client
        ["flask", "django", "fastapi", "starlette", "bottle"],  # Web framework
        ["pytest", "unittest", "nose2"],  # Testing
        ["sqlalchemy", "peewee", "tortoise-orm", "django-orm"],  # ORM
        ["celery", "rq", "dramatiq", "huey"],  # Task queue
        ["pandas", "polars", "dask"],  # Data manipulation
        ["pillow", "opencv-python", "scikit-image"],  # Image processing
        ["numpy", "jax", "torch"],  # Numerical computing
    ],
}


def extract_imports(event: DiffEvent) -> list[tuple[str, str, int]]:
    """Extract (package_name, file_path, line_num) from added lines."""
    imports: list[tuple[str, str, int]] = []

    for diff_file in event.files:
        for hunk in diff_file.hunks:
            current_line = hunk.new_start
            for raw_line in hunk.content.splitlines():
                if not raw_line.startswith("+") or raw_line.startswith("+++"):
                    if not raw_line.startswith("-"):
                        current_line += 1
                    continue
                line = raw_line[1:].strip()
                current_line += 1

                # Python: import X, from X import Y
                py_match = re.match(r"(?:from|import)\s+([\w.]+)", line)
                if py_match:
                    pkg = py_match.group(1).split(".")[0]
                    imports.append((pkg, diff_file.path, current_line - 1))

                # JavaScript: require('X'), import ... from 'X'
                js_match = re.search(
                    r"""(?:require\s*\(\s*['"]|from\s+['"]) ([\w@/.-]+)['"]""", line, re.X
                )
                if js_match:
                    pkg = js_match.group(1).split("/")[0]
                    if pkg.startswith("@"):
                        # Scoped package: @scope/name
                        parts = js_match.group(1).split("/")
                        pkg = "/".join(parts[:2]) if len(parts) > 1 else parts[0]
                    imports.append((pkg, diff_file.path, current_line - 1))

    return imports


def detect_drift(event: DiffEvent, existing_deps: set[str] | None = None) -> list[Finding]:
    """Detect architectural drift when AI introduces overlapping dependencies."""
    if existing_deps is None:
        existing_deps = set()

    findings: list[Finding] = []
    imports = extract_imports(event)

    for pkg, file_path, line_num in imports:
        if pkg in existing_deps:
            continue  # Already used, not drift

        # Check if this package overlaps with an existing dep by category
        lang = "python" if file_path.endswith(".py") else "javascript"
        categories = PACKAGE_CATEGORIES.get(lang, [])

        for category in categories:
            if pkg in category:
                existing_in_category = existing_deps & set(category)
                if existing_in_category:
                    existing_pkg = sorted(existing_in_category)[0]
                    findings.append(
                        Finding(
                            type="dependency",
                            file=file_path,
                            line_start=line_num,
                            line_end=line_num,
                            severity=Severity.MEDIUM,
                            confidence=Confidence.HIGH,
                            title=f"Architectural drift: {pkg} vs {existing_pkg}",
                            description=(
                                f"AI introduced '{pkg}' but project already uses "
                                f"'{existing_pkg}' for the same purpose"
                            ),
                            remediation=f"Use '{existing_pkg}' instead of '{pkg}'",
                            category="architectural-drift",
                            scanner="drift-detector",
                            extra={
                                "package": pkg,
                                "findingType": "architectural-drift",
                                "existingAlternative": existing_pkg,
                            },
                        )
                    )
                break

    return findings

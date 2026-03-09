from __future__ import annotations

from sentinel_agents.types import Finding, Severity, Confidence

# Top popular packages (would be a larger list in production)
POPULAR_PACKAGES = {
    "python": [
        "requests", "flask", "django", "numpy", "pandas", "scipy",
        "tensorflow", "torch", "sqlalchemy", "celery", "fastapi",
        "pydantic", "httpx", "pillow", "boto3", "pytest", "beautifulsoup4",
        "cryptography", "paramiko", "aiohttp",
    ],
    "javascript": [
        "express", "react", "vue", "angular", "lodash", "axios",
        "moment", "webpack", "typescript", "eslint", "prettier",
        "jest", "mocha", "chalk", "commander", "inquirer",
        "dotenv", "cors", "helmet", "mongoose",
    ],
}


def levenshtein(s1: str, s2: str) -> int:
    """Compute Levenshtein distance between two strings."""
    if len(s1) < len(s2):
        return levenshtein(s2, s1)
    if len(s2) == 0:
        return len(s1)

    prev_row = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        curr_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = prev_row[j + 1] + 1
            deletions = curr_row[j] + 1
            substitutions = prev_row[j] + (c1 != c2)
            curr_row.append(min(insertions, deletions, substitutions))
        prev_row = curr_row

    return prev_row[-1]


def detect_typosquats(
    packages: list[tuple[str, str, int]],
    language: str = "python",
) -> list[Finding]:
    """Check extracted imports for potential typosquats of popular packages."""
    findings: list[Finding] = []
    popular = POPULAR_PACKAGES.get(language, []) + POPULAR_PACKAGES.get("javascript", [])

    for pkg, file_path, line_num in packages:
        if pkg in popular:
            continue  # Exact match -- legitimate

        for known in popular:
            dist = levenshtein(pkg.lower(), known.lower())
            # Flag if distance is 1-2 (likely typo) and package is not identical
            if 0 < dist <= 2 and len(pkg) >= 4:
                findings.append(
                    Finding(
                        type="dependency",
                        file=file_path,
                        line_start=line_num,
                        line_end=line_num,
                        severity=Severity.HIGH,
                        confidence=Confidence.MEDIUM,
                        title=f"Possible typosquat: '{pkg}' (similar to '{known}')",
                        description=(
                            f"Package '{pkg}' is {dist} edit(s) away from "
                            f"popular package '{known}'"
                        ),
                        remediation=(
                            f"Verify '{pkg}' is the intended package, "
                            f"not a typosquat of '{known}'"
                        ),
                        category="typosquat",
                        scanner="typosquat-detector",
                        extra={
                            "package": pkg,
                            "findingType": "typosquat",
                            "existingAlternative": known,
                        },
                    )
                )
                break  # Only report first match per package

    return findings

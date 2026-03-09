from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Any


class Severity(str, enum.Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class Confidence(str, enum.Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass
class DiffHunk:
    old_start: int
    old_count: int
    new_start: int
    new_count: int
    content: str


@dataclass
class DiffFile:
    path: str
    language: str
    hunks: list[DiffHunk]
    ai_score: float


@dataclass
class ScanConfig:
    security_level: str  # "standard" | "strict" | "audit"
    license_policy: str
    quality_threshold: float


@dataclass
class DiffEvent:
    scan_id: str
    project_id: str
    commit_hash: str
    branch: str
    author: str
    timestamp: str
    files: list[DiffFile]
    scan_config: ScanConfig

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> DiffEvent:
        payload = data.get("payload", data)
        files = []
        for f in payload.get("files", []):
            hunks = [
                DiffHunk(
                    old_start=h["oldStart"],
                    old_count=h["oldCount"],
                    new_start=h["newStart"],
                    new_count=h["newCount"],
                    content=h["content"],
                )
                for h in f.get("hunks", [])
            ]
            files.append(
                DiffFile(
                    path=f["path"],
                    language=f.get("language", "unknown"),
                    hunks=hunks,
                    ai_score=f.get("aiScore", 0.0),
                )
            )

        config_data = payload.get("scanConfig", {})
        scan_config = ScanConfig(
            security_level=config_data.get("securityLevel", "standard"),
            license_policy=config_data.get("licensePolicy", ""),
            quality_threshold=config_data.get("qualityThreshold", 0.7),
        )

        return cls(
            scan_id=data.get("scanId", ""),
            project_id=payload.get("projectId", ""),
            commit_hash=payload.get("commitHash", ""),
            branch=payload.get("branch", ""),
            author=payload.get("author", ""),
            timestamp=payload.get("timestamp", ""),
            files=files,
            scan_config=scan_config,
        )


@dataclass
class Finding:
    type: str  # "security" | "license" | "quality" | "policy" | "dependency" | "ai-detection"
    file: str
    line_start: int
    line_end: int
    severity: Severity
    confidence: Confidence
    title: str = ""
    description: str = ""
    remediation: str = ""
    category: str = ""
    scanner: str = ""
    cwe_id: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        result = {
            "type": self.type,
            "file": self.file,
            "lineStart": self.line_start,
            "lineEnd": self.line_end,
            "severity": self.severity.value,
            "confidence": self.confidence.value,
            "title": self.title,
            "description": self.description,
            "remediation": self.remediation,
            "category": self.category,
            "scanner": self.scanner,
            "cweId": self.cwe_id,
        }
        result.update(self.extra)
        return result


@dataclass
class FindingEvent:
    scan_id: str
    agent_name: str
    findings: list[Finding]
    agent_version: str
    ruleset_version: str
    ruleset_hash: str
    status: str  # "completed" | "error" | "timeout"
    duration_ms: int
    error_detail: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        result = {
            "scanId": self.scan_id,
            "agentName": self.agent_name,
            "findings": [f.to_dict() for f in self.findings],
            "agentResult": {
                "agentName": self.agent_name,
                "agentVersion": self.agent_version,
                "rulesetVersion": self.ruleset_version,
                "rulesetHash": self.ruleset_hash,
                "status": self.status,
                "findingCount": len(self.findings),
                "durationMs": self.duration_ms,
                "errorDetail": self.error_detail,
            },
        }
        if self.extra:
            result["extra"] = self.extra
        return result


@dataclass
class AgentHealth:
    name: str
    version: str
    status: str  # "healthy" | "degraded" | "unhealthy"
    detail: str = ""

# SENTINEL Security Whitepaper

**Version:** 1.0
**Date:** 2026-03-09
**Classification:** Public

## 1. Executive Summary

SENTINEL is an AI-generated code governance and compliance platform that
provides automated scanning, risk assessment, and compliance certification for
software development pipelines. This whitepaper describes the security
architecture, data handling practices, and compliance posture of SENTINEL for
use in procurement and security review processes.

## 2. Architecture Overview

SENTINEL follows a multi-tenant, event-driven architecture:

- **API Layer** -- Stateless HTTP API with HMAC-SHA256 request authentication
- **Agent Pipeline** -- Isolated analysis agents (security, license, quality, policy, dependency, AI-detection)
- **Assessor** -- Risk scoring and compliance certificate generation
- **Dashboard** -- Role-based web interface with SSO integration
- **Audit Log** -- Immutable, hash-chained event log

All components run in isolated containers with no shared mutable state between
tenants.

## 3. Authentication & Authorization

### 3.1 API Authentication

All API requests (except `/health`) require HMAC-SHA256 signatures:

- Clients sign the request body with a shared secret
- The signature is sent in the `X-Sentinel-Signature` header
- Signatures are validated using constant-time comparison to prevent timing attacks
- Replay protection via timestamp validation (5-minute window)

### 3.2 Dashboard Authentication

- OAuth 2.0 / OIDC integration (GitHub, Google, enterprise SSO)
- JWT-based session tokens with configurable expiry
- Refresh token rotation

### 3.3 Role-Based Access Control (RBAC)

Four roles with least-privilege defaults:

| Role     | Scans | Findings | Certificates | Policies | Audit | Admin |
|----------|-------|----------|--------------|----------|-------|-------|
| viewer   | read  | read     | read         | read     | --    | --    |
| auditor  | read  | read     | read         | read     | read  | --    |
| admin    | write | write    | write        | write    | read  | read  |
| owner    | write | write    | write        | write    | read  | write |

## 4. Data Security

### 4.1 Encryption

- **In transit:** TLS 1.3 for all external connections
- **At rest:** AES-256-GCM encryption via cloud KMS
- **Secrets:** AWS KMS (or equivalent) for key management; no plaintext secrets in configuration

### 4.2 Data Handling

- Code diffs are processed in-memory and not persisted after scan completion
- Findings and assessments reference file paths and line numbers but do not store source code
- PII/secret scrubbing runs before any data leaves the analysis pipeline
- Tenant data is logically isolated using organization-scoped database queries

### 4.3 Crypto-Shredding

On tenant offboarding, all encryption keys for that tenant are destroyed,
rendering stored data unrecoverable. This covers:

- Scan metadata
- Findings
- Certificates
- Audit log entries

### 4.4 Data Retention

- Scan metadata: Configurable (default 90 days)
- Certificates: Retained for compliance period (default 1 year)
- Audit logs: Retained for compliance period (default 7 years)
- Code diffs: Not retained (processed in-memory only)

## 5. Compliance Certificates

### 5.1 Certificate Integrity

Compliance certificates are cryptographically signed:

- HMAC-SHA256 signature over the full certificate payload
- Certificate includes hash of the scanning environment configuration
- Each agent's ruleset version and hash are recorded
- Certificates can be independently verified using the public verification endpoint

### 5.2 Certificate Revocation

Certificates can be revoked when:

- A scanning agent is found to have had a defect
- Policy changes retroactively invalidate a prior assessment
- Manual revocation by an authorized administrator

Revocation is recorded in the immutable audit log.

## 6. Audit Log

The audit log provides tamper-evident recording of all system events:

- **Hash chaining:** Each event includes a SHA-256 hash of the previous event
- **Immutability:** Append-only storage; no update or delete operations
- **Coverage:** All API calls, scan lifecycle events, policy changes, certificate issuance/revocation
- **Retention:** Configurable, default 7 years for regulatory compliance

## 7. Infrastructure Security

### 7.1 Container Security

- All containers run as non-root users
- Read-only root filesystems where possible
- No privileged containers
- Resource limits (CPU, memory) enforced per container
- SBOM generation for all container images

### 7.2 Network Security

- Internal service communication over private networks only
- No direct internet egress from analysis agents
- API gateway with rate limiting and DDoS protection
- Network policies restrict inter-service communication to required paths

### 7.3 Secret Management

- No secrets in environment variables or configuration files
- Cloud KMS integration for encryption key management
- Secret rotation supported without downtime

## 8. Supply Chain Security

SENTINEL practices what it preaches:

- **Self-scanning:** SENTINEL runs its own compliance pipeline on every commit
- **SBOM generation:** Software Bill of Materials generated for every release
- **Dependency auditing:** Automated CVE scanning of all dependencies
- **Signed releases:** All release artifacts are cryptographically signed

## 9. Incident Response

- Automated alerting on anomalous scan patterns
- Defined escalation procedures for security findings in the platform itself
- Certificate mass-revocation capability for agent-level defects
- Audit log provides complete forensic trail

## 10. Compliance Mapping

### 10.1 SOC 2

SENTINEL maps to SOC 2 Trust Services Criteria:

- **CC6.1:** Logical access controls (RBAC, HMAC auth)
- **CC6.6:** Encryption of data in transit and at rest
- **CC7.1:** System monitoring (audit log, health checks)
- **CC7.2:** Anomaly detection and alerting
- **CC8.1:** Change management (policy versioning, audit trail)

### 10.2 ISO 27001

Relevant controls:

- **A.9:** Access control (RBAC, authentication)
- **A.10:** Cryptography (TLS, AES-256, HMAC signing)
- **A.12:** Operations security (logging, monitoring)
- **A.14:** System development security (scanning pipeline)

### 10.3 EU AI Act

SENTINEL supports EU AI Act compliance by:

- Tracking AI-generation probability for all scanned code
- Recording AI tool attribution
- Providing human oversight verification fields in certificates
- Maintaining documentation of AI composition trends

## 11. Contact

For security inquiries or to report vulnerabilities:

- Email: security@sentinel.example.com
- Response SLA: 24 hours for critical issues

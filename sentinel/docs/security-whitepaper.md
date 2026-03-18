# SENTINEL Security Whitepaper

**Version:** 2.0
**Date:** 2026-03-18
**Classification:** Public
**Supersedes:** Version 1.0 (2026-03-09)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Threat Model](#3-threat-model)
4. [Authentication and Authorization](#4-authentication-and-authorization)
5. [Data Security and Encryption](#5-data-security-and-encryption)
6. [Data Retention and the Right to Erasure](#6-data-retention-and-the-right-to-erasure)
7. [Compliance Certificates and Integrity](#7-compliance-certificates-and-integrity)
8. [Audit Log and Forensic Trail](#8-audit-log-and-forensic-trail)
9. [Infrastructure and Container Security](#9-infrastructure-and-container-security)
10. [Network Security and Zero Trust](#10-network-security-and-zero-trust)
11. [Supply Chain Security](#11-supply-chain-security)
12. [Vulnerability Management](#12-vulnerability-management)
13. [Incident Response](#13-incident-response)
14. [Compliance Framework Mapping](#14-compliance-framework-mapping)
    - [14.1 SOC 2 Type I/II (AICPA TSC 2017/2022)](#141-soc-2-type-iii-aicpa-tsc-20172022)
    - [14.2 ISO/IEC 27001:2022](#142-isoiec-270012022)
    - [14.3 EU AI Act (Regulation (EU) 2024/1689)](#143-eu-ai-act-regulation-eu-20241689)
    - [14.4 GDPR (Regulation (EU) 2016/679)](#144-gdpr-regulation-eu-20160679)
    - [14.5 NIST SP 800-53 Rev. 5](#145-nist-sp-800-53-rev-5)
15. [Penetration Testing and Security Assessments](#15-penetration-testing-and-security-assessments)
16. [Cryptographic Standards Reference](#16-cryptographic-standards-reference)
17. [Security Contacts and Disclosure Policy](#17-security-contacts-and-disclosure-policy)

---

## 1. Executive Summary

SENTINEL is an AI-generated code governance and compliance platform that provides automated security scanning, risk assessment, and cryptographically signed compliance certification for software development pipelines. It is designed to operate in highly regulated environments including financial services, healthcare, critical infrastructure, and government sectors.

This whitepaper describes SENTINEL's security architecture, cryptographic controls, data handling practices, and alignment with major regulatory frameworks for use in enterprise procurement reviews, third-party risk assessments, and compliance audits.

**Key security properties:**

- All API communication authenticated with HMAC-SHA256 (NIST SP 800-107); replay protection via 5-minute timestamp window
- TLS 1.3 enforced for all external connections per NIST SP 800-52 Rev. 2 (mandatory for U.S. federal systems as of 1 January 2024)
- AES-256-GCM encryption at rest (FIPS 197); keys managed via cloud KMS (AWS KMS, Google Cloud KMS, Azure Key Vault)
- Envelope encryption with Data Encryption Keys (DEKs) protected by Customer Master Keys (CMKs) per NIST SP 800-57 Rev. 5
- Crypto-shredding for GDPR Article 17 compliance — CMK destruction renders tenant data permanently unrecoverable
- Immutable, hash-chained audit log (SHA-256) with 7-year default retention
- Multi-tenant isolation via PostgreSQL row-level security and application-layer org scoping
- Severity-tiered data retention policies with dual-admin approval workflow
- SLSA Build Level 2 provenance — signed provenance attestations for every release artifact
- SBOM generation per NTIA minimum elements for all container images

---

## 2. Architecture Overview

SENTINEL follows a multi-tier, event-driven architecture with defence-in-depth at each layer.

```
┌─────────────────────────────────────────────────────────────────┐
│                         External Zone                           │
│  CLI / GitHub App / Azure DevOps / Browser (TLS 1.3 enforced)  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HMAC-SHA256 signed requests
┌───────────────────────────▼─────────────────────────────────────┐
│                         API Gateway                             │
│   Fastify 5 · Rate limiting · CORS · Request signature verify  │
└────────┬──────────────────────────────────────────┬────────────┘
         │                                          │
         ▼                                          ▼
┌────────────────┐                      ┌───────────────────────┐
│  PostgreSQL 16 │                      │   Redis 7 Streams     │
│  (RLS + org    │                      │   (sentinel.diffs     │
│   scoping)     │                      │    sentinel.findings) │
└────────────────┘                      └──────────┬────────────┘
                                                   │
                         ┌─────────────────────────┼──────────────┐
                         ▼          ▼              ▼              ▼
                    ┌─────────┐ ┌────────┐  ┌──────────┐  ┌────────────┐
                    │Security │ │License │  │ Quality  │  │Dependency  │
                    │ Agent   │ │ Agent  │  │  Agent   │  │  Agent     │
                    └────┬────┘ └───┬────┘  └────┬─────┘  └────┬───────┘
                         └──────────┴─────────────┴─────────────┘
                                              │
                                              ▼
                                   ┌─────────────────────┐
                                   │  Compliance Assessor │
                                   │  (weighted risk 0-100│
                                   │   HMAC certificate)  │
                                   └──────────┬──────────┘
                                              │
                              ┌───────────────┴───────────────┐
                              ▼                               ▼
                     HMAC Certificate                  Cloud Archive
                     (PostgreSQL + S3/GCS/             (S3 Object Lock /
                      Azure Blob Object Lock)           GCS Retention /
                                                        Azure Immutable Blob)
```

### Component Isolation

All components are deployed as isolated containers with:

- Non-root user execution (UID ≥ 1000)
- Read-only root filesystems where possible
- No shared writable volumes between tenant workloads
- Resource limits (CPU, memory) enforced at the container runtime layer
- Network policies restricting lateral movement

Analysis agents operate in a strict consumer role — they read from Redis Streams and write findings back, with no direct database access and no inbound network ports.

---

## 3. Threat Model

SENTINEL's threat model follows the STRIDE methodology (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege). The primary asset classes and corresponding threats are:

### 3.1 Assets

| Asset Class | Sensitivity | Protection Mechanism |
|-------------|-------------|---------------------|
| Code diff content | High | Not persisted; processed in-memory only |
| Findings and scan metadata | High | AES-256-GCM at rest; org-scoped access |
| Compliance certificates | Critical | HMAC-signed; Object Lock archival |
| Audit log | Critical | Hash-chained; append-only |
| Encryption keys (CMKs) | Critical | HSM-backed cloud KMS; never leave KMS |
| API credentials | High | HMAC-signed; 5-minute replay window |
| Archive destination credentials | High | AES-256-GCM; stored as encrypted blobs |

### 3.2 Threat Actors

| Actor | Capability | Primary Mitigations |
|-------|-----------|---------------------|
| External attacker (unauthenticated) | Network-level, API brute force | HMAC auth, rate limiting, TLS 1.3 |
| Compromised CI/CD credential | Valid API key, single org scope | Org isolation, audit log, key rotation |
| Malicious insider | Database/infrastructure access | RLS, no plaintext keys, audit log, crypto-shred |
| Supply chain attacker | Dependency or build system compromise | SLSA provenance, SBOM, self-scanning, Sigstore |
| State-level adversary | Advanced persistent threat | Defence-in-depth, HSM-backed KMS, audit log |

### 3.3 Out of Scope

- Physical security of third-party cloud provider data centres
- Client-side security of developer workstations submitting scans
- Zero-day vulnerabilities in upstream dependencies published after SENTINEL's last dependency scan

---

## 4. Authentication and Authorization

### 4.1 API Authentication: HMAC-SHA256

All API requests, except the unauthenticated `/health` and `/metrics` endpoints, require an `X-Sentinel-Signature` header:

```
X-Sentinel-Signature: t=<unix-epoch-seconds>,sig=<HMAC-SHA256-hex>
```

The HMAC input is `t=<timestamp>.<request-body>` — the signature covers both the timestamp and the exact body bytes. This protects against:

- **Request forgery**: Signature is tied to the body; any modification invalidates it
- **Replay attacks**: Timestamp is validated within a ±300-second window; stale requests are rejected
- **Timing attacks**: Validation uses constant-time comparison (`crypto.timingSafeEqual`) per NIST SP 800-107

The shared secret is stored as an environment variable and is never persisted to the database. Secrets should be rotated periodically via key management workflows without service interruption.

**Standards alignment:** NIST SP 800-107 Rev. 1 (HMAC), RFC 2104 (HMAC definition), NIST FIPS 198-1 (Keyed-Hash MAC)

### 4.2 Dashboard Authentication: OAuth 2.0 / OIDC

The dashboard authenticates users via industry-standard protocols using [NextAuth.js](https://next-auth.js.org/):

| Provider Type | Supported Providers | Protocol |
|---------------|---------------------|----------|
| Git hosting | GitHub, GitLab (cloud and self-managed) | OAuth 2.0 + OIDC |
| Enterprise IdP | Okta, Auth0, Azure AD/Entra ID, Keycloak, Ping Identity | OIDC 1.0 |
| SAML 2.0 | Okta, Azure AD, Ping, OneLogin, ADFS | SAML 2.0 via BoxyHQ SAML Jackson |

Session tokens are:

- JWT-based with configurable TTL (default: 30 minutes access, 24-hour refresh)
- Signed with `NEXTAUTH_SECRET` (HS256)
- HTTP-only, Secure, SameSite=Strict cookies — not accessible via JavaScript
- Refresh token rotation on every use (prevents token theft reuse)

**Standards alignment:** RFC 6749 (OAuth 2.0), RFC 8414 (OAuth 2.0 Authorization Server Metadata), OpenID Connect Core 1.0, RFC 7519 (JWT), SAML 2.0 (OASIS)

### 4.3 SCIM 2.0 Automated Provisioning

SENTINEL implements SCIM 2.0 (RFC 7644) for automated user lifecycle management:

- **Just-In-Time provisioning** for OIDC/SAML logins
- **SCIM push** for bulk provisioning from Okta, Azure AD, OneLogin
- **De-provisioning**: Deleting a SCIM user revokes all active sessions and marks the account inactive within the RBAC system

### 4.4 Role-Based Access Control (RBAC)

SENTINEL implements a five-role RBAC model following the principle of least privilege:

| Role | Scans | Findings | Certificates | Policies | Audit | Settings | Data Retention |
|------|-------|----------|--------------|----------|-------|----------|----------------|
| **viewer** | read | read | read | read | — | — | — |
| **developer** | read/write | read | read | read | — | — | — |
| **manager** | read/write | read/write | read/write | read/write | read | — | — |
| **admin** | read/write | read/write | read/write | read/write | read | read/write | propose/approve |
| **service** | read/write | — | read | — | — | — | — |

Role assignments are recorded in the audit log. Roles can be managed via the dashboard UI, the API, or SCIM group mappings from the IdP.

**Dual-admin approval**: Sensitive operations (retention policy changes, encryption key rotation) require a second admin to approve. The proposer cannot self-approve. This is enforced at the API layer regardless of client.

---

## 5. Data Security and Encryption

### 5.1 Encryption in Transit

| Connection Path | Protocol | Cipher Suites |
|----------------|----------|---------------|
| Client → API | TLS 1.3 | TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256 |
| Client → Dashboard | TLS 1.3 | Same as above |
| API → PostgreSQL | TLS 1.3 (required) | FIPS-approved cipher suites |
| API → Redis | TLS 1.3 (TLS-enabled deployments) | FIPS-approved cipher suites |
| API → Cloud KMS | TLS 1.3 | Provider-managed |
| API → Cloud Storage | TLS 1.3 | Provider-managed |
| Internal container-to-container | Private Docker/K8s network | Traffic isolated to bridge/CNI network |

**TLS 1.2 minimum is enforced**; TLS 1.0 and 1.1 are disabled. On Kubernetes deployments with a service mesh, mutual TLS (mTLS) can be enabled via Istio.

NIST SP 800-52 Rev. 2 requires TLS 1.3 support for all U.S. federal information systems as of 1 January 2024. SENTINEL meets this requirement.

### 5.2 Encryption at Rest

SENTINEL uses **envelope encryption** as described in NIST SP 800-57 Rev. 5:

1. A **Data Encryption Key (DEK)** — a random 256-bit AES key — is generated per record (or per credential)
2. The DEK encrypts the plaintext data using AES-256-GCM with a random 96-bit nonce (IV) and 128-bit authentication tag
3. The DEK is itself encrypted by a **Customer Master Key (CMK)** stored in the cloud KMS HSM
4. The encrypted DEK, IV, and ciphertext are stored together in the database

This design ensures that CMKs never leave the KMS HSM boundary. Even with full database access, an attacker cannot decrypt data without access to the KMS.

| Data Class | Encryption Method | Key Storage |
|------------|-------------------|-------------|
| Archive destination credentials | AES-256-GCM (DEK) | Encrypted DEK in `EncryptedCredential` table; CMK in cloud KMS |
| Database fields containing PII | PostgreSQL TDE or application-layer AES-256-GCM | Cloud KMS |
| Compliance certificates at rest | AES-256-GCM (if cloud archive enabled) | Cloud KMS |
| Cloud archive objects | Server-side encryption with KMS-managed keys | AWS SSE-KMS / GCS CMEK / Azure SSE |

**Algorithms in use:**

| Algorithm | Standard | Use |
|-----------|----------|-----|
| AES-256-GCM | FIPS 197, NIST SP 800-38D | Symmetric data encryption, credential encryption |
| HMAC-SHA256 | FIPS 198-1, NIST SP 800-107 | API request signing, certificate integrity |
| SHA-256 | FIPS 180-4 | Audit log hash chaining, certificate hashes |
| RSA-2048 / EC P-256 | NIST SP 800-56A | TLS certificate asymmetric operations |
| HKDF (HMAC-SHA256) | RFC 5869 | TLS 1.3 key derivation (via TLS library) |

### 5.3 Key Management

SENTINEL integrates with three cloud KMS providers:

| Provider | Service | Key Type |
|----------|---------|----------|
| **AWS** | AWS KMS | Customer Managed Key (CMK), HSM-backed, automatic annual rotation |
| **Google Cloud** | Cloud KMS | Customer Managed Encryption Key (CMEK), software or HSM-backed |
| **Azure** | Azure Key Vault | Key Vault Keys, HSM-backed Premium tier recommended |

Key management practices per NIST SP 800-57 Rev. 5:

- CMKs are never exported from the KMS hardware boundary
- DEKs are rotated on each new write operation for high-sensitivity data
- CMK rotation is supported without service interruption via key version aliasing
- Key usage is logged via KMS access logs (CloudTrail, Cloud Audit Logs, Key Vault audit logs)
- Separation of duties: KMS key administrators cannot use keys for encryption operations

For on-premises deployments without cloud KMS, SENTINEL ships with a local software KMS (`LocalKmsProvider`) for development and a pluggable `KmsProvider` interface for integration with HashiCorp Vault or custom HSM solutions.

### 5.4 Data Minimisation and Code Diff Handling

Code diff content submitted to SENTINEL is processed as follows:

1. The diff payload is received by the API server over TLS
2. It is published to the Redis Streams event bus (`sentinel.diffs`)
3. Analysis agents consume the event, process the diff in-memory, and publish findings
4. The original diff is **not persisted to the database** — only metadata (file paths, line numbers, language, AI probability score) is stored
5. Redis Streams have a configurable maxlen; processed events are trimmed after acknowledgement by all consumer groups

This design minimises exposure of potentially sensitive source code. SENTINEL does not function as a code repository.

---

## 6. Data Retention and the Right to Erasure

### 6.1 Retention Policy

SENTINEL implements configurable, severity-tiered data retention:

| Data Class | Default Retention | Notes |
|------------|------------------|-------|
| Code diffs | 0 (not persisted) | Processed in-memory only |
| Scan metadata and findings | Tiered: 14–730 days by severity | Configurable via retention policy |
| Agent results | Same as scan minimum tier | Linked to scans |
| Compliance certificates | 365 days (default) | Object Lock enforces minimum |
| Audit log | 7 years | Regulatory minimum for SOC 2, ISO 27001 |
| Encryption key metadata | Until CMK deletion | CMK deletion triggers crypto-shred |

Retention policies support four presets aligned to common organisational needs:

| Preset | Critical | High | Medium | Low |
|--------|----------|------|--------|-----|
| Minimal | 90 days | 60 days | 30 days | 14 days |
| Standard | 365 days | 180 days | 90 days | 30 days |
| Compliance | 730 days | 365 days | 180 days | 90 days |
| Custom | ≥7 days | ≥7 days | ≥7 days | ≥7 days |

Policy changes require dual-admin approval and are recorded in the audit log with the full policy snapshot.

### 6.2 GDPR Article 17 — Crypto-Shredding

SENTINEL implements **crypto-shredding** as the primary mechanism for GDPR Article 17 (Right to Erasure) compliance. Crypto-shredding is recognised by the European Data Protection Board (EDPB) as an accepted technique for rendering personal data irrecoverable in distributed systems where traditional deletion is impractical (e.g., database replicas, backup tapes, immutable audit logs).

**Crypto-shred process:**

```
POST /v1/admin/crypto-shred
{
  "orgId": "org_abc123",
  "reason": "Customer data deletion request (GDPR Art. 17)"
}
```

1. All DEKs associated with the organisation's data are identified
2. The CMK used to protect those DEKs is scheduled for deletion via the cloud KMS API
3. AWS KMS: 7-30 day waiting period before permanent deletion (configurable)
4. GCP Cloud KMS: key version destruction is instantaneous after scheduling
5. Azure Key Vault: soft-delete + purge; immediate with `--bypass-soft-delete` flag
6. Once the CMK is destroyed, all encrypted DEKs are permanently unreadable
7. The crypto-shred event is recorded in the audit log with the initiator, timestamp, and reason

**What is rendered irrecoverable:**

- All scan metadata and findings for the organisation
- All compliance certificates stored in the database
- All archive destination credentials
- All retention policy records

**What is NOT destroyed (regulatory exceptions under Art. 17(3)(b)):**

- Audit log entries — retained for legal compliance; entries do not contain code content
- Compliance certificates in Object Lock storage (WORM) — immutable until retention period expires

This approach is consistent with guidance from the EDPB and aligns with best practices used by organisations such as Spotify (Padlock system) and cloud-native data platforms using Apache Kafka.

The EDPB has designated Article 17 compliance as the subject of its **2025 Coordinated Supervisory Action**, making operational readiness for right-to-erasure requests a regulatory priority across EU member states.

### 6.3 Archive Before Delete

SENTINEL supports archiving scan data to external destinations before deletion. Supported protocols:

| Destination | Format | Encryption |
|-------------|--------|------------|
| Amazon S3 | JSONL, compressed | S3 SSE-KMS or SSE-S3 |
| Google Cloud Storage | JSONL, compressed | GCS CMEK |
| Azure Blob Storage | JSONL, compressed | Azure SSE with Key Vault |
| Webhook | Batched POST (1,000 records) | TLS 1.3 in transit |
| SFTP | JSONL | SSH key or password (stored encrypted) |

Archive credentials are encrypted at rest using the envelope encryption scheme described in §5.2.

---

## 7. Compliance Certificates and Integrity

### 7.1 Certificate Structure

Every scan that completes successfully generates a compliance certificate. The certificate payload includes:

```json
{
  "id": "cert_abc123",
  "orgId": "org_xyz",
  "scanId": "scan_def456",
  "status": "full_pass",
  "riskScore": 12,
  "findings": { "critical": 0, "high": 0, "medium": 1, "low": 2 },
  "agentVersions": {
    "security": "1.4.2",
    "dependency": "1.3.0",
    ...
  },
  "policyHash": "sha256:abcdef...",
  "issuedAt": "2026-03-18T10:00:00Z",
  "expiresAt": "2027-03-18T10:00:00Z",
  "signature": "t=1710000000,sig=<HMAC-SHA256>"
}
```

The signature is computed as `HMAC-SHA256(SENTINEL_SECRET, canonical-JSON-of-all-fields-except-signature)`.

### 7.2 Certificate Verification

Certificates can be verified independently:

```bash
# Verify certificate signature
curl -X POST https://api.sentinel.example.com/v1/certificates/cert_abc123/verify
```

The verification endpoint recomputes the HMAC over the stored certificate payload and compares it to the stored signature using constant-time comparison. A verification response of `{"valid": true}` confirms the certificate has not been modified since issuance.

### 7.3 Immutable Archival (WORM)

For regulated industries requiring tamper-proof certificate storage, SENTINEL supports Write-Once Read-Many (WORM) archival:

| Platform | Mechanism | Mode |
|----------|-----------|------|
| Amazon S3 | S3 Object Lock | COMPLIANCE mode (not even root can delete) |
| Google Cloud Storage | Object retention locks | Project-level retention policy |
| Azure Blob Storage | Immutability policies | WORM — time-based retention |

Object Lock in COMPLIANCE mode prevents deletion or overwriting by any user, including the AWS account root, during the retention period. This provides the strongest guarantee for long-term certificate integrity required by SOC 2 and ISO 27001 evidence retention obligations.

### 7.4 Certificate Revocation

Certificates can be revoked in the following circumstances:

- A scanning agent ruleset is found to have had a defect affecting the assessment
- A policy change retroactively invalidates a prior assessment
- Manual revocation by an authorised administrator

All revocations are recorded in the immutable audit log with the reason, the revoker's identity, and a timestamp. Mass revocation is supported for agent-level defects affecting multiple certificates.

---

## 8. Audit Log and Forensic Trail

### 8.1 Design

The SENTINEL audit log is an append-only, tamper-evident record of all system events. It implements a **hash chain** — each log entry includes the SHA-256 hash of the previous entry:

```
Entry N: { ...event data..., previousHash: SHA-256(Entry N-1) }
SHA-256(Entry N) → stored as previousHash of Entry N+1
```

This structure means that any retroactive modification of an entry invalidates all subsequent hashes, making tampering detectable during log verification.

### 8.2 Coverage

Every significant system event generates an audit log entry:

| Category | Events Captured |
|----------|----------------|
| **Authentication** | Login, logout, failed auth, session expiry |
| **Scan lifecycle** | Scan submitted, scanning, completed, failed |
| **Findings** | Finding acknowledged, status changed |
| **Certificates** | Issued, verified, revoked |
| **Policies** | Created, updated, deleted, version bump |
| **Access control** | User invited, role changed, user removed |
| **Retention** | Policy change proposed, approved, rejected; cleanup job executed |
| **Crypto-shred** | Initiated, CMK deletion scheduled, completed |
| **API keys** | Created, last-used, revoked |
| **Admin operations** | Key rotation, DLQ drain, config changes |

### 8.3 Retention

The audit log is retained for a minimum of 7 years (configurable), consistent with SOC 2, ISO 27001, and most financial regulatory requirements. Audit logs are stored in a separate append-only table and are excluded from the general data retention cleanup job.

### 8.4 Query and Export

The audit log is queryable via the `/v1/audit` API with filtering by actor, action, resource type, date range, and organisation. Log entries can be exported in JSON format for ingestion by SIEM systems (Splunk, Elastic Security, Microsoft Sentinel).

---

## 9. Infrastructure and Container Security

### 9.1 Container Security Baseline

All SENTINEL container images are built with the following baseline controls:

| Control | Implementation |
|---------|---------------|
| Non-root execution | All containers run as UID ≥ 1000; `USER` directive in Dockerfile |
| Read-only root filesystem | `readOnlyRootFilesystem: true` in K8s SecurityContext where possible |
| No privilege escalation | `allowPrivilegeEscalation: false` in SecurityContext |
| No privileged containers | `privileged: false` enforced by PodSecurityPolicy / OPA Gatekeeper |
| Resource limits | CPU and memory limits defined for every container |
| Image signing | Container images signed with Sigstore/cosign at build time |
| Distroless base images | API and agents use minimal base images (Google distroless or Alpine) to reduce attack surface |
| SBOM generation | CycloneDX and SPDX SBOMs generated for every image via Syft |

### 9.2 Kubernetes Security Hardening

For Kubernetes deployments:

| Control | Mechanism |
|---------|-----------|
| Network policies | Deny-all default; allow-list per service pair |
| Pod Security Standards | `restricted` profile enforced via PSA |
| PodDisruptionBudgets | `minAvailable: 1` for API, dashboard, critical agents |
| RBAC | Least-privilege K8s ServiceAccounts per component |
| Secret management | Kubernetes Secrets or external secrets operator (AWS Secrets Manager, GCP Secret Manager, Azure Key Vault) |
| Image pull policy | `Always` for production; pinned SHA digests in values.yaml |
| Topology spread | Anti-affinity across availability zones |

### 9.3 SBOM (Software Bill of Materials)

SENTINEL generates SBOMs per NTIA minimum elements and the Cybersecurity Executive Order (EO 14028, May 2021):

- **Format**: CycloneDX 1.6 (JSON) and SPDX 2.3
- **Scope**: All container images, all Node.js packages, all Python packages
- **Trigger**: Automated on every CI build via GitHub Actions
- **Distribution**: Attached as build attestation and available via the SENTINEL security portal

SBOMs are signed with [Sigstore](https://sigstore.dev/) cosign and published to the transparency log (Rekor), providing verifiable provenance for every release.

---

## 10. Network Security and Zero Trust

### 10.1 Network Isolation

SENTINEL uses layered network isolation in both Docker Compose and Kubernetes deployments:

**Docker Compose:**
- `sentinel-internal` network: PostgreSQL, Redis, all agents, workers — no external access
- `sentinel-external` network: API server and dashboard only — exposed via published ports or reverse proxy
- Analysis agents have no inbound ports and no internet egress

**Kubernetes:**
- `NetworkPolicy` deny-all default; allow-list rules for each service pair
- Ingress controller (nginx or AWS ALB) handles TLS termination
- Internal service communication over ClusterIP; no NodePort exposure
- Optional Istio service mesh for mutual TLS (mTLS) between all pods

### 10.2 Zero Trust Alignment (NIST SP 800-207)

SENTINEL's architecture aligns with the Zero Trust principles defined in NIST SP 800-207:

| ZT Principle | SENTINEL Implementation |
|-------------|------------------------|
| All resources treated as untrusted | Every API request requires HMAC authentication regardless of network origin |
| Secure all communication | TLS 1.3 for all external paths; mTLS option for internal K8s traffic |
| Per-session least-privilege access | RBAC enforced per request; no persistent elevated sessions |
| Dynamic access control | Role changes take effect immediately; session tokens carry role at issuance |
| Continuous monitoring | Prometheus metrics, structured logs, audit log for all events |
| Never implicit trust from network location | API authentication is not bypassed for internal network callers |

NIST SP 800-207A provides supplemental ZTA guidance for cloud-native multi-cloud deployments, which SENTINEL's Helm chart aligns with through service account-based Workload Identity (GKE) and IRSA (EKS).

### 10.3 API Gateway Controls

| Control | Configuration |
|---------|--------------|
| Rate limiting | 100 requests/minute per IP (configurable via `RATE_LIMIT_MAX`) |
| Body size limit | 10 MB maximum request body (nginx `proxy_body_size`) |
| CORS | Configurable allow-list; defaults to same-origin |
| HTTP headers | HSTS, X-Content-Type-Options, X-Frame-Options, CSP enforced by dashboard |
| DDoS protection | Cloud-layer (AWS Shield Standard, GCP Cloud Armor, Azure DDoS Protection) at ingress |

---

## 11. Supply Chain Security

SENTINEL operates as a supply chain security tool and holds itself to the same standards it enforces on customer code.

### 11.1 SLSA Framework Alignment

SENTINEL targets **SLSA Build Level 2** per the [SLSA specification v1.0](https://slsa.dev/spec/v1.0/levels) (released April 2023 by OpenSSF):

| SLSA Level | Requirement | SENTINEL Status |
|-----------|-------------|-----------------|
| Level 1 | Build produces provenance | ✅ GitHub Actions generates SLSA provenance attestations |
| Level 2 | Signed provenance; hosted build | ✅ Provenance signed by GitHub Actions OIDC token; cosign signing |
| Level 3 | Hardened, isolated build environment | In progress — ephemeral GitHub-hosted runners provide per-build isolation |

Level 2 provenance attestations are attached to every container image and npm/PyPI release via `slsa-verifier` compatible metadata.

### 11.2 Self-Scanning

SENTINEL scans its own codebase on every commit via a GitHub Actions workflow:

```yaml
# .github/workflows/sentinel-self-scan.yml
- name: Run SENTINEL Self-Scan
  run: git diff ${{ github.event.before }}..${{ github.sha }} | sentinel ci \
       --api-url ${{ secrets.SENTINEL_API_URL }} \
       --fail-on critical,high
```

Security findings in SENTINEL's own codebase block merges to the `main` branch.

### 11.3 Dependency Vulnerability Management

- All Node.js dependencies scanned against the **OSV database** (Google Open Source Vulnerability) on every CI run
- All Python agent dependencies scanned using the same OSV integration
- CVE findings are classified using **CVSS v4.0** scores (released November 2023 by FIRST), with Base + Threat + Environmental scores used for prioritisation
- Critical CVEs (CVSS ≥ 9.0) in direct dependencies block deployments
- Dependabot / Renovate configured for automated dependency update PRs
- **CWE Top 25** (MITRE, updated annually) used to prioritise weakness classes in dependency scanning rules

### 11.4 Signed Releases

All release artifacts are signed:

| Artifact | Signing Tool | Verification |
|----------|-------------|-------------|
| Container images | cosign (Sigstore) | `cosign verify --certificate-oidc-issuer=...` |
| npm packages (`@sentinel/cli`) | npm provenance (linked to GitHub Actions) | `npm audit signatures` |
| GitHub release tarballs | GitHub Actions release signing | Verified against Rekor transparency log |

Sigstore's transparency log (Rekor) provides an immutable, publicly auditable record of all signing events, enabling detection of signing key compromise.

### 11.5 SBOM Generation

SBOMs are generated at build time per NTIA minimum elements:

- Supplier name and version
- Unique identifier (package URL / PURL)
- Dependency relationships
- Author of the SBOM data
- Timestamp

SBOMs are stored alongside release artifacts and are available for customer due diligence and supply chain risk assessment.

---

## 12. Vulnerability Management

### 12.1 Security Scanning in the Development Pipeline

| Stage | Tool | What It Checks |
|-------|------|----------------|
| Pre-commit | SENTINEL self-scan | Security, license, quality, policy |
| PR review | GitHub CodeQL | Static analysis for CWEs |
| CI build | Semgrep | Custom security rules + OWASP Top 10:2021 patterns |
| CI build | OSV Scanner | Dependency CVEs |
| Release | Trivy | Container image CVE scan |
| Runtime | Falco (optional) | Anomalous container behaviour |

### 12.2 OWASP Top 10 Coverage

SENTINEL's security agent detects patterns from the [OWASP Top 10:2021](https://owasp.org/www-project-top-ten/):

| OWASP Category | Detection Method | SENTINEL Agent |
|----------------|-----------------|----------------|
| A01 Broken Access Control | Pattern matching, policy rules | Security, Policy |
| A02 Cryptographic Failures | Hardcoded keys, weak algorithms | Security |
| A03 Injection (SQL, command, LDAP) | Semgrep rules + custom patterns | Security |
| A04 Insecure Design | Architecture pattern analysis | Policy |
| A05 Security Misconfiguration | Config file scanning | Security, Policy |
| A06 Vulnerable and Outdated Components | OSV CVE lookup | Dependency |
| A07 Identification and Authentication Failures | Auth pattern detection | Security |
| A08 Software and Data Integrity Failures | Dependency integrity checks | Dependency |
| A09 Security Logging and Monitoring Failures | Logging pattern checks | Quality, Policy |
| A10 SSRF | URL construction pattern detection | Security |

For AI-generated code reviewed through the LLM agent, SENTINEL also screens against the [OWASP Top 10 for LLM Applications 2025](https://genai.owasp.org/llm-top-10/), including prompt injection risks, excessive agency, and system prompt leakage patterns.

### 12.3 Vulnerability Disclosure

See §17 for the responsible disclosure policy. SENTINEL follows a 90-day coordinated disclosure timeline for reported vulnerabilities.

---

## 13. Incident Response

### 13.1 Incident Classification

| Severity | Definition | Initial Response SLA |
|----------|-----------|---------------------|
| **P0 — Critical** | Active exploitation, data breach, certificate mass compromise | 1 hour |
| **P1 — High** | CVSS ≥ 7.0 in production, service disruption, auth bypass | 4 hours |
| **P2 — Medium** | CVSS 4.0–6.9, degraded functionality | 24 hours |
| **P3 — Low** | CVSS < 4.0, minor issues | 72 hours |

### 13.2 Incident Response Phases

1. **Detection**: Prometheus alerts, audit log anomalies, external reports, SIEM correlations
2. **Triage**: Classify severity; escalate to on-call security engineer for P0/P1
3. **Containment**: Isolate affected components; revoke compromised credentials; block malicious IPs
4. **Eradication**: Remove root cause; apply patches; rotate compromised secrets
5. **Recovery**: Validate fixes; restore services; verify audit log integrity
6. **Post-incident review**: Root cause analysis; update runbooks; notify affected customers if required

### 13.3 Certificate Mass Revocation

In the event of a scanning agent defect that affects assessment integrity, SENTINEL supports bulk revocation:

```bash
# Revoke all certificates issued by the affected agent version
POST /v1/admin/certificates/bulk-revoke
{
  "agentName": "security",
  "affectedVersions": ["1.3.0", "1.3.1"],
  "reason": "Semgrep rule false-negative in versions 1.3.0-1.3.1"
}
```

Customers can subscribe to certificate revocation webhooks to receive real-time notification.

### 13.4 Notification Obligations

For data security incidents involving personal data, SENTINEL triggers:

- Internal P0 escalation within 1 hour of detection
- Customer notification within 24 hours for confirmed incidents involving their data
- EU supervisory authority notification within 72 hours per GDPR Article 33 (where applicable)
- Customer notification to their own data subjects per GDPR Article 34 if the breach is likely to result in high risk

---

## 14. Compliance Framework Mapping

### 14.1 SOC 2 Type I/II (AICPA TSC 2017/2022)

The AICPA [Trust Services Criteria 2017 (revised 2022)](https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022) define the five trust service categories. SENTINEL targets the **Security (Common Criteria)** category as mandatory, with optional Availability and Confidentiality criteria:

#### Common Criteria (CC) — Security

| Criterion | Description | SENTINEL Control |
|-----------|-------------|-----------------|
| **CC1.1** | Integrity and ethics commitment | Security policy, code of conduct |
| **CC1.2** | Board oversight | Executive security review process |
| **CC1.3** | Authority and responsibility | RBAC with 5 defined roles; SCIM provisioning |
| **CC1.4** | Competence | Security training; agent ruleset review process |
| **CC1.5** | Accountability | Audit log captures all actions with actor identity |
| **CC2.1** | Information quality | Structured findings with CVSS scores, CWE tags, agent version |
| **CC2.2** | Internal communication | Slack/Teams/PagerDuty notification integration |
| **CC2.3** | External communication | HMAC-signed certificates; OpenAPI-documented API |
| **CC3.1** | Risk objectives | Weighted 0–100 risk scoring model |
| **CC3.2** | Risk identification | 7-agent automated scanning pipeline |
| **CC3.3** | Fraud risk | AI detection agent; PII scrubbing |
| **CC3.4** | Change impact | Drift detection; policy change audit trail |
| **CC4.1** | Ongoing monitoring | Prometheus metrics; continuous scan pipeline |
| **CC4.2** | Deficiency remediation | Finding status workflow; remediation tracking |
| **CC5.1** | Risk mitigation | Policy enforcement gates; approval workflows |
| **CC5.2** | Technology controls | Infrastructure-as-code; Helm charts; CI/CD |
| **CC5.3** | Policy deployment | YAML policy engine with org/repo inheritance |
| **CC6.1** | Access control | RBAC; HMAC authentication; OIDC/SAML SSO |
| **CC6.2** | Access provisioning | SCIM 2.0; invitation-based onboarding |
| **CC6.3** | Access removal | SCIM de-provisioning; session invalidation |
| **CC6.6** | Logical access threats | TLS 1.3; AES-256-GCM; HMAC signing |
| **CC6.7** | Data access restriction | PostgreSQL RLS; org-scoped queries |
| **CC6.8** | Unauthorised access prevention | Auth middleware on all routes; rate limiting |
| **CC7.1** | Infrastructure monitoring | Prometheus + Grafana; health checks |
| **CC7.2** | Incident detection | Alertmanager rules; anomaly detection |
| **CC7.3** | Incident response | Documented runbook; on-call escalation |
| **CC7.4** | Recovery | Backup and restore procedures; multi-AZ deployment |
| **CC8.1** | Change authorisation | PR-based workflow; required code reviews; CI gates |
| **CC9.1** | Risk mitigation activities | Certificate revocation; policy versioning |
| **CC9.2** | Vendor risk | Dependency license scanning; SBOM; OSV CVE scan |

#### Availability (A)

| Criterion | SENTINEL Control |
|-----------|-----------------|
| **A1.1** | SLO commitments and capacity management | Kubernetes HPA; KEDA Redis-based agent autoscaling |
| **A1.2** | Environmental threats | Multi-AZ deployment; PodDisruptionBudgets |
| **A1.3** | Recovery | Documented backup/restore; RTO/RPO targets |

#### Confidentiality (C)

| Criterion | SENTINEL Control |
|-----------|-----------------|
| **C1.1** | Confidential information identification | Data classification policy; code diffs not persisted |
| **C1.2** | Disposal of confidential information | Crypto-shredding; retention cleanup jobs |

---

### 14.2 ISO/IEC 27001:2022

SENTINEL aligns with [ISO/IEC 27001:2022](https://www.iso.org/standard/82875.html), which restructures controls into **four themes** (93 controls total, compared to 114 in the 2013 edition). The transition deadline of October 2025 has passed; SENTINEL is designed against the 2022 revision.

#### Organisational Controls (A.5.1–A.5.37)

| Control | Description | SENTINEL Implementation |
|---------|-------------|------------------------|
| **A.5.1** | Information security policies | Security whitepaper, data handling policies |
| **A.5.7** | Threat intelligence *(new in 2022)* | OSV CVE feed; MITRE CWE Top 25; OWASP Top 10 |
| **A.5.9** | Inventory of information and assets | SBOM for all container images and packages |
| **A.5.14** | Information transfer | TLS 1.3 for all data in transit; HMAC signing |
| **A.5.23** | Cloud service security *(new in 2022)* | Cloud KMS integration; VPC-native deployments; cloud-specific security guides |
| **A.5.24** | Information security incident management | Documented incident response procedure (§13) |
| **A.5.26** | Response to information security incidents | P0-P3 SLAs; escalation paths |
| **A.5.28** | Collection of evidence | Immutable hash-chained audit log |
| **A.5.33** | Protection of records | 7-year audit log retention; Object Lock for certificates |
| **A.5.34** | Privacy and PII protection | GDPR Article 17 crypto-shredding; data minimisation |

#### People Controls (A.6.1–A.6.8)

| Control | Description | SENTINEL Implementation |
|---------|-------------|------------------------|
| **A.6.1** | Screening | Background checks for staff with production access |
| **A.6.3** | Information security awareness | Security training; OWASP Top 10 awareness |
| **A.6.7** | Remote working | TLS 1.3; VPN for production access; MFA required |
| **A.6.8** | Information security event reporting | Internal reporting channel; responsible disclosure |

#### Physical Controls (A.7.1–A.7.14)

Physical security of data centres is delegated to AWS/GCP/Azure, which maintain ISO 27001, SOC 2 Type II, and PCI-DSS certifications. For on-premises deployments, customers are responsible for physical controls.

#### Technological Controls (A.8.1–A.8.34)

| Control | Description | SENTINEL Implementation |
|---------|-------------|------------------------|
| **A.8.2** | Privileged access rights | RBAC least-privilege; no shared admin accounts |
| **A.8.3** | Information access restriction | Org-scoped API; PostgreSQL RLS |
| **A.8.5** | Secure authentication | MFA via OIDC/SAML; HMAC-signed API keys |
| **A.8.7** | Protection against malware | Container scanning (Trivy); Semgrep in CI |
| **A.8.8** | Management of technical vulnerabilities | OSV CVE scanning; CVSS v4.0 prioritisation |
| **A.8.9** | Configuration management *(new in 2022)* | Helm charts; IaC; immutable infrastructure |
| **A.8.11** | Data masking *(new in 2022)* | PII scrubbing before LLM agent processing |
| **A.8.12** | Data leakage prevention *(new in 2022)* | Code diffs not persisted; org isolation |
| **A.8.15** | Logging | Structured JSON logs; audit log; Prometheus |
| **A.8.16** | Monitoring activities *(new in 2022)* | Prometheus alerts; Grafana dashboards; Falco |
| **A.8.20** | Network security | TLS 1.3; network policies; private subnets |
| **A.8.21** | Security of network services | HMAC auth; rate limiting; WAF option |
| **A.8.24** | Use of cryptography | AES-256-GCM; TLS 1.3; HMAC-SHA256; FIPS-approved |
| **A.8.25** | Secure development life cycle | SDL policy; security gates in CI/CD |
| **A.8.26** | Application security requirements | OWASP ASVS alignment; threat modelling |
| **A.8.28** | Secure coding *(new in 2022)* | SENTINEL self-scans its own code; Semgrep rules |
| **A.8.29** | Security testing in DevOps | SENTINEL scanning in CI/CD; DAST on staging |
| **A.8.33** | Test information | Production data not used in test environments |
| **A.8.34** | Protection of information systems during audit | Read-only audit access; isolated audit environment |

---

### 14.3 EU AI Act (Regulation (EU) 2024/1689)

The [EU AI Act](https://artificialintelligenceact.eu/) entered into force on **1 August 2024** and is being applied in phases. The key milestones:

| Date | Milestone |
|------|-----------|
| 2 February 2025 | Prohibited AI practices banned; AI literacy obligations apply |
| 2 August 2025 | General-Purpose AI (GPAI) model obligations apply; EU AI Office operational |
| 2 August 2026 | Full enforcement begins; most high-risk AI system obligations apply |
| 2 August 2027 | Extended transition for embedded high-risk AI in regulated products |

**How SENTINEL supports customer EU AI Act compliance:**

| EU AI Act Requirement | SENTINEL Capability |
|----------------------|---------------------|
| **Transparency (Art. 13)** | AI detection agent records AI generation probability and tool attribution for every scan |
| **Human oversight (Art. 14)** | Certificate includes human oversight verification fields; findings require human acknowledgement |
| **Technical documentation (Art. 11)** | Compliance certificates provide evidence documentation of AI system testing and oversight |
| **Risk categorisation** | SENTINEL's risk score maps to EU AI Act risk levels (minimal → limited → high → unacceptable) |
| **Logging and monitoring (Art. 12)** | Hash-chained audit log provides the required records of AI system operations |
| **GPAI transparency (Art. 53)** | AI detection records which AI models contributed to the scanned code |
| **Training data documentation** | Dependency agent detects AI-generated content patterns; attributions captured in findings |

**Penalties under the EU AI Act** (effective 2 August 2026):
- Prohibited AI practices: up to **€35 million or 7% of global annual turnover**
- GPAI model obligations: up to **€15 million or 3% of global annual turnover**

By providing machine-readable evidence of AI code governance, SENTINEL supports the documentation and oversight obligations that reduce exposure to these penalties.

---

### 14.4 GDPR (Regulation (EU) 2016/679)

| GDPR Article | Requirement | SENTINEL Implementation |
|-------------|-------------|------------------------|
| **Art. 5(1)(b)** | Purpose limitation | Code diffs not persisted; findings stored for declared compliance purpose only |
| **Art. 5(1)(c)** | Data minimisation | File paths and line numbers stored; source code not stored |
| **Art. 5(1)(e)** | Storage limitation | Configurable retention policies with automated deletion |
| **Art. 17** | Right to erasure | Crypto-shredding via CMK destruction (see §6.2) |
| **Art. 25** | Data protection by design | Org-scoped queries; no cross-tenant data leakage by design |
| **Art. 28** | Processor obligations | DPA template available; sub-processor list maintained |
| **Art. 32** | Security of processing | AES-256-GCM; TLS 1.3; HMAC; access controls |
| **Art. 33** | Breach notification to authority | 72-hour notification SLA (see §13.4) |
| **Art. 34** | Communication to data subjects | Customer notification workflow documented |

**Data Processing Agreement (DPA):** SENTINEL operates as a data processor when scanning customer code. A DPA template is available for enterprise customers.

---

### 14.5 NIST SP 800-53 Rev. 5

SENTINEL implements controls from [NIST SP 800-53 Rev. 5.2.0](https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final) relevant to its risk profile. Key control families:

| Control Family | Controls | SENTINEL Implementation |
|----------------|---------|------------------------|
| **AC** — Access Control | AC-1 through AC-25 | RBAC; least privilege; session management |
| **AU** — Audit and Accountability | AU-1 through AU-12 | Hash-chained audit log; SIEM export |
| **CA** — Assessment and Authorisation | CA-7 | Continuous monitoring via Prometheus |
| **CM** — Configuration Management | CM-7 | Container immutability; Helm-managed config |
| **IA** — Identification and Authentication | IA-2, IA-5 | OIDC/SAML SSO; HMAC-signed API keys |
| **IR** — Incident Response | IR-1 through IR-8 | Documented response procedures (§13) |
| **SC** — System and Communications Protection | SC-8, SC-12, SC-13, SC-28 | TLS 1.3; AES-256-GCM; HMAC-SHA256; FIPS 197 |
| **SI** — System and Information Integrity | SI-2, SI-3 | Dependency CVE scanning; container scanning |
| **SR** — Supply Chain Risk Management | SR-3, SR-4 | SLSA provenance; SBOM; signed releases |

NIST is actively developing AI-specific control overlays for SP 800-53 to address model integrity, data provenance, and adversarial robustness — SENTINEL's AI detection capabilities and audit log are designed to support these emerging requirements.

---

## 15. Penetration Testing and Security Assessments

SENTINEL recommends the following assessment programme:

| Assessment Type | Frequency | Scope |
|----------------|-----------|-------|
| Automated DAST | Every CI release | OWASP ZAP against staging API |
| Dependency audit | Every build | OSV Scanner; npm audit |
| Internal penetration test | Annually | Full application + infrastructure |
| External penetration test | Annually | Black-box API and dashboard |
| Cloud configuration review | Bi-annually | AWS/GCP/Azure security baseline |
| Red team exercise | Every 2 years | Advanced persistent threat simulation |

Penetration test reports and remediation evidence are available to enterprise customers under NDA as part of the procurement security review process.

---

## 16. Cryptographic Standards Reference

All cryptographic choices are made with reference to current NIST and IETF recommendations:

| Algorithm / Protocol | Standard | Current Status | Use in SENTINEL |
|---------------------|----------|---------------|-----------------|
| **TLS 1.3** | RFC 8446 | Required (NIST SP 800-52 Rev. 2 — federal mandate Jan 2024) | All external connections |
| **TLS 1.2** | RFC 5246 | Minimum baseline (FIPS cipher suites only) | Legacy client fallback |
| **AES-256-GCM** | FIPS 197; NIST SP 800-38D | Current and approved | All symmetric encryption |
| **HMAC-SHA256** | FIPS 198-1; NIST SP 800-107 Rev. 1; RFC 2104 | Current and approved | API signing; certificate integrity |
| **SHA-256** | FIPS 180-4 | Current and approved | Audit log hash chaining; certificate hashes |
| **HKDF (HMAC-SHA256)** | RFC 5869 | Core to TLS 1.3 | Key derivation (via TLS library) |
| **RSA-2048** | NIST SP 800-56B | Acceptable until 2030 | TLS certificate asymmetric ops |
| **EC P-256** | NIST SP 800-56A; FIPS 186-5 | Current and recommended | TLS certificate asymmetric ops (preferred) |
| **CVSS v4.0** | FIRST (November 2023) | Current | Vulnerability severity scoring |

**Post-quantum readiness:** NIST finalised the first post-quantum cryptography (PQC) standards in August 2024 (FIPS 203 ML-KEM, FIPS 204 ML-DSA, FIPS 205 SLH-DSA). SENTINEL's pluggable `KmsProvider` and `ArchivePort` interfaces are designed to support algorithm migration. PQC migration will be prioritised as cloud KMS providers expose PQC key types (expected 2026–2028).

---

## 17. Security Contacts and Disclosure Policy

### Responsible Disclosure

SENTINEL follows a coordinated vulnerability disclosure policy consistent with ISO/IEC 29147:2018 and CISA's coordinated vulnerability disclosure guidelines.

**To report a security vulnerability:**

- **Email:** security@sentinel.example.com
- **PGP key:** Available at `https://sentinel.example.com/.well-known/security.txt`
- **Response SLA:**
  - Acknowledgement: 24 hours
  - Initial assessment: 72 hours
  - Coordinated disclosure: 90 days from report (extendable by mutual agreement)

### Security Bulletin Subscription

Security bulletins are published at `https://sentinel.example.com/security` and distributed via:
- GitHub Security Advisories (public CVEs in SENTINEL dependencies)
- Customer notification via the dashboard notification system
- Email list for subscribed enterprise customers

### Bug Bounty

SENTINEL operates a private bug bounty programme for enterprise customers. Contact your account manager or security@sentinel.example.com for programme details and scope.

---

## References

The following authoritative sources were consulted in the preparation of this whitepaper:

- [EU AI Act (Regulation (EU) 2024/1689)](https://artificialintelligenceact.eu/) — entered into force 1 August 2024
- [EU AI Act Implementation Timeline](https://artificialintelligenceact.eu/implementation-timeline/)
- [GPAI Code of Practice (European Commission, July 2025)](https://digital-strategy.ec.europa.eu/en/policies/guidelines-gpai-providers)
- [AICPA 2017 Trust Services Criteria (Revised 2022)](https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022)
- [ISO/IEC 27001:2022](https://www.iso.org/standard/82875.html) — 93 controls in 4 themes; transition deadline October 2025
- [ISO/IEC 27002:2022](https://www.iso.org/standard/75652.html)
- [NIST SP 800-53 Rev. 5.2.0](https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final) — Security and Privacy Controls
- [NIST SP 800-52 Rev. 2](https://csrc.nist.gov/pubs/sp/800/52/r2/final) — TLS Guidelines (TLS 1.3 required for federal systems from 1 January 2024)
- [NIST SP 800-57 Rev. 5](https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final) — Key Management Recommendations
- [NIST SP 800-107 Rev. 1](https://csrc.nist.gov/pubs/sp/800/107/r1/final) — HMAC Recommendations
- [NIST SP 800-207](https://csrc.nist.gov/pubs/sp/800/207/final) — Zero Trust Architecture
- [NIST FIPS 197](https://csrc.nist.gov/pubs/fips/197/final) — AES (Advanced Encryption Standard)
- [NIST FIPS 198-1](https://csrc.nist.gov/pubs/fips/198/1/final) — HMAC
- [NIST FIPS 180-4](https://csrc.nist.gov/pubs/fips/180/4/final) — SHA (Secure Hash Standard)
- [NIST Post-Quantum Cryptography Standards (FIPS 203/204/205, August 2024)](https://www.nist.gov/news-events/news/2024/08/nist-releases-first-3-finalized-post-quantum-cryptography-standards)
- [OWASP Top 10:2021](https://owasp.org/www-project-top-ten/)
- [OWASP Top 10 for LLM Applications 2025](https://genai.owasp.org/llm-top-10/)
- [SLSA Specification v1.0 / v1.2](https://slsa.dev/spec/v1.2/) — OpenSSF (April 2023)
- [CVSS v4.0](https://www.first.org/cvss/) — FIRST (November 2023)
- [MITRE CWE Top 25 Most Dangerous Software Weaknesses (2024)](https://cwe.mitre.org/top25/)
- [GDPR Regulation (EU) 2016/679](https://gdpr-info.eu/)
- [EDPB 2025 Coordinated Supervisory Action on Article 17 GDPR](https://cms-lawnow.com/en/ealerts/2024/12/article-17-gdpr-in-the-edpb-s-next-coordinated-action)
- [RFC 8446 — TLS 1.3](https://www.rfc-editor.org/rfc/rfc8446)
- [RFC 7519 — JWT](https://www.rfc-editor.org/rfc/rfc7519)
- [RFC 7644 — SCIM 2.0](https://www.rfc-editor.org/rfc/rfc7644)
- [Sigstore / cosign](https://www.sigstore.dev/)
- [EO 14028 — Improving the Nation's Cybersecurity (May 2021)](https://www.whitehouse.gov/briefing-room/presidential-actions/2021/05/12/executive-order-on-improving-the-nations-cybersecurity/)

---

*For questions about this whitepaper or to request a private security briefing, contact security@sentinel.example.com.*

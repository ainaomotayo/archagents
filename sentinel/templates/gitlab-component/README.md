# SENTINEL GitLab CI/CD Component

Reusable GitLab CI/CD component for running SENTINEL security scans in your pipelines.

## Quick Start

Add to your `.gitlab-ci.yml`:

```yaml
include:
  - component: gitlab.com/YOUR_ORG/sentinel-ci/sentinel-scan@1.0.0
    inputs:
      api-url: https://api.sentinel.dev
```

## Required CI/CD Variables

Set these in **Settings > CI/CD > Variables** (mark as masked):

| Variable | Description |
|----------|-------------|
| `SENTINEL_API_KEY` | Your SENTINEL API key |
| `SENTINEL_SECRET` | Your HMAC shared secret |

## Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `api-url` | string | *(required)* | SENTINEL API endpoint URL |
| `api-key` | string | `$SENTINEL_API_KEY` | API key variable reference |
| `secret` | string | `$SENTINEL_SECRET` | HMAC secret variable reference |
| `fail-on` | string | `critical,high` | Severity threshold |
| `timeout` | string | `10m` | Scan timeout |
| `cli-version` | string | `latest` | CLI version to install |
| `enable-sast-report` | boolean | `true` | Generate GitLab SAST report |
| `stage` | string | `test` | Pipeline stage |

## Security Dashboard Integration

When `enable-sast-report` is `true` (default), the component generates a `gl-sast-report.json` artifact that GitLab's Security Dashboard automatically consumes. Findings appear in:

- **Merge Request > Security widget**
- **Security & Compliance > Vulnerability Report**
- **Security Dashboard** (group/project level)

## Publishing

To publish this component to GitLab's component catalog:

1. Create a new project (e.g., `sentinel-ci`)
2. Copy `template.yml` to the project root
3. Tag a release (e.g., `1.0.0`)
4. The component is available at `gitlab.com/YOUR_ORG/sentinel-ci/sentinel-scan@1.0.0`

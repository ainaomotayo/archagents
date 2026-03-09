# SENTINEL Quick-Start Onboarding Guide

Get SENTINEL scanning your CI/CD pipeline in under 10 minutes.

## Prerequisites

- Node.js 22+
- A SENTINEL account with API credentials (API key + shared secret)
- Git repository with CI/CD pipeline (GitHub Actions or GitLab CI)

## Step 1: Install the CLI

```bash
npm install -g @sentinel/cli
```

Verify the installation:

```bash
sentinel --version
```

## Step 2: Configure Credentials

Set your API credentials as environment variables:

```bash
export SENTINEL_API_URL="https://api.sentinel.example.com"
export SENTINEL_API_KEY="your-api-key"
export SENTINEL_SECRET="your-shared-secret"
```

For CI/CD, store these as pipeline secrets (never commit them to source control).

## Step 3: Run Your First Scan

From your repository root:

```bash
sentinel ci
```

This will:

1. Detect the current git diff
2. Submit it to the SENTINEL API
3. Poll until the scan completes
4. Print the compliance assessment
5. Exit with code 0 (pass/provisional) or 1 (fail)

## Step 4: Integrate with CI/CD

### GitHub Actions

Add this to `.github/workflows/sentinel.yml`:

```yaml
name: SENTINEL Scan
on: [push, pull_request]
jobs:
  sentinel:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Install SENTINEL CLI
        run: npm install -g @sentinel/cli
      - name: Run SENTINEL Scan
        run: sentinel ci --api-url ${{ secrets.SENTINEL_API_URL }}
        env:
          SENTINEL_API_KEY: ${{ secrets.SENTINEL_API_KEY }}
          SENTINEL_SECRET: ${{ secrets.SENTINEL_SECRET }}
```

Required repository secrets:

- `SENTINEL_API_URL` -- Your SENTINEL API endpoint
- `SENTINEL_API_KEY` -- Your API key
- `SENTINEL_SECRET` -- Your HMAC shared secret

### GitLab CI

Add this to `.gitlab-ci.yml`:

```yaml
sentinel-scan:
  stage: test
  image: node:22-alpine
  script:
    - npm install -g @sentinel/cli
    - sentinel ci --api-url $SENTINEL_API_URL
  variables:
    SENTINEL_API_KEY: $SENTINEL_API_KEY
    SENTINEL_SECRET: $SENTINEL_SECRET
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
```

Required CI/CD variables:

- `SENTINEL_API_URL` -- Your SENTINEL API endpoint
- `SENTINEL_API_KEY` -- Your API key (masked)
- `SENTINEL_SECRET` -- Your HMAC shared secret (masked)

### Git Pre-Push Hook

For local scanning before push:

```bash
sentinel hook install --type pre-push
```

## Step 5: Configure Scan Policies

### Via Dashboard

1. Log in to the SENTINEL dashboard
2. Navigate to Settings > Policies
3. Create policies for your organization's requirements

### Via API

```bash
curl -X POST https://api.sentinel.example.com/v1/policies \
  -H "Content-Type: application/json" \
  -H "X-Sentinel-Signature: sha256=$(echo -n '<body>' | openssl dgst -sha256 -hmac '<secret>' | cut -d' ' -f2)" \
  -d '{
    "name": "Block Critical Vulnerabilities",
    "type": "security",
    "enabled": true,
    "rules": [
      { "field": "severity", "operator": "eq", "value": "critical" }
    ]
  }'
```

## Step 6: Review Results

### CLI Output

The CLI prints a summary after each scan:

```
SENTINEL Scan Complete
Status: provisional_pass
Risk Score: 32/100
Findings: 0 critical, 1 high, 3 medium, 5 low
Certificate: cert-abc123 (valid until 2026-04-09)
```

### Dashboard

View detailed results in the SENTINEL dashboard:

- **Overview** -- Organization-wide compliance trends
- **Projects** -- Per-project scan history
- **Findings** -- Filterable finding list with remediation guidance
- **Certificates** -- Certificate status and verification

## Scan Levels

SENTINEL supports three scan levels configured via `scanConfig.securityLevel`:

| Level      | Description                              | Use Case               |
|------------|------------------------------------------|------------------------|
| `standard` | Default scanning with all agents         | Day-to-day development |
| `strict`   | Lower thresholds, stricter enforcement   | Release branches       |
| `audit`    | Full audit trail, extended retention     | Compliance audits      |

## Troubleshooting

### "401 Unauthorized" errors

- Verify your `SENTINEL_API_KEY` and `SENTINEL_SECRET` are correct
- Check that the signature is computed over the exact request body
- Ensure your system clock is synchronized (signatures expire after 5 minutes)

### "No diff detected"

- Ensure `fetch-depth: 0` in your checkout step (GitHub Actions)
- Verify you have commits to compare against the base branch

### Scan times out

- Default poll timeout is 5 minutes
- Increase with `sentinel ci --timeout 600`
- Large diffs (>10,000 lines) may take longer

## Next Steps

- Read the [API Reference](api/openapi.yaml) for full endpoint documentation
- Review the [Security Whitepaper](security-whitepaper.md) for architecture details
- Configure organization-specific policies in the dashboard

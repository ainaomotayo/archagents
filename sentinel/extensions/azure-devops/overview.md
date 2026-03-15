# SENTINEL Security Scan for Azure Pipelines

Run AI-powered security and compliance scans on every code change directly in your Azure Pipelines.

## Features

- **Automated Security Scanning** --- Detect vulnerabilities, license issues, and policy violations
- **PR Integration** --- Get scan results as pipeline status checks on pull requests
- **Multiple Output Formats** --- Summary, JSON, or SARIF for integration with other tools
- **Configurable Policies** --- Set custom thresholds and policies for your organization

## Quick Start

Add the `SentinelScan@1` task to your pipeline:

```yaml
steps:
  - task: SentinelScan@1
    inputs:
      apiUrl: $(SENTINEL_API_URL)
      apiKey: $(SENTINEL_API_KEY)
      secret: $(SENTINEL_SECRET)
```

## Configuration

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `apiUrl` | Yes | --- | SENTINEL API endpoint URL |
| `apiKey` | Yes | --- | API key (use secret variable) |
| `secret` | Yes | --- | HMAC shared secret (use secret variable) |
| `timeout` | No | 120 | Max seconds to wait for results |
| `outputFormat` | No | summary | Output format: summary, json, sarif |
| `failOnFindings` | No | true | Fail pipeline on findings |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Scan passed --- no issues |
| 1 | Scan failed --- findings detected |
| 2 | Error --- scan could not complete |
| 3 | Provisional pass --- review recommended |

## Support

- Documentation: https://sentinel.archagents.dev/docs
- Issues: https://github.com/archagents/sentinel/issues

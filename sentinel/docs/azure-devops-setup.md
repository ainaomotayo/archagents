# Azure DevOps Setup Guide

## Prerequisites

- An Azure DevOps organization and project
- Sentinel API server running and accessible from Azure Pipelines agents
- A Sentinel API key and HMAC shared secret

## 1. Server Configuration

Enable the Azure DevOps VCS provider on your Sentinel API server:

```bash
# Environment variables for the API server
VCS_AZURE_DEVOPS_ENABLED=true
VCS_AZURE_DEVOPS_ORG_URL=https://dev.azure.com/your-org
VCS_AZURE_DEVOPS_PROJECT=your-project
VCS_AZURE_DEVOPS_PAT=your-personal-access-token
```

The PAT requires the following scopes:
- **Code (Read)** — to fetch diffs and file content
- **Code (Status)** — to post commit statuses
- **Pull Request Threads (Read & Write)** — to post PR comments

## 2. Pipeline Setup

### Option A: Copy the template

Copy `templates/azure-pipelines.yml` to your repository root:

```bash
cp templates/azure-pipelines.yml /path/to/your/repo/azure-pipelines.yml
```

### Option B: Extend from a central template

If your organization uses centralized pipeline templates:

```yaml
# azure-pipelines.yml in your repo
resources:
  repositories:
    - repository: sentinel-templates
      type: git
      name: YourProject/sentinel-templates

extends:
  template: azure-pipelines.yml@sentinel-templates
```

### Configure Pipeline Variables

In Azure DevOps, go to **Pipelines > Your Pipeline > Edit > Variables** (or use a Variable Group under **Pipelines > Library**):

| Variable | Value | Secret? |
|----------|-------|---------|
| `SENTINEL_API_URL` | `https://sentinel.example.com` | No |
| `SENTINEL_API_KEY` | Your API key | Yes |
| `SENTINEL_SECRET` | Your HMAC shared secret | Yes |

Mark `SENTINEL_API_KEY` and `SENTINEL_SECRET` as secret to prevent them from appearing in logs.

## 3. Webhook Setup

To receive push and pull request events from Azure DevOps:

1. Go to **Project Settings > Service hooks**
2. Click **Create subscription**
3. Select **Web Hooks** as the service
4. Create subscriptions for these events:
   - **Code pushed** → `https://your-sentinel-api/webhooks/azure-devops`
   - **Pull request created** → `https://your-sentinel-api/webhooks/azure-devops`
   - **Pull request updated** → `https://your-sentinel-api/webhooks/azure-devops`
5. Set the webhook secret to match your `SENTINEL_SECRET`

## 4. Verification

1. **Trigger a pipeline run:**
   Push a commit or create a pull request in your Azure DevOps repository.

2. **Check pipeline output:**
   The pipeline should show:
   - Node.js 22 setup
   - Sentinel CLI installation
   - Scan results with pass/fail status

3. **Check Sentinel dashboard:**
   Navigate to your Sentinel dashboard to see the scan results and compliance assessment.

## 5. Troubleshooting

### Pipeline fails with "command not found: sentinel"

Ensure the `npm install -g @sentinel/cli` step completed successfully. Check that Node.js 22 is available on the agent.

### Pipeline fails with "Error: API error: 401"

Verify that:
- `SENTINEL_API_KEY` is set correctly in pipeline variables
- `SENTINEL_SECRET` matches the secret configured on the Sentinel API server
- The API key has not expired

### Pipeline fails with "Error: API error: 403"

Check that the API key has permission to submit scans for the project.

### Scan times out

The default timeout is 10 minutes. If scans consistently time out:
- Check that the Sentinel API server is reachable from the Azure Pipelines agent
- Verify the API server is processing scans (check server logs)
- Consider increasing `timeoutInMinutes` in the pipeline YAML

### Webhook events not received

Verify that:
- The webhook URL is correct and publicly accessible
- The webhook secret matches `SENTINEL_SECRET`
- Service hook subscriptions are active (check **Project Settings > Service hooks**)
- Azure DevOps can reach your Sentinel API (no firewall blocking)

### Environment detection issues

The CLI auto-detects Azure Pipelines via the `TF_BUILD` environment variable. If detection fails, you can set explicit overrides:

```yaml
env:
  SENTINEL_PROVIDER: azure_devops
  SENTINEL_COMMIT: $(Build.SourceVersion)
  SENTINEL_BRANCH: $(Build.SourceBranchName)
  SENTINEL_AUTHOR: $(Build.RequestedFor)
  SENTINEL_PROJECT: $(Build.Repository.Name)
```

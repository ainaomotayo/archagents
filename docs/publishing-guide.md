# SENTINEL Publishing Guide

How to publish every distributable so real users can install and use them.
Each section starts with the **current state** of that component, then the exact steps to publish.

---

## Table of Contents

1. [npm CLI — `@sentinel/cli`](#1-npm-cli--sentinelcli)
2. [VS Code Extension](#2-vs-code-extension)
3. [JetBrains Plugin](#3-jetbrains-plugin)
4. [Azure DevOps Extension](#4-azure-devops-extension)
5. [Docker Images](#5-docker-images)
6. [Helm Chart](#6-helm-chart)
7. [Automated Publishing via GitHub Actions](#7-automated-publishing-via-github-actions)
8. [Versioning Strategy](#8-versioning-strategy)
9. [Post-Publish Verification Checklist](#9-post-publish-verification-checklist)

---

## 1. npm CLI — `@sentinel/cli`

### Current state

| Item | State |
|------|-------|
| CLI source code | **Complete** — `apps/cli/src/` with `init`, `scan`, `ci` commands |
| `bin` entry in package.json | **Present** — `"sentinel": "dist/cli.js"` |
| Build compiles correctly | **Yes** — TypeScript → `dist/cli.js` |
| `"private": true` in package.json | **BLOCKING** — this prevents `npm publish` from working |
| `publishConfig` | **Missing** — needed for scoped public package |
| Workspace dependencies | **BLOCKING** — `@sentinel/shared` and `@sentinel/auth` are `workspace:*`, which npm does not understand outside a workspace |
| GitHub Action for publishing | **Missing** |

### What blocks publishing today

The two issues to fix before you can run `npm publish`:

**Problem 1:** `"private": true` in `apps/cli/package.json` prevents publishing.

**Problem 2:** The CLI depends on `@sentinel/shared` and `@sentinel/auth` using `workspace:*` protocol. When someone installs your package from npm, those packages don't exist. You must either:
- **Option A (Recommended):** Bundle all code into a single `dist/cli.js` using esbuild — no external dependencies at runtime.
- **Option B:** Publish `@sentinel/shared` and `@sentinel/auth` to npm as separate packages, then reference them with real version numbers.

Option A is better for a CLI tool because it ships as a single self-contained file.

### Step 1 — Fix the package.json

Edit `apps/cli/package.json`. Change it to:

```json
{
  "name": "@sentinel/cli",
  "version": "1.0.0",
  "description": "AI-generated code governance and compliance CLI",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/archagents/sentinel"
  },
  "homepage": "https://sentinel.dev",
  "bugs": { "url": "https://github.com/archagents/sentinel/issues" },
  "publishConfig": {
    "access": "public"
  },
  "type": "module",
  "bin": {
    "sentinel": "dist/cli.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "node esbuild.config.mjs",
    "dev": "tsx src/cli.ts",
    "test": "vitest run"
  },
  "engines": { "node": ">=18" },
  "dependencies": {},
  "devDependencies": {
    "@types/node": "^22.0",
    "esbuild": "^0.20",
    "tsx": "^4.19",
    "typescript": "^5.7",
    "vitest": "^3.0"
  }
}
```

Key changes:
- Removed `"private": true`
- Added `publishConfig.access: "public"` (required for scoped `@sentinel/` packages)
- Emptied `dependencies` (all code will be bundled in)
- Added `"files": ["dist"]` so only the built output is shipped, not source
- Replaced `tsc` build with esbuild (bundles everything)

### Step 2 — Add esbuild bundler

Create `apps/cli/esbuild.config.mjs`:

```js
import { build } from "esbuild";

await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  outfile: "dist/cli.js",
  // Mark only truly external deps (none needed for a bundled CLI)
  external: [],
  // Add the shebang so the file is executable
  banner: { js: "#!/usr/bin/env node" },
  // Minify for smaller package
  minify: false,   // set true for production release
  sourcemap: false,
  format: "esm",
});

// Make dist/cli.js executable
import { chmodSync } from "fs";
chmodSync("dist/cli.js", 0o755);
```

Install esbuild in the CLI package:

```bash
cd apps/cli
pnpm add -D esbuild
```

### Step 3 — Build and verify

```bash
cd apps/cli
pnpm build

# Test the built binary locally
node dist/cli.js --version
# Should output: 0.1.0

node dist/cli.js --help
# Should show: sentinel init / scan / ci commands
```

### Step 4 — Create an npm account (if you don't have one)

Go to https://www.npmjs.com/signup and create an account.

If you want to use the `@sentinel` scope, you need to either:
- Use your personal account (`@yourname/cli`) — free
- Create an npm organization (`@sentinel`) — free for public packages

```bash
# Create the @sentinel org on npm (one time):
# Go to https://www.npmjs.com/org/create
# Organization name: sentinel

# Login from terminal
npm login
# Enter your npm username, password, and 2FA code
```

### Step 5 — Publish

```bash
cd apps/cli

# Dry run first — shows exactly what will be uploaded
npm publish --dry-run

# If it looks right, publish for real
npm publish --access public
```

Successful output looks like:
```
npm notice Publishing to https://registry.npmjs.org/ with tag latest and public access
+ @sentinel/cli@1.0.0
```

### Step 6 — Verify installation

From any machine (or in a separate terminal):

```bash
npm install -g @sentinel/cli
sentinel --version
# 1.0.0

sentinel --help
# shows: init, scan, ci commands
```

### How users will install it after publishing

```bash
# Global install
npm install -g @sentinel/cli

# Or with pnpm
pnpm add -g @sentinel/cli

# Or one-off without installing
npx @sentinel/cli init
```

---

## 2. VS Code Extension

### Current state

| Item | State |
|------|-------|
| Extension source code | **Complete** — `packages/sentinel-vscode/src/` with LSP client, gutter icons, tree view, commands, status bar |
| LSP server | **Complete** — `packages/sentinel-lsp/` (TypeScript Language Server Protocol server) |
| `package.json` `contributes` section | **Complete** — commands, views, config, keybindings all defined |
| Publisher field | `"publisher": "sentinel"` — **needs a registered publisher account** |
| Build pipeline | Uses `esbuild.config.mjs` — **needs to bundle LSP binary into extension** |
| Icon assets | `media/sentinel-logo.png` and `media/sentinel-activitybar.svg` — **must exist and be correct size** |
| `vsce` packaging | **Not set up** |
| GitHub Action to publish | **Missing** |
| `engines.vscode` | `"^1.85.0"` — **correct** |

### Architecture note

This extension uses the Language Server Protocol (LSP). The extension (`sentinel-vscode`) is the **LSP client** (runs in VS Code). The LSP server (`sentinel-lsp`) runs as a separate process and communicates with the extension over IPC.

For distribution, the LSP server binary must be bundled inside the extension's `.vsix` file. The Bun compile step in the CI workflow (`bun build --compile`) creates standalone binaries for Linux/macOS/Windows — these go in `packages/sentinel-vscode/bin/`.

### Step 1 — Register a VS Code Marketplace publisher

1. Go to https://marketplace.visualstudio.com/manage
2. Sign in with a Microsoft account (create one if needed — free)
3. Click "Create publisher"
4. Publisher ID: `sentinel-dev` (or your chosen name — must be unique globally)
5. Display Name: `SENTINEL`
6. Click Save

**Update `packages/sentinel-vscode/package.json`:**
```json
{
  "publisher": "sentinel-dev"
}
```

### Step 2 — Create a Personal Access Token (PAT) for publishing

1. Go to https://dev.azure.com (same Microsoft account)
2. Click your profile avatar (top right) → Personal Access Tokens
3. Click New Token:
   - Name: `vsce-publish`
   - Organization: All accessible organizations
   - Expiry: 1 year
   - Scopes: Custom → Marketplace → **Manage**
4. Copy the token — you will not see it again

### Step 3 — Install vsce and build LSP binaries

```bash
# Install vsce globally
npm install -g @vscode/vsce

# Build the LSP server for all platforms
# From the monorepo root:
cd packages/sentinel-lsp

# Install bun if needed: curl -fsSL https://bun.sh/install | bash

# Compile for each platform
bun build src/index.ts --compile --target=bun-linux-x64   --outfile ../sentinel-vscode/bin/sentinel-lsp-linux-x64
bun build src/index.ts --compile --target=bun-darwin-arm64 --outfile ../sentinel-vscode/bin/sentinel-lsp-darwin-arm64
bun build src/index.ts --compile --target=bun-darwin-x64   --outfile ../sentinel-vscode/bin/sentinel-lsp-darwin-x64
bun build src/index.ts --compile --target=bun-windows-x64  --outfile ../sentinel-vscode/bin/sentinel-lsp-win-x64.exe
```

### Step 4 — Update `.vscodeignore`

Create `packages/sentinel-vscode/.vscodeignore` to exclude dev files from the package:

```
.vscode/**
src/**
test/**
tsconfig.json
esbuild.config.mjs
vitest.config.ts
*.map
node_modules/**
!node_modules/vscode-languageclient/**
```

The `bin/` directory with LSP binaries must NOT be in `.vscodeignore` — they are required.

### Step 5 — Build the extension

```bash
cd packages/sentinel-vscode
pnpm build   # runs esbuild → dist/extension.js
```

### Step 6 — Package and verify locally

```bash
cd packages/sentinel-vscode

# Package into .vsix (does not publish)
vsce package

# Output: sentinel-security-1.0.0.vsix

# Install locally in VS Code to test
code --install-extension sentinel-security-1.0.0.vsix

# Verify:
# 1. Shield icon appears in activity bar
# 2. Sentinel: Configure API Token command is available (Ctrl+Shift+P)
# 3. Sentinel: Trigger Scan works
```

### Step 7 — Publish to the marketplace

```bash
cd packages/sentinel-vscode

# Login with your PAT
vsce login sentinel-dev
# Enter PAT when prompted

# Publish
vsce publish
```

Successful output:
```
Publishing sentinel-dev.sentinel-security@1.0.0...
Successfully published sentinel-dev.sentinel-security@1.0.0!
```

The extension will be live at:
`https://marketplace.visualstudio.com/items?itemName=sentinel-dev.sentinel-security`

It may take 5–10 minutes to appear in search results.

### How users install it after publishing

**Method 1 — Marketplace UI:**
1. Open VS Code
2. Press `Ctrl+Shift+X`
3. Search "SENTINEL Security"
4. Click Install

**Method 2 — Terminal:**
```bash
code --install-extension sentinel-dev.sentinel-security
```

**Method 3 — Marketplace URL:**
Open `https://marketplace.visualstudio.com/items?itemName=sentinel-dev.sentinel-security` and click Install.

---

## 3. JetBrains Plugin

### Current state

| Item | State |
|------|-------|
| Plugin source code | **Complete** — `packages/sentinel-jetbrains/src/` Kotlin implementation with settings UI, gutter icons, findings panel, status bar |
| `build.gradle.kts` | **Complete** — Kotlin JVM, IntelliJ Platform Plugin, correct `sinceBuild`/`untilBuild` |
| CI workflow builds the plugin | **Yes** — `.github/workflows/jetbrains-plugin.yml` builds and uploads artifact |
| Publish step in CI workflow | **Missing** — the workflow builds but does NOT publish |
| JetBrains Marketplace account | **Not set up** |
| `plugin.xml` | **Must be checked** — needs correct `<id>` and `<vendor>` |

### Step 1 — Check and update plugin.xml

Find `plugin.xml` in the JetBrains plugin:

```bash
find packages/sentinel-jetbrains/src -name "plugin.xml"
# Expected: packages/sentinel-jetbrains/src/main/resources/META-INF/plugin.xml
```

It must contain:

```xml
<idea-plugin>
  <!-- Unique ID — never change after first publish -->
  <id>dev.sentinel.security</id>
  <name>SENTINEL Security</name>
  <version>0.1.0</version>
  <vendor url="https://sentinel.dev" email="support@sentinel.dev">Archagents</vendor>

  <description><![CDATA[
    AI-generated code governance for JetBrains IDEs.
    Scans every commit through SENTINEL's security, dependency,
    license, quality, and policy agents — inline in your IDE.
  ]]></description>

  <change-notes><![CDATA[
    Initial release.
  ]]></change-notes>

  <idea-version since-build="241" until-build="251.*"/>

  <depends>com.intellij.modules.platform</depends>
  <depends config-file="com.redhat.devtools.lsp4ij.xml">com.redhat.devtools.lsp4ij</depends>
</idea-plugin>
```

### Step 2 — Create JetBrains Marketplace account

1. Go to https://plugins.jetbrains.com/
2. Click "Sign In" → use JetBrains account (or create one — free)
3. Click your profile → "Upload plugin" (first upload is always manual)

### Step 3 — Build the plugin

```bash
cd packages/sentinel-jetbrains

# Requires Java 17+
# Check: java -version

# Build the .zip plugin artifact
./gradlew buildPlugin

# Output:
# build/distributions/sentinel-jetbrains-0.1.0.zip
```

### Step 4 — First upload (manual)

The first publish must be done manually through the web UI:
1. Go to https://plugins.jetbrains.com/plugin/add
2. Upload the `.zip` file from `build/distributions/`
3. Fill in:
   - Category: Editor (Tools → Developer Tools → Security)
   - Compatible IDEs: IntelliJ IDEA, PyCharm, WebStorm, GoLand, Rider, DataGrip, CLion
   - License: MIT
4. Submit for review

JetBrains reviews new plugins within 1–3 business days.

### Step 5 — Generate a publish token for automation

After the first manual approval:
1. Go to https://plugins.jetbrains.com/author/me/tokens
2. Create a new token: `sentinel-publish`
3. Copy the token

Add to GitHub Secrets: `JETBRAINS_PUBLISH_TOKEN`

### Step 6 — Add publish step to the CI workflow

The existing `.github/workflows/jetbrains-plugin.yml` builds but does not publish. Add a publish job:

```yaml
  publish-jetbrains:
    name: Publish JetBrains Plugin
    needs: [build-jetbrains, build-lsp-binaries]
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/jetbrains/v')
    defaults:
      run:
        working-directory: packages/sentinel-jetbrains
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17
      - name: Download LSP binaries
        uses: actions/download-artifact@v4
        with:
          pattern: sentinel-lsp-*
          path: src/main/resources/bin/
          merge-multiple: true
      - name: Build plugin
        run: ./gradlew buildPlugin
      - name: Publish to JetBrains Marketplace
        run: ./gradlew publishPlugin
        env:
          PUBLISH_TOKEN: ${{ secrets.JETBRAINS_PUBLISH_TOKEN }}
```

Add the publish token to `build.gradle.kts`:

```kotlin
publishPlugin {
    token.set(System.getenv("PUBLISH_TOKEN"))
}
```

### How users install it after publishing

**Method 1 — IDE Plugin Browser:**
1. Open IntelliJ IDEA / PyCharm / WebStorm
2. `File > Settings > Plugins > Marketplace`
3. Search "SENTINEL Security"
4. Click Install, restart IDE

**Method 2 — Direct URL:**
`https://plugins.jetbrains.com/plugin/dev.sentinel.security`

**Method 3 — Drag and drop `.zip`:**
`Settings > Plugins > ⚙ gear icon > Install Plugin from Disk`

---

## 4. Azure DevOps Extension

### Current state

| Item | State |
|------|-------|
| Task implementation | **Complete** — `extensions/azure-devops/sentinel-scan/index.ts` |
| `task.json` | **Complete** — all inputs defined, execution target `Node16` |
| `vss-extension.json` | **Complete** — manifest with contributions |
| `overview.md` | **Complete** — marketplace listing content |
| Publisher field | `"publisher": "sentinel-security"` — **needs a registered publisher** |
| `dist/index.js` (compiled output) | **Missing** — `index.ts` is not compiled, `task.json` points to `dist/index.js` |
| Build script | **Missing** — no `npm run build` in `sentinel-scan/package.json` |
| Icon image | `images/icon.png` — **must exist** (128×128 PNG) |
| GitHub Action to build + publish | **Missing** |
| `tfx-cli` setup | **Not done** |

### Step 1 — Add build script to task package.json

Edit `extensions/azure-devops/sentinel-scan/package.json`:

```json
{
  "name": "sentinel-scan-task",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc && node -e \"require('fs').chmodSync('dist/index.js', '755')\""
  },
  "dependencies": {
    "azure-pipelines-task-lib": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0",
    "typescript": "^5.7"
  }
}
```

Add `extensions/azure-devops/sentinel-scan/tsconfig.json` if not present:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["index.ts"]
}
```

### Step 2 — Add icon

Create or place a 128×128 PNG icon at:
`extensions/azure-devops/images/icon.png`

The icon must be square. Use the SENTINEL shield logo. If you do not have one yet, create a simple placeholder using any image editor or online tool.

### Step 3 — Register Azure DevOps publisher

1. Go to https://marketplace.visualstudio.com/manage
2. Sign in with a Microsoft account
3. Click "Create publisher"
4. Publisher ID: `sentinel-security` (must match the `publisher` field in `vss-extension.json`)
5. Display Name: `SENTINEL Security`

### Step 4 — Create a PAT for Azure DevOps Marketplace publishing

Same process as VS Code PAT (they share the same Microsoft account):
1. Go to https://dev.azure.com
2. Profile → Personal Access Tokens → New Token
3. Scopes: Marketplace → **Manage**
4. Copy the token

### Step 5 — Install tfx-cli

```bash
npm install -g tfx-cli
```

### Step 6 — Build and package

```bash
cd extensions/azure-devops

# Install task dependencies
cd sentinel-scan
npm install
npm run build
cd ..

# Package the extension
tfx extension create --manifest-globs vss-extension.json

# Output: sentinel-security.sentinel-security-scan-0.1.0.vsix
```

### Step 7 — Publish to marketplace

```bash
# Login
tfx extension publish \
  --manifest-globs vss-extension.json \
  --token YOUR_PAT_HERE

# This publishes as PRIVATE by default
# To make it public immediately:
tfx extension publish \
  --manifest-globs vss-extension.json \
  --token YOUR_PAT_HERE \
  --share-with publicmarket
```

Or publish privately first and share with specific organizations during beta:

```bash
# Share with a specific Azure DevOps org while in private preview
tfx extension share \
  --publisher sentinel-security \
  --extension-id sentinel-security-scan \
  --share-with your-azdo-organization \
  --token YOUR_PAT_HERE
```

### Step 8 — Make public (when ready)

```bash
tfx extension publish \
  --manifest-globs vss-extension.json \
  --token YOUR_PAT_HERE
# Then in the marketplace UI: toggle from Private → Public
```

### How users install it after publishing

**Method 1 — Azure DevOps UI:**
1. Go to your Azure DevOps organization
2. `Organization Settings > Extensions > Browse Marketplace`
3. Search "SENTINEL Security Scan"
4. Click Get it free

**Method 2 — Direct URL:**
`https://marketplace.visualstudio.com/items?itemName=sentinel-security.sentinel-security-scan`

**In pipelines, after install:**
```yaml
- task: SentinelScan@1
  inputs:
    apiUrl: $(SENTINEL_API_URL)
    apiKey: $(SENTINEL_API_KEY)
    secret: $(SENTINEL_SECRET)
```

---

## 5. Docker Images

### Current state

| Item | State |
|------|-------|
| API Dockerfile | **Complete** — `apps/api/Dockerfile` |
| Agent Dockerfiles | **Complete** — `agents/*/Dockerfile` |
| GitHub Action to build + push | **Exists** — `.github/workflows/docker-build.yml` |
| Images pushed to GHCR | **Yes** — pushes to `ghcr.io/${{ github.repository_owner }}/sentinel` on merge to main |
| Dockerfile paths in workflow | **MISMATCH** — workflow references `docker/api.Dockerfile` but files are at `apps/api/Dockerfile` |
| Semver tagging | **Missing** — only pushes `sha` and `latest` tags, no `v1.0.0` tags |
| Dashboard Dockerfile | **Missing** — workflow references `docker/dashboard.Dockerfile` but no file found |
| Docker Hub mirror | **Not set up** — images only on GHCR, not on public Docker Hub |
| Package visibility on GHCR | **Defaults to private** — must be set to public manually |

### Step 1 — Create a missing Dashboard Dockerfile

Create `apps/dashboard/Dockerfile`:

```dockerfile
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
WORKDIR /app

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY tsconfig.base.json ./

# Copy package manifests
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/dashboard/tsconfig.json apps/dashboard/
COPY apps/dashboard/next.config.* apps/dashboard/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared/ packages/shared/
COPY apps/dashboard/ apps/dashboard/

# Build
RUN pnpm --filter @sentinel/dashboard build

WORKDIR /app/apps/dashboard
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "server.js"]
```

### Step 2 — Fix Dockerfile paths in the GitHub Actions workflow

Edit `.github/workflows/docker-build.yml`. Change the `file:` references from `docker/api.Dockerfile` to the correct paths:

```yaml
# build-api job:
file: apps/api/Dockerfile

# build-dashboard job:
file: apps/dashboard/Dockerfile

# build-agents job (already correct pattern):
file: agents/${{ matrix.agent }}/Dockerfile
```

### Step 3 — Add semver tagging to the workflow

The current workflow only tags images with the commit SHA and `latest`. Add proper version tags triggered by git tags.

Add to `.github/workflows/docker-build.yml` in each image build step:

```yaml
      - name: Docker meta
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.IMAGE_PREFIX }}-api
          tags: |
            type=sha,prefix=sha-
            type=ref,event=tag
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}

      - uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/api/Dockerfile
          push: ${{ github.event_name == 'push' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### Step 4 — Make GHCR packages public

By default, packages on GitHub Container Registry are private. After the first push:

1. Go to `https://github.com/archagents?tab=packages`
2. Click on `sentinel-api`
3. Package Settings → Change visibility → **Public**
4. Repeat for `sentinel-dashboard`, `sentinel-agent-security`, `sentinel-agent-dependency`

Or set packages to public by default at the organization level:
`Organization Settings > Packages > Package creation > Public`

### Step 5 — Set up Docker Hub mirror (for discoverability)

Docker Hub is where developers expect to find `docker pull archagents/sentinel-api`.

1. Create account at https://hub.docker.com/
2. Create organization: `archagents`
3. Create repositories: `sentinel-api`, `sentinel-dashboard`, `sentinel-agent-security`, `sentinel-agent-dependency`
4. Add to GitHub Secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`

Add a Docker Hub push step to the workflow:

```yaml
      - uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/api/Dockerfile
          push: ${{ github.event_name == 'push' }}
          tags: |
            ghcr.io/${{ github.repository_owner }}/sentinel-api:latest
            archagents/sentinel-api:latest
            archagents/sentinel-api:${{ github.sha }}
```

### How users pull images after publishing

```bash
# From GitHub Container Registry (full URL)
docker pull ghcr.io/archagents/sentinel-api:latest

# From Docker Hub (short name, more familiar)
docker pull archagents/sentinel-api:latest

# Specific version
docker pull archagents/sentinel-api:1.0.0

# Run the full stack via Docker Compose
curl -O https://raw.githubusercontent.com/archagents/sentinel/main/docker-compose.yml
docker compose up -d
```

---

## 6. Helm Chart

### Current state

| Item | State |
|------|-------|
| Helm chart source | **Complete** — `deploy/helm/` with Chart.yaml, all templates, production values |
| Chart.yaml | **Complete** — correct name, version, dependencies |
| Helm templates | **Complete** — API, dashboard, workers, ingress, HPA, PDB, NetworkPolicy, ServiceMonitor |
| Values files | **Complete** — `values.yaml`, `values-staging.yaml`, `values-production.yaml` |
| Bitnami dependencies declared | **Complete** — PostgreSQL, Redis, Prometheus stack |
| GitHub Action to deploy TO cluster | **Exists** — `helm-deploy.yml` |
| GitHub Action to PUBLISH chart to registry | **Missing** |
| Chart repository (GitHub Pages or OCI) | **Not set up** |

The difference between the existing workflow and what is needed:
- **Existing** `helm-deploy.yml`: deploys the chart to YOUR cluster (for running your SaaS)
- **Needed**: publishes the chart to a public URL so your CUSTOMERS can install it on their own clusters

### Step 1 — Choose a chart repository method

**Recommended: OCI registry via GHCR** (simplest, no extra setup needed):

```bash
# Users install with:
helm install sentinel oci://ghcr.io/archagents/charts/sentinel --version 1.0.0
```

**Alternative: GitHub Pages** (traditional, requires gh-pages branch):

```bash
# Users install with:
helm repo add sentinel https://charts.sentinel.dev
helm install sentinel sentinel/sentinel
```

The guide below covers both.

### Step 2 — Build chart dependencies

Before packaging, fetch the Bitnami dependencies:

```bash
cd deploy/helm
helm dependency update
# Downloads postgresql, redis, prometheus-stack to charts/
```

### Step 3 — Package the chart

```bash
cd deploy/helm
helm package . --destination /tmp/charts

# Output: /tmp/charts/sentinel-0.2.0.tgz
```

### Step 4 — Publish via OCI to GHCR (Recommended)

```bash
# Login to GHCR (use a GitHub PAT with packages:write permission)
echo $GITHUB_TOKEN | helm registry login ghcr.io --username YOUR_GITHUB_USERNAME --password-stdin

# Push the chart
helm push /tmp/charts/sentinel-0.2.0.tgz oci://ghcr.io/archagents/charts

# Verify
helm show chart oci://ghcr.io/archagents/charts/sentinel --version 0.2.0
```

### Step 5 — Publish via GitHub Pages (Alternative)

```bash
# One-time setup: create gh-pages branch
git checkout --orphan gh-pages
git rm -rf .
mkdir charts
touch .nojekyll
git add .nojekyll
git commit -m "Initialize GitHub Pages for Helm charts"
git push origin gh-pages
git checkout main
```

```bash
# Package and index
helm package deploy/helm -d /tmp/charts
helm repo index /tmp/charts --url https://charts.sentinel.dev

# Copy to gh-pages branch and push
git checkout gh-pages
cp /tmp/charts/*.tgz charts/
cp /tmp/charts/index.yaml charts/
git add charts/
git commit -m "Release sentinel chart 0.2.0"
git push origin gh-pages
git checkout main
```

Set up custom domain:
- Add `charts.sentinel.dev` CNAME record pointing to `archagents.github.io`
- In GitHub repo Settings → Pages → Custom domain: `charts.sentinel.dev`

### Step 6 — Add GitHub Action for automated chart publishing

Create `.github/workflows/publish-helm.yml`:

```yaml
name: Publish Helm Chart

on:
  push:
    tags:
      - 'helm/v*'   # e.g., git tag helm/v1.0.0

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - uses: azure/setup-helm@v3
        with:
          version: v3.14.0

      - name: Update chart dependencies
        run: helm dependency update deploy/helm/

      - name: Package chart
        run: helm package deploy/helm/ -d /tmp/charts

      - name: Login to GHCR
        run: echo "${{ secrets.GITHUB_TOKEN }}" | helm registry login ghcr.io --username ${{ github.actor }} --password-stdin

      - name: Push to OCI registry
        run: helm push /tmp/charts/*.tgz oci://ghcr.io/${{ github.repository_owner }}/charts

      - name: Verify
        run: helm show chart oci://ghcr.io/${{ github.repository_owner }}/charts/sentinel
```

### How users use the chart after publishing

**Via OCI (GHCR):**

```bash
# Install latest
helm install sentinel oci://ghcr.io/archagents/charts/sentinel \
  --namespace sentinel \
  --create-namespace \
  --set api.sentinelSecret=your-hmac-secret \
  --set api.databaseUrl=postgresql://...

# Install specific version
helm install sentinel oci://ghcr.io/archagents/charts/sentinel \
  --version 1.0.0 \
  --namespace sentinel

# Upgrade
helm upgrade sentinel oci://ghcr.io/archagents/charts/sentinel --version 1.1.0
```

**Via Helm repo (GitHub Pages):**

```bash
helm repo add sentinel https://charts.sentinel.dev
helm repo update
helm search repo sentinel
helm install sentinel sentinel/sentinel \
  --namespace sentinel \
  --create-namespace
```

---

## 7. Automated Publishing via GitHub Actions

### Release workflow — publishes everything on a git tag

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'   # e.g., v1.0.0, v1.1.0-beta.1

env:
  REGISTRY: ghcr.io
  IMAGE_PREFIX: ghcr.io/${{ github.repository_owner }}/sentinel

jobs:
  # 1. Publish CLI to npm
  publish-cli:
    name: Publish CLI to npm
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @sentinel/cli build
      - run: npm publish --access public
        working-directory: apps/cli
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

  # 2. Publish VS Code extension
  publish-vscode:
    name: Publish VS Code Extension
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: pnpm install --frozen-lockfile
      # Compile LSP binaries for all platforms
      - run: |
          cd packages/sentinel-lsp
          bun build src/index.ts --compile --target=bun-linux-x64   --outfile ../sentinel-vscode/bin/sentinel-lsp-linux-x64
          bun build src/index.ts --compile --target=bun-darwin-arm64 --outfile ../sentinel-vscode/bin/sentinel-lsp-darwin-arm64
          bun build src/index.ts --compile --target=bun-darwin-x64   --outfile ../sentinel-vscode/bin/sentinel-lsp-darwin-x64
          bun build src/index.ts --compile --target=bun-windows-x64  --outfile ../sentinel-vscode/bin/sentinel-lsp-win-x64.exe
      - run: pnpm --filter sentinel-vscode build
      - run: npx @vscode/vsce publish --pat ${{ secrets.VSCE_PAT }}
        working-directory: packages/sentinel-vscode

  # 3. Publish JetBrains plugin
  publish-jetbrains:
    name: Publish JetBrains Plugin
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: 17 }
      - run: ./gradlew publishPlugin
        working-directory: packages/sentinel-jetbrains
        env:
          PUBLISH_TOKEN: ${{ secrets.JETBRAINS_PUBLISH_TOKEN }}

  # 4. Publish Docker images
  publish-docker:
    name: Publish Docker Images
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    strategy:
      matrix:
        include:
          - name: api
            dockerfile: apps/api/Dockerfile
          - name: dashboard
            dockerfile: apps/dashboard/Dockerfile
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      - name: Docker meta
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: |
            ghcr.io/${{ github.repository_owner }}/sentinel-${{ matrix.name }}
            archagents/sentinel-${{ matrix.name }}
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest
      - uses: docker/build-push-action@v5
        with:
          context: .
          file: ${{ matrix.dockerfile }}
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # 5. Publish Helm chart
  publish-helm:
    name: Publish Helm Chart
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: azure/setup-helm@v3
        with: { version: v3.14.0 }
      - run: helm dependency update deploy/helm/
      - run: helm package deploy/helm/ -d /tmp/charts
      - run: echo "${{ secrets.GITHUB_TOKEN }}" | helm registry login ghcr.io --username ${{ github.actor }} --password-stdin
      - run: helm push /tmp/charts/*.tgz oci://ghcr.io/${{ github.repository_owner }}/charts

  # 6. Create GitHub Release with changelog
  github-release:
    name: GitHub Release
    runs-on: ubuntu-latest
    needs: [publish-cli, publish-vscode, publish-jetbrains, publish-docker, publish-helm]
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: softprops/action-gh-release@v1
        with:
          generate_release_notes: true
          body: |
            ## Install

            **CLI:**
            ```bash
            npm install -g @sentinel/cli@${{ github.ref_name }}
            ```

            **Docker:**
            ```bash
            docker pull archagents/sentinel-api:${{ github.ref_name }}
            ```

            **Helm:**
            ```bash
            helm install sentinel oci://ghcr.io/archagents/charts/sentinel --version ${{ github.ref_name }}
            ```
```

### GitHub Secrets required

Add these in `GitHub > Settings > Secrets and variables > Actions`:

| Secret | Where to get it |
|--------|----------------|
| `NPM_TOKEN` | npmjs.com → Profile → Access Tokens → Automation token |
| `VSCE_PAT` | dev.azure.com → Personal Access Tokens → Marketplace Manage scope |
| `JETBRAINS_PUBLISH_TOKEN` | plugins.jetbrains.com → Author → Tokens |
| `DOCKERHUB_USERNAME` | Your Docker Hub username |
| `DOCKERHUB_TOKEN` | hub.docker.com → Account Settings → Security → New Access Token |

`GITHUB_TOKEN` is provided automatically by GitHub Actions — no setup needed.

---

## 8. Versioning Strategy

All packages must use the same version number per release. Turborepo makes this straightforward.

### Version bump process

```bash
# From monorepo root, bump all package versions together:
pnpm changeset add          # describe what changed
pnpm changeset version      # bump versions in all package.json files
pnpm changeset publish      # publish to npm (runs npm publish in each package)

# Or manually:
# Edit version in: apps/cli/package.json, packages/sentinel-vscode/package.json,
# packages/sentinel-jetbrains/build.gradle.kts, extensions/azure-devops/vss-extension.json,
# deploy/helm/Chart.yaml
```

### Git tag and trigger release

```bash
# After bumping all versions and committing:
git tag v1.0.0
git push origin v1.0.0

# This triggers the release.yml workflow which publishes everything
```

### Semantic versioning

Use standard semver: `MAJOR.MINOR.PATCH`

| Change | Version bump | Example |
|--------|-------------|---------|
| Breaking API change | MAJOR | 1.0.0 → 2.0.0 |
| New feature (backward compatible) | MINOR | 1.0.0 → 1.1.0 |
| Bug fix | PATCH | 1.0.0 → 1.0.1 |
| Pre-release / beta | Pre | 1.0.0-beta.1 |

---

## 9. Post-Publish Verification Checklist

Run through this after every release:

### npm CLI

```bash
# Install fresh from npm in a clean directory
npx --yes @sentinel/cli@latest --version
# Expected: 1.0.0

npx @sentinel/cli@latest --help
# Expected: shows init, scan, ci commands

# Check npm page
open https://www.npmjs.com/package/@sentinel/cli
```

### VS Code Extension

```bash
# Install from marketplace
code --install-extension sentinel-dev.sentinel-security

# Check page
open "https://marketplace.visualstudio.com/items?itemName=sentinel-dev.sentinel-security"
```

### JetBrains Plugin

```
Go to: https://plugins.jetbrains.com/plugin/dev.sentinel.security
Verify: version number, download count, screenshots
```

### Azure DevOps Extension

```bash
# Verify via tfx
tfx extension show \
  --publisher sentinel-security \
  --extension-id sentinel-security-scan \
  --token YOUR_PAT

# Check marketplace page
open "https://marketplace.visualstudio.com/items?itemName=sentinel-security.sentinel-security-scan"
```

### Docker Images

```bash
# Pull from GHCR
docker pull ghcr.io/archagents/sentinel-api:latest
docker run --rm ghcr.io/archagents/sentinel-api:latest node -e "console.log('ok')"

# Pull from Docker Hub
docker pull archagents/sentinel-api:latest

# Check GHCR package page
open https://github.com/archagents?tab=packages
```

### Helm Chart

```bash
# Via OCI
helm show chart oci://ghcr.io/archagents/charts/sentinel
# Expected: shows Chart.yaml contents

# Template render test (no cluster needed)
helm template sentinel oci://ghcr.io/archagents/charts/sentinel \
  --set api.sentinelSecret=test \
  --set api.databaseUrl=postgresql://test > /dev/null
# Expected: no errors, valid YAML output
```

---

## Summary: What Is Done vs. What Needs Work

| Component | Code Complete | Publishing Ready | Blocking Issues |
|-----------|:---:|:---:|-----------------|
| **npm CLI** | Yes | No | Remove `"private": true`; bundle workspace deps with esbuild; publish `@sentinel/cli` org on npm |
| **VS Code Extension** | Yes | No | Register publisher account; create LSP platform binaries; set up vsce |
| **JetBrains Plugin** | Yes | No | Register JetBrains Marketplace account; add `publishPlugin` Gradle task; upload first version manually |
| **Azure DevOps Extension** | Yes | No | Add build script to compile `index.ts`; create publisher account; add icon PNG; publish with tfx-cli |
| **Docker Images** | Yes | Partial | Fix Dockerfile paths in workflow; add semver tagging; make GHCR packages public; mirror to Docker Hub |
| **Helm Chart** | Yes | No | Add publish workflow (OCI or GitHub Pages); run `helm dependency update` first |

None of these require new product code. Every item is a publishing/packaging/account setup task. With focused effort:
- Docker images: **1–2 hours** (fix the workflow, flip visibility to public)
- npm CLI: **2–4 hours** (esbuild setup, npm account, publish)
- Azure DevOps extension: **2–3 hours** (build script, publisher account, tfx)
- VS Code extension: **4–6 hours** (publisher account, LSP binary compilation, vsce)
- JetBrains plugin: **3–4 hours** (marketplace account, publish task, first manual upload + review wait)
- Helm chart: **1–2 hours** (add publish workflow, push OCI)

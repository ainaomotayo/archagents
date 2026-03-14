# Sentinel LSP Server

Shared Language Server Protocol (LSP) server that bridges IDE extensions to the Sentinel API. It is the backend brain for the [JetBrains plugin](../sentinel-jetbrains/README.md) and any future VS Code or other editor extensions.

## What It Does

- Translates Sentinel findings into **LSP diagnostics** (squiggly underlines in editors)
- Provides **code actions** for finding suppression and remediation links
- Provides **code lenses** showing finding counts per region
- Subscribes to **SSE (Server-Sent Events)** for real-time finding updates without polling
- Maintains a **local finding cache** with disk persistence for offline support
- Exposes custom LSP commands: `sentinel.suppress`, `sentinel.triggerScan`, `sentinel.showFindings`, `sentinel.openDashboard`

## Architecture

```
Editor (JetBrains / VS Code / etc.)
    |  stdio or TCP
    v
sentinel-lsp process
    |
    +-- server.ts         Core LSP handler (initialize, diagnostics, code actions, code lenses, commands)
    +-- api-client.ts     HTTP client for Sentinel API (findings, suppress, trigger scan)
    +-- sse-listener.ts   EventSource wrapper for real-time events (scan.*, finding.*)
    +-- finding-cache.ts  In-memory + disk cache for findings
    +-- diagnostic-mapper.ts  Finding -> LSP Diagnostic/CodeAction/CodeLens mapping
    +-- types.ts          Shared TypeScript interfaces
    +-- index.ts          Entry point: wires everything together, starts the LSP connection
```

## Usage

### As a standalone binary (recommended for JetBrains)

```bash
# Compile platform-specific binary using Bun
pnpm run compile:linux    # -> dist/sentinel-lsp-linux-x64
pnpm run compile:darwin   # -> dist/sentinel-lsp-darwin-arm64
pnpm run compile:win      # -> dist/sentinel-lsp-win-x64.exe

# Run
SENTINEL_API_URL=http://localhost:8080 \
SENTINEL_API_TOKEN=your-token \
SENTINEL_ORG_ID=your-org \
./dist/sentinel-lsp-linux-x64 --stdio
```

### As a Node.js process

```bash
pnpm run build
node dist/index.js --stdio
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SENTINEL_API_URL` | No | `http://localhost:8080` | Sentinel API base URL |
| `SENTINEL_API_TOKEN` | Yes | -- | Authentication bearer token |
| `SENTINEL_ORG_ID` | No | `default` | Organisation identifier |
| `SENTINEL_PROJECT_ID` | No | `default` | Project identifier |
| `SENTINEL_CACHE_DIR` | No | `~/.sentinel/cache` | Directory for persisted finding cache |

## Development

### Prerequisites

- Node.js 20+ or Bun 1.1+
- pnpm 9+

### Build

```bash
pnpm run build    # TypeScript -> dist/
```

### Test

```bash
pnpm run test     # vitest
```

Test suite covers: server logic, finding cache, SSE listener, API client, and diagnostic mapper.

### Library Usage

The package also exports its modules for programmatic use:

```typescript
import {
  createSentinelLspServer,
  SentinelApiClient,
  SseListener,
  FindingCache,
  DiagnosticMapper,
} from "@sentinel/sentinel-lsp";
```

## LSP Capabilities

| Capability | Supported |
|-----------|-----------|
| Text Document Sync | Incremental |
| Diagnostics (pull) | Yes |
| Code Actions | Yes (suppress, remediation) |
| Code Lenses | Yes (finding summaries) |
| Execute Command | Yes (4 commands) |
| Workspace Diagnostics | No |

## License

See the repository root LICENSE file for terms.

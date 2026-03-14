# Sentinel JetBrains Plugin

IntelliJ platform plugin that surfaces real-time security findings, IP attribution, and compliance checks directly inside your JetBrains IDE. The plugin uses a **Hybrid Native Shell + LSP Core** architecture: a Kotlin-based UI shell communicates with the shared `sentinel-lsp` language server over the LSP4IJ bridge, which in turn talks to the Sentinel API.

## Features

- **Tool window** with a sortable findings table (severity, file, agent, category)
- **Gutter icons** with severity-colored markers on affected lines
- **Inline annotations** with remediation advice via an external annotator
- **Status bar widget** showing live scan / connection status
- **One-click finding suppression** through code actions and the Tools menu
- **Real-time finding updates** via SSE (Server-Sent Events) streaming
- **Trigger scans from IDE** using the Tools > Sentinel > Trigger Security Scan action
- **Open dashboard** to jump from a finding to the Sentinel web UI

## Requirements

- **IntelliJ IDEA 2024.1+** (build 241) through 2025.1.x (build 251.*)
- **Java 17+**
- **LSP4IJ plugin** (com.redhat.devtools.lsp4ij >= 0.4.0) -- installed automatically as a dependency
- **Sentinel API server** running (local or remote)

### Compatible IDEs

| IDE | Minimum Version | Tested | Notes |
|-----|----------------|--------|-------|
| IntelliJ IDEA Community | 2024.1 | Yes | Primary development target |
| IntelliJ IDEA Ultimate | 2024.1 | Yes | |
| PyCharm | 2024.1 | Yes | |
| WebStorm | 2024.1 | Yes | |
| PhpStorm | 2024.1 | Partial | Requires LSP4IJ manual install |
| GoLand | 2024.1 | Partial | |
| RubyMine | 2024.1 | Partial | |
| CLion | 2024.1 | Partial | |
| Rider | 2024.1 | Partial | |
| DataGrip | 2024.1 | Partial | Limited -- no source file context |

All IDEs that support the `com.intellij.modules.platform` extension point are compatible.

## Installation

### From Marketplace (when published)

1. Open **Settings > Plugins > Marketplace**
2. Search for **Sentinel Security**
3. Click **Install** and restart the IDE

### Manual Installation

1. Download the latest `.zip` from the [Releases](https://github.com/sentinel/sentinel/releases) page
2. Open **Settings > Plugins** (Ctrl+Alt+S on Linux/Windows, Cmd+, on macOS)
3. Click the gear icon > **Install Plugin from Disk...**
4. Select the downloaded `.zip` file and restart the IDE

## Configuration

Open **Settings > Tools > Sentinel Security** to configure the plugin:

| Setting | Description | Default |
|---------|-------------|---------|
| API URL | Sentinel API server URL | `https://sentinel.example.com` |
| API Token | Authentication token (stored securely via IntelliJ PasswordSafe / system keychain) | -- |
| Project ID | Sentinel project to pull findings for | -- |
| Enable Gutter Icons | Show severity markers in the editor gutter | `true` |
| Enable Tool Window | Show the findings table tool window | `true` |
| Enable Annotations | Show inline annotation hints | `true` |
| Severity Threshold | Minimum severity to display (`critical`, `high`, `medium`, `low`, `info`) | `medium` |
| Auto Scan on Save | Trigger a scan automatically when files are saved | `false` |

### Environment Variables (LSP Server)

The LSP server also reads these environment variables, which the plugin sets automatically from the settings above:

- `SENTINEL_API_URL` -- API base URL
- `SENTINEL_API_TOKEN` -- bearer token
- `SENTINEL_PROJECT_ID` -- project identifier
- `SENTINEL_ORG_ID` -- organisation identifier
- `SENTINEL_CACHE_DIR` -- local finding cache directory (defaults to `~/.sentinel/cache`)

## Troubleshooting

| Problem | Possible Cause | Solution |
|---------|---------------|----------|
| LSP server not starting | Binary not found | Ensure the `sentinel-lsp` binary is bundled in the plugin `bin/` directory, or that `sentinel-lsp` / `node` is on your system PATH. Check **Help > Show Log** for the exact error. |
| Authentication errors (401/403) | Invalid or expired API token | Re-enter your API token in **Settings > Tools > Sentinel Security**. The status bar will show "auth_error" when credentials are rejected. |
| No findings appearing | Project ID mismatch | Verify the Project ID in settings matches the project on the Sentinel dashboard. |
| Status bar shows "Disconnected" / "offline" | Network issue or API down | Check that the API URL is reachable. The plugin falls back to its local cache when offline. |
| Gutter icons not visible | Disabled in settings or severity filtered | Check **Settings > Tools > Sentinel Security** -- ensure gutter icons are enabled and the severity threshold is not set too high. |
| Plugin not listed | Incompatible IDE version | This plugin requires build 241+ (IntelliJ 2024.1). Upgrade your IDE or check the compatibility matrix above. |

## Development

### Prerequisites

- JDK 17
- Gradle 8.5+ (the included Gradle wrapper is sufficient)

### Build

```bash
cd packages/sentinel-jetbrains
./gradlew buildPlugin
```

The plugin `.zip` is written to `build/distributions/`.

### Test

```bash
./gradlew test
```

Tests use JUnit 5 and MockK. The test suite covers:
- `SeverityMapperTest` -- severity string to icon/color mapping
- `PriorityScorerTest` -- finding priority scoring
- `SentinelLspRequestManagerTest` -- LSP request serialisation
- `SentinelAuthServiceTest` -- token storage via PasswordSafe
- `SentinelFindingsServiceTest` -- findings state management

### Run in Sandbox IDE

```bash
./gradlew runIde
```

This launches a sandboxed IntelliJ IDEA instance with the plugin pre-installed for manual testing.

### Key Dependencies

| Dependency | Version | Purpose |
|-----------|---------|---------|
| Kotlin | 1.9.25 | Plugin language |
| kotlinx-coroutines | 1.8.1 | Async operations |
| IntelliJ Platform SDK | 2024.1 (IC) | IDE integration |
| LSP4IJ | 0.4.0 | LSP protocol bridge |
| MockK | 1.13.12 | Test mocking |

## Architecture

The plugin follows a **Hybrid Native Shell + LSP Core** design:

```
+------------------------------------------+
|          JetBrains IDE (Kotlin)          |
|                                          |
|  +------------+  +-------------------+   |
|  | Tool Window|  | Gutter / Annotator|   |
|  | (table)    |  | (line markers)    |   |
|  +-----+------+  +--------+----------+   |
|        |                   |              |
|  +-----+-------------------+----------+   |
|  |     FindingsService / StateManager |   |
|  +----------------+------------------+    |
|                   |                       |
|  +----------------v------------------+    |
|  |           LSP4IJ Bridge           |    |
|  +----------------+------------------+    |
+-------------------|-------------------+
                    | stdio
+-------------------|-------------------+
|  sentinel-lsp    (TypeScript / Bun)   |
|                                       |
|  +-------------+  +--------------+    |
|  | FindingCache|  | SSE Listener |    |
|  +------+------+  +------+-------+    |
|         |                |             |
|  +------v----------------v--------+   |
|  |        Sentinel API Client     |   |
|  +----------------+---------------+   |
+--------------------|------------------+
                     | HTTPS
              +------v------+
              | Sentinel API |
              +-------------+
```

1. The **Kotlin shell** provides native IDE UI: tool window, gutter icons, annotations, status bar, and actions.
2. Communication flows through **LSP4IJ** over stdio to the `sentinel-lsp` process.
3. The **LSP server** maintains a local finding cache, subscribes to SSE events for real-time updates, and maps findings to LSP diagnostics, code actions, and code lenses.
4. The LSP server resolves its binary in order: bundled platform binary > `sentinel-lsp` on PATH > Node.js fallback.

## License

See the repository root LICENSE file for terms.

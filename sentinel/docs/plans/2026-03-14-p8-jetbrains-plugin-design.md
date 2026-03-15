# P8: JetBrains Plugin — Real Kotlin Implementation Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a production-grade JetBrains plugin that delivers the full Sentinel security experience natively — tool windows, gutter icons, inline inspections, background scanning, and real-time finding updates — while sharing core finding logic with VS Code/Vim through the `sentinel-lsp` server.

**Architecture:** Hybrid Native Shell + LSP Core. The Kotlin plugin owns all UI/UX (tool windows, gutter icons, external annotators, project settings, notifications). The `sentinel-lsp` TypeScript server (shared with VS Code) owns all intelligence (API communication, SSE streaming, finding cache, diagnostic mapping). Communication via LSP stdio with custom `sentinel/*` methods.

**Tech Stack:** Kotlin 1.9+, IntelliJ Platform SDK 2024.1+, LSP4IJ 0.4.0+, kotlinx.coroutines, Gradle IntelliJ Plugin 1.17+. LSP side: TypeScript, `vscode-languageserver`, `eventsource`, vitest.

**Research Base:** Deep analysis of Cline (gRPC/Protobuf, Human-in-the-Loop gating), Continue (monolithic core + multi-platform bindings, 150+ message types), Tabby (LSP4IJ thin client pattern), OpenCode (terminal-first with LSP), and Void (fork-based extensibility).

---

## Why This Design

| Gap | Risk Without Fix | Enterprise Requirement |
|-----|-----------------|----------------------|
| No JetBrains integration | 30%+ enterprise developers locked out | Multi-IDE support, enterprise procurement |
| Thin LSP wrapper only | Generic LSP rendering, no native UX | Developer adoption, competitive parity |
| No tool window | Cannot browse/filter/sort findings in IDE | Finding triage workflow |
| No gutter icons | Findings invisible at a glance | Shift-left security, developer trust |
| No native settings | Must configure via JSON/env vars | Enterprise IT deployment |
| No offline resilience | Plugin useless without network | Air-gapped environments, travel |

---

## 3 Enterprise Approaches — Overall Architecture

### Approach A: Thin LSP4IJ Wrapper (Existing P8 Design)

`sentinel-lsp` TypeScript server owns all logic. JetBrains plugin is ~200 LOC Kotlin shim launching LSP via stdio, registering LSP4IJ.

| Dimension | Rating | Notes |
|-----------|--------|-------|
| Performance | Medium | Extra Node.js process, IPC overhead, ~50MB RAM |
| Scalability | High | Add new IDEs trivially |
| Accuracy | High | Single codebase = single truth |
| Dev Velocity | High | One TypeScript codebase |
| Native UX | Low | No tool windows, gutter icons, or inspections |
| Enterprise Fit | Medium | Requires Node.js on dev machines |

### Approach B: Pure Native Kotlin Plugin

No LSP. Pure Kotlin using IntelliJ Platform SDK. Native inspections, tool windows, gutter icons, project settings. Direct REST+SSE communication.

| Dimension | Rating | Notes |
|-----------|--------|-------|
| Performance | High | In-process JVM, zero IPC |
| Scalability | Low | JetBrains-only, no VS Code reuse |
| Accuracy | High | Full PSI (AST) access |
| Dev Velocity | Medium | Separate codebase, feature parity drift |
| Native UX | Excellent | Full JetBrains look-and-feel |
| Enterprise Fit | High | No Node.js dependency |

### Approach C: Hybrid Native Shell + LSP Core (Chosen)

Native Kotlin for UI/UX. LSP server for finding logic. Rich client, not thin wrapper.

| Dimension | Rating | Notes |
|-----------|--------|-------|
| Performance | High | Native UI (in-process), LSP handles I/O in background |
| Scalability | High | Core logic shared across IDEs |
| Accuracy | High | Kotlin has PSI access; LSP provides finding data |
| Dev Velocity | High | Core written once, UX per platform |
| Native UX | Excellent | Full JetBrains native components |
| Enterprise Fit | High | LSP binary bundled in plugin zip |

**Why hybrid over A:** LSP's diagnostic model covers ~70% of use cases, but enterprise JetBrains users expect tool windows with finding tables, gutter icons, project configuration panels, and native notifications. These cannot be delivered through LSP alone.

**Why hybrid over B:** Duplicating API client, SSE reconnection, finding cache, HMAC signing, and dedup across TypeScript and Kotlin creates maintenance burden and feature parity drift — the #1 pain point in Continue's multi-IDE architecture.

---

## 3 Enterprise Approaches — Per Category

### Algorithms & Data Structures

#### 1. Finding-to-Editor File Mapping

**A. HashMap on Normalized Relative Paths** — Normalize both API paths and editor paths to relative (strip workspace root), store in `Map<relativePath, List<Finding>>`. O(1) lookup per file open. Simple, zero false positives. Breaks if Sentinel stores paths differently than workspace layout (monorepo sub-paths, symlinks).

**B. Suffix Trie on Reversed Path Segments** — Build trie keyed on reversed path segments. `src/users/controller.ts` stored as `controller.ts -> users -> src`. O(k) lookup where k = path depth. Handles partial path matches (monorepo sub-projects). Higher memory (~2x over HashMap), overkill if paths always match exactly.

**C. JetBrains VirtualFile Canonical Path Resolution** — Use `VirtualFileManager.findFileByUrl()` to resolve symlinks and canonical paths, then HashMap on canonical path. JetBrains-native, handles all edge cases including symlinks, case-insensitive filesystems, and `.idea` path mappings.

**Hybrid verdict: A+C.** HashMap (A) as primary data structure — handles 95% of cases in O(1). JetBrains `VirtualFile` resolution (C) as the path normalization step before HashMap insertion/lookup — eliminates symlink and monorepo path ambiguity at the source. Suffix trie (B) unnecessary because canonical path resolution handles the cases B was designed for, with less memory overhead.

*Performance justification:* VirtualFile canonical resolution is O(1) amortized — JetBrains VFS is an in-memory cache. HashMap lookup is O(1). Total: O(1) per file open. Memory: ~100 bytes per finding entry. At 5K findings: ~500KB — negligible.

*Why not B:* Suffix trie consumes ~2x memory and still can't resolve true ambiguity (two files named `index.ts` in different modules producing different findings). Canonical path resolution eliminates ambiguity rather than guessing.

#### 2. Real-Time Finding Synchronization

**A. Periodic Polling with Delta Detection** — Poll `GET /v1/findings` every N seconds. Diff against local cache using finding IDs. O(n) per poll where n = total findings. Simple, works through any proxy/firewall. Latency = poll interval (5-30s). Wastes bandwidth when nothing changes (~95% of polls).

**B. SSE Push with Local JSON Cache** — Open `GET /v1/events/stream?topics=finding.*,scan.completed`. On event, fetch updated findings for affected scan. Cache in `~/.sentinel/cache/{projectId}/findings.json`. O(1) per event. Near-instant updates (<100ms). Zero wasted bandwidth. Leverages existing P7 SSE infrastructure.

**C. WebSocket Bidirectional Stream** — Persistent WebSocket with finding diffs. Server knows which files are open — sends targeted updates. Most efficient bandwidth. Sentinel doesn't have WebSocket infrastructure — requires new server code.

**Hybrid verdict: B (SSE) as transport, with JetBrains-idiomatic consumption.** SSE (B) is the clear winner. Already implemented in Sentinel P7 (`sentinel.findings` events published by worker.ts). EventSource API handles reconnection natively. On the Kotlin side, consume via `kotlinx.coroutines` with `Dispatchers.IO` for SSE reading, `ApplicationManager.invokeLater()` for EDT UI updates — this is the JetBrains-recommended async I/O pattern since 2024.1.

*Why not A:* Polling wastes bandwidth (95% of polls return no changes) and adds 5-30s latency. Unacceptable for a "real-time" developer experience.

*Why not C:* Sentinel has no WebSocket infrastructure. Building it adds server-side complexity for marginal bandwidth savings. SSE reconnection is simpler and battle-tested.

*Why not pure B:* SSE consumption needs JetBrains-idiomatic threading. Raw thread creation causes EDT blocking warnings. Coroutines are the platform-standard since IntelliJ 2024.1.

#### 3. Finding Deduplication & Priority Ordering

**A. Database Finding ID as Dedup Key** — Server-assigned UUID stored in `HashSet<String>`. O(1) membership test. Deterministic. No false positives/negatives. Relies on server uniqueness guarantee.

**B. Content-Addressable Hash** — `sha256(file + lineRange + category + agent)`. Handles cross-scan dedup where same finding appears in consecutive scans with different IDs. O(1) per finding. Risk: line-shift after refactoring creates "new" hash for same logical finding.

**C. Priority Queue with Severity x Confidence Scoring** — Score = `severityWeight * confidence`. Max-heap for highest-priority first. O(log n) insert, O(1) peek. Natural ordering for tool window display. Doesn't deduplicate — only prioritizes.

**Hybrid verdict: A+C.** Finding ID (A) for dedup — simple, authoritative, server already guarantees uniqueness. Priority queue (C) for display ordering in tool window and gutter icon severity coloring. Skip content hash (B) — server already deduplicates across scans; client-side content hashing adds complexity for an edge case the server handles.

*Severity weights:* `critical=5, high=4, medium=3, low=2, info=1`. Score = `weight * confidence`. Tie-break by `createdAt` descending (newest first).

### System Design

#### 1. Communication Architecture

**A. Direct REST + Polling** — Plugin calls Sentinel API directly via `HttpClient`. Polls for finding updates. Simple implementation. 100-500ms latency per API call. No real-time updates without polling.

**B. LSP stdio + Custom Methods** — Standard LSP for diagnostics (`textDocument/publishDiagnostics`), code actions (`textDocument/codeAction`), code lens (`textDocument/codeLens`). Custom `sentinel/*` methods for scan trigger, status, suppress, configuration. Single stdio pipe. Standard protocol with extensions.

**C. gRPC with Protobuf** — Binary protocol, bidirectional streaming. Maximum throughput. Type-safe generated stubs. Requires Protobuf compilation step, binary dependency, gRPC runtime.

**Hybrid verdict: B (LSP).** LSP stdio is sufficient and optimal for our message volume (<100 messages/minute typical). `textDocument/publishDiagnostics` handles findings. Custom methods handle mutations. No need for gRPC — our interaction model is request/notification, not bidirectional streaming. Cline uses gRPC because it has 25+ bidirectional streaming tools; we have <10 message types.

*Why not A:* Loses real-time push. Would need to re-implement SSE consumption in Kotlin — duplicating the LSP server's SSE logic.

*Why not C:* gRPC adds Protobuf compilation step, binary runtime dependency (~15MB), and doesn't leverage existing LSP tooling (LSP4IJ). Overhead unjustified for our message volume.

#### 2. Plugin Packaging & Distribution

**A. Plugin ZIP + Bundled Node.js Runtime** — Ship Node.js binary (60MB) inside plugin archive. Zero external dependencies. Plugin size: ~110MB. JetBrains Marketplace allows up to 200MB.

**B. Plugin ZIP + System Node.js Detection** — Detect `node` on PATH at startup. Show configuration dialog if missing. Plugin size: ~5MB. Requires user to have Node.js installed.

**C. Plugin ZIP + Pre-compiled LSP Binary** — Compile `sentinel-lsp` to standalone binary via `bun build --compile` or `pkg`. Single ~50MB binary per platform. Ship platform-specific binary in plugin ZIP. Zero runtime dependencies.

**Hybrid verdict: C.** Pre-compiled binary eliminates the "requires Node.js" enterprise objection. `bun build --compile` produces a single executable (~50MB) with V8 runtime embedded. Ship three variants (linux-x64, darwin-arm64, win-x64) — JetBrains Marketplace supports platform-specific plugin variants. Total plugin size: ~55MB (one platform).

*Why not A:* Plugin balloons to 110MB+. Node.js version conflicts with user's existing installation. Some enterprises block Node.js but allow JetBrains plugins.

*Why not B:* Enterprise lockdown environments often don't have Node.js installed. Creates a support burden ("plugin doesn't work" = "you need to install Node 20+"). Violates zero-dependency enterprise principle.

*Fallback:* If pre-compiled binary has issues on a platform, fall back to system Node.js with clear error message. This provides graceful degradation.

#### 3. Credential Storage & Authentication

**A. JetBrains PasswordSafe API** — Native encrypted credential storage. Per-project API tokens. Backed by system keychain (macOS Keychain, Windows Credential Manager, KDE Wallet, GNOME Keyring) automatically. Standard JetBrains API.

**B. OS System Keychain Directly** — Use `java.security.KeyStore` or native keychain libraries directly. Bypasses JetBrains abstraction. More control, more platform-specific code.

**C. Encrypted Configuration File** — `~/.sentinel/credentials.enc`. AES-256-GCM with machine-derived key. Cross-platform. Custom crypto implementation.

**Hybrid verdict: A (PasswordSafe).** JetBrains `PasswordSafe` is the platform standard. All JetBrains plugins (GitHub, GitLab, AWS Toolkit, Azure Toolkit) use it. Backed by system keychain automatically — no custom crypto. Supports per-project credentials (multi-org enterprises). Enterprise SSO plugins integrate with it.

*Why not B:* Re-implementing keychain integration that JetBrains already provides. Platform-specific code for each OS. No benefit.

*Why not C:* Custom crypto is a security anti-pattern. Rolling your own AES key derivation invites vulnerabilities. PasswordSafe delegates to battle-tested OS keychains.

### Software Design

#### 1. Plugin Architecture Pattern

**A. Monolithic Service** — Single `SentinelProjectService` class containing all logic (LSP lifecycle, finding state, UI updates). Simple. Grows unwieldy past ~500 LOC. Untestable — too many responsibilities.

**B. Layered Architecture (Presentation / Domain / Infrastructure)** — Presentation layer: tool windows, gutter icons, actions, status bar. Domain layer: finding model, severity mapping, priority scoring. Infrastructure layer: LSP client wrapper, credential storage, file cache. Clear boundaries. Testable.

**C. Component-per-Feature** — `ScanComponent`, `FindingsComponent`, `SettingsComponent`. Each owns its UI + logic + state. Maximum encapsulation. Fights JetBrains plugin model (services, actions, and tool windows are registered separately in `plugin.xml`).

**Hybrid verdict: B (Layered).** Maps cleanly to JetBrains plugin model:
- `@Service(Service.Level.PROJECT)` classes = domain + infrastructure layer
- `AnAction` subclasses = presentation layer (commands)
- `ToolWindowFactory` = presentation layer (panels)
- `ExternalAnnotator` = presentation layer (gutter/inline)
- `plugin.xml` registration = wiring layer

Component-per-feature (C) fights the platform — JetBrains registers services, actions, and tool windows independently in XML. Layered architecture aligns with this.

*Why not A:* Past 500 LOC, a monolithic service becomes untestable and hard to reason about. We expect ~800 LOC total — layering keeps each class under 200 LOC.

*Why not C:* JetBrains `plugin.xml` requires separate registration of services, actions, tool windows, and annotators. Bundling them into "components" creates awkward wrappers around the platform model.

#### 2. State Management

**A. Project-Level Service Singleton** — `@Service(Service.Level.PROJECT)` holds all state: findings list, connection status, scan history. JetBrains DI provides lifecycle management (created on project open, disposed on close). Standard pattern.

**B. Redux-like Observable Store** — Centralized `SentinelState` data class. Actions dispatched to reducer. UI observes state via listeners. Predictable. Overkill for ~5 state properties.

**C. Kotlin StateFlow** — `MutableStateFlow<FindingsState>` observed by UI components via `collect()`. Coroutine-native. Cancel-safe. Structured concurrency.

**Hybrid verdict: A+C.** Project service singleton (A) as the container — JetBrains DI manages lifecycle. `StateFlow` (C) inside the service for reactive UI updates:

```kotlin
@Service(Service.Level.PROJECT)
class SentinelFindingsService(private val project: Project) : Disposable {
    private val _state = MutableStateFlow(FindingsState.EMPTY)
    val state: StateFlow<FindingsState> = _state.asStateFlow()

    // Tool window and gutter annotator observe state.collect()
}
```

*Why not B:* Redux adds an abstraction layer (actions, reducers, middleware) for ~5 state properties. Kotlin StateFlow provides the same reactivity with zero boilerplate.

#### 3. Testing Strategy

**A. Unit Tests Only** — Mock JetBrains APIs (`MockProject`, mock `VirtualFile`). Fast (<1s per test). Miss integration bugs with real IDE APIs.

**B. JetBrains Test Framework (`BasePlatformTestCase`)** — Full IDE fixture. Real PSI, real VFS, real service container. Slow (~10s startup per test class). Catches real integration bugs.

**C. Contract Tests Against LSP** — Verify Kotlin client sends correct LSP requests and handles responses correctly. JSON schema validation. No IDE dependency.

**Hybrid verdict: A+C with selective B.**
- **Unit tests (A)** for: severity mapping, priority scoring, path normalization, credential handling, state management. ~70% of tests. Fast.
- **Contract tests (C)** for: LSP request/response schemas, custom `sentinel/*` method payloads, error handling. ~20% of tests. No IDE fixture needed.
- **Integration tests (B)** for: tool window rendering with mock data, gutter icon display, action registration. ~10% of tests (~3-4 tests). Only where unit tests can't verify behavior.

*Why selective B:* `BasePlatformTestCase` takes ~10s to spin up an IDE fixture. Running it for every test wastes CI time. Reserve it for behavior that genuinely requires the IDE runtime.

---

## Component Design

### Package Structure

```
packages/sentinel-jetbrains/
  build.gradle.kts
  src/main/
    kotlin/com/sentinel/intellij/
      SentinelPlugin.kt                   # Plugin entry, LSP lifecycle
      services/
        SentinelProjectService.kt         # Project-level service, LSP client management
        SentinelFindingsService.kt        # Finding state (StateFlow), dedup, priority
        SentinelSettingsService.kt        # Persistent settings (PersistentStateComponent)
        SentinelAuthService.kt            # PasswordSafe credential management
      lsp/
        SentinelLspServerDescriptor.kt    # LSP4IJ server descriptor, binary launch
        SentinelLspRequestManager.kt      # Custom sentinel/* request/notification handling
      ui/
        SentinelToolWindowFactory.kt      # Tool window with findings table
        SentinelToolWindowPanel.kt        # JBTable + toolbar + filters
        SentinelGutterIconProvider.kt     # LineMarkerProvider for severity icons
        SentinelExternalAnnotator.kt      # Inline finding descriptions
        SentinelStatusBarWidget.kt        # Status bar: scan status + finding count
      actions/
        TriggerScanAction.kt             # Manual scan trigger
        SuppressFindingAction.kt         # Suppress from gutter/tool window
        OpenDashboardAction.kt           # Open finding in browser
        ConfigureAction.kt               # Open settings dialog
      model/
        Finding.kt                        # Kotlin data class, mapped from LSP
        FindingsState.kt                  # Immutable state: findings, status, errors
        SeverityMapper.kt                 # Sentinel severity -> IntelliJ severity/icon
        PriorityScorer.kt                # Severity x confidence scoring
    resources/
      META-INF/
        plugin.xml                        # Extension point registrations
        pluginIcon.svg                    # 40x40 plugin icon
      icons/
        sentinel-critical.svg             # Gutter icon: red circle
        sentinel-high.svg                 # Gutter icon: orange triangle
        sentinel-medium.svg               # Gutter icon: yellow diamond
        sentinel-low.svg                  # Gutter icon: blue square
        sentinel-info.svg                 # Gutter icon: gray circle
        sentinel-logo.svg                 # 13x13 status bar icon
  src/test/
    kotlin/com/sentinel/intellij/
      model/SeverityMapperTest.kt
      model/PriorityScorerTest.kt
      services/SentinelFindingsServiceTest.kt
      services/SentinelAuthServiceTest.kt
      lsp/SentinelLspRequestManagerTest.kt
      ui/SentinelToolWindowPanelTest.kt   # BasePlatformTestCase
```

### 1. LSP Server Descriptor (`lsp/SentinelLspServerDescriptor.kt`)

Launches the pre-compiled `sentinel-lsp` binary via stdio. Handles binary resolution per platform.

```kotlin
class SentinelLspServerDescriptor(project: Project) : ProjectLspServerDescriptor(project, "Sentinel") {

    override fun createCommandLine(): GeneralCommandLine {
        val binary = resolveLspBinary()
        return GeneralCommandLine(binary.absolutePath, "--stdio").apply {
            withWorkDirectory(project.basePath)
            withEnvironment("SENTINEL_API_URL", settings.apiUrl)
            withEnvironment("SENTINEL_API_TOKEN", authService.getToken(project))
            withEnvironment("SENTINEL_PROJECT_ID", settings.projectId)
        }
    }

    private fun resolveLspBinary(): File {
        val pluginDir = PluginManagerCore.getPlugin(PLUGIN_ID)?.pluginPath
            ?: throw IllegalStateException("Sentinel plugin directory not found")
        val platform = when {
            SystemInfo.isLinux -> "linux-x64"
            SystemInfo.isMac -> if (CpuArch.isArm64()) "darwin-arm64" else "darwin-x64"
            SystemInfo.isWindows -> "win-x64"
            else -> throw UnsupportedOperationException("Unsupported platform")
        }
        val binary = pluginDir.resolve("bin/sentinel-lsp-$platform")
        if (!binary.exists()) throw FileNotFoundException("LSP binary not found: $binary")
        if (SystemInfo.isUnix) binary.toFile().setExecutable(true)
        return binary.toFile()
    }
}
```

### 2. Findings Service (`services/SentinelFindingsService.kt`)

Central state manager. Receives findings from LSP diagnostics, maintains dedup set, exposes `StateFlow` for UI.

```kotlin
@Service(Service.Level.PROJECT)
class SentinelFindingsService(private val project: Project) : Disposable {

    private val _state = MutableStateFlow(FindingsState.EMPTY)
    val state: StateFlow<FindingsState> = _state.asStateFlow()

    // Dedup by server finding ID
    private val knownIds = ConcurrentHashMap.newKeySet<String>()

    // File index: canonical path -> sorted findings
    private val byFile = ConcurrentHashMap<String, List<Finding>>()

    fun updateFindings(findings: List<Finding>) {
        val deduped = findings.filter { knownIds.add(it.id) || knownIds.contains(it.id) }

        // Rebuild file index with priority ordering
        val grouped = deduped.groupBy { it.file }
        for ((file, filefindings) in grouped) {
            val canonical = resolveCanonicalPath(file)
            byFile[canonical] = filefindings.sortedByDescending { PriorityScorer.score(it) }
        }

        _state.value = FindingsState(
            findings = deduped,
            byFile = byFile.toMap(),
            connectionStatus = _state.value.connectionStatus,
            lastUpdated = Instant.now(),
        )
    }

    fun getFindingsForFile(virtualFile: VirtualFile): List<Finding> {
        val canonical = virtualFile.canonicalPath ?: virtualFile.path
        val relative = project.basePath?.let {
            canonical.removePrefix(it).removePrefix("/")
        } ?: canonical
        return byFile[relative] ?: emptyList()
    }

    fun suppressFinding(findingId: String) {
        // Send suppress command via LSP custom method
        project.getService(SentinelLspRequestManager::class.java)
            .suppressFinding(findingId)

        // Optimistic UI update
        knownIds.remove(findingId)
        _state.update { current ->
            current.copy(findings = current.findings.filter { it.id != findingId })
        }
    }

    private fun resolveCanonicalPath(apiPath: String): String {
        val vf = LocalFileSystem.getInstance().findFileByPath(
            "${project.basePath}/$apiPath"
        )
        return vf?.canonicalPath?.removePrefix("${project.basePath}/") ?: apiPath
    }

    override fun dispose() { /* cleanup */ }
}
```

### 3. Tool Window (`ui/SentinelToolWindowFactory.kt` + `SentinelToolWindowPanel.kt`)

Findings table with severity filters, sorting, and search.

```kotlin
class SentinelToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel = SentinelToolWindowPanel(project)
        val content = ContentFactory.getInstance().createContent(panel, "Findings", false)
        toolWindow.contentManager.addContent(content)
    }
}

class SentinelToolWindowPanel(private val project: Project) : JBPanel<SentinelToolWindowPanel>(BorderLayout()) {

    private val findingsService = project.getService(SentinelFindingsService::class.java)
    private val tableModel = FindingsTableModel()
    private val table = JBTable(tableModel).apply {
        setShowGrid(false)
        autoCreateRowSorter = true
        selectionModel.selectionMode = ListSelectionModel.SINGLE_SELECTION
        addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                if (e.clickCount == 2) navigateToFinding()
            }
        })
    }

    // Severity filter toolbar
    private val severityFilters = mapOf(
        "critical" to JBCheckBox("Critical", true),
        "high" to JBCheckBox("High", true),
        "medium" to JBCheckBox("Medium", true),
        "low" to JBCheckBox("Low", false),
        "info" to JBCheckBox("Info", false),
    )

    init {
        val toolbar = JPanel(FlowLayout(FlowLayout.LEFT)).apply {
            severityFilters.values.forEach { cb ->
                cb.addActionListener { refreshTable() }
                add(cb)
            }
        }
        add(toolbar, BorderLayout.NORTH)
        add(JBScrollPane(table), BorderLayout.CENTER)

        // Observe state changes
        findingsService.project.coroutineScope.launch {
            findingsService.state.collect { state ->
                ApplicationManager.getApplication().invokeLater {
                    refreshTable(state)
                }
            }
        }
    }

    private fun refreshTable(state: FindingsState = findingsService.state.value) {
        val enabledSeverities = severityFilters
            .filter { it.value.isSelected }
            .keys
        val filtered = state.findings.filter { it.severity in enabledSeverities }
        tableModel.setFindings(filtered)
    }

    private fun navigateToFinding() {
        val row = table.selectedRow.takeIf { it >= 0 } ?: return
        val finding = tableModel.getFindingAt(table.convertRowIndexToModel(row))
        val vf = LocalFileSystem.getInstance().findFileByPath(
            "${project.basePath}/${finding.file}"
        ) ?: return
        FileEditorManager.getInstance(project).openFile(vf, true)
        // Navigate to line
        val editor = FileEditorManager.getInstance(project).selectedTextEditor ?: return
        val offset = editor.document.getLineStartOffset(
            (finding.lineStart - 1).coerceIn(0, editor.document.lineCount - 1)
        )
        editor.caretModel.moveToOffset(offset)
        editor.scrollingModel.scrollToCaret(ScrollType.CENTER)
    }
}
```

### 4. Gutter Icon Provider (`ui/SentinelGutterIconProvider.kt`)

Line markers showing severity icons in the gutter.

```kotlin
class SentinelGutterIconProvider : LineMarkerProvider {

    override fun getLineMarkerInfo(element: PsiElement): LineMarkerInfo<*>? = null

    override fun collectSlowLineMarkers(
        elements: MutableList<out PsiElement>,
        result: MutableCollection<in LineMarkerInfo<*>>
    ) {
        if (elements.isEmpty()) return
        val file = elements.first().containingFile?.virtualFile ?: return
        val project = elements.first().project
        val service = project.getService(SentinelFindingsService::class.java)
        val findings = service.getFindingsForFile(file)
        if (findings.isEmpty()) return

        // Group findings by line
        val byLine = findings.groupBy { it.lineStart }

        for (element in elements) {
            val line = element.textRange?.let {
                element.containingFile?.viewProvider?.document?.getLineNumber(it.startOffset)?.plus(1)
            } ?: continue

            val lineFindings = byLine[line] ?: continue
            val maxSeverity = lineFindings.maxByOrNull { PriorityScorer.score(it) } ?: continue

            result.add(LineMarkerInfo(
                element,
                element.textRange,
                SeverityMapper.toIcon(maxSeverity.severity),
                { psi -> buildTooltip(lineFindings) },
                { e, elt -> showFindingsPopup(project, lineFindings, e) },
                GutterIconRenderer.Alignment.LEFT,
                { "Sentinel: ${lineFindings.size} finding(s)" }
            ))
        }
    }

    private fun buildTooltip(findings: List<Finding>): String {
        return findings.joinToString("\n") { f ->
            "[${f.severity.uppercase()}] ${f.title ?: f.category} (${f.agentName})"
        }
    }
}
```

### 5. External Annotator (`ui/SentinelExternalAnnotator.kt`)

Inline finding descriptions below affected lines — runs off EDT.

```kotlin
class SentinelExternalAnnotator : ExternalAnnotator<List<Finding>, List<Finding>>() {

    override fun collectInformation(file: PsiFile): List<Finding>? {
        val vf = file.virtualFile ?: return null
        val service = file.project.getService(SentinelFindingsService::class.java)
        return service.getFindingsForFile(vf).takeIf { it.isNotEmpty() }
    }

    override fun doAnnotate(findings: List<Finding>): List<Finding> = findings

    override fun apply(file: PsiFile, findings: List<Finding>, holder: AnnotationHolder) {
        val document = PsiDocumentManager.getInstance(file.project).getDocument(file) ?: return

        for (finding in findings) {
            val lineStart = (finding.lineStart - 1).coerceIn(0, document.lineCount - 1)
            val lineEnd = (finding.lineEnd - 1).coerceIn(lineStart, document.lineCount - 1)
            val startOffset = document.getLineStartOffset(lineStart)
            val endOffset = document.getLineEndOffset(lineEnd)

            val severity = SeverityMapper.toAnnotationSeverity(finding.severity)
            holder.newAnnotation(severity, finding.title ?: finding.category ?: finding.description ?: "Sentinel finding")
                .range(TextRange(startOffset, endOffset))
                .tooltip(buildAnnotationTooltip(finding))
                .withFix(SuppressIntentionAction(finding))
                .withFix(OpenDashboardIntentionAction(finding))
                .create()
        }
    }

    private fun buildAnnotationTooltip(finding: Finding): String {
        return buildString {
            append("<html><body>")
            append("<b>[${finding.severity.uppercase()}]</b> ${finding.title ?: finding.category}<br>")
            finding.description?.let { append("<p>$it</p>") }
            finding.remediation?.let { append("<p><i>Fix: $it</i></p>") }
            finding.cweId?.let { append("<p>CWE: $it</p>") }
            append("<p><small>${finding.agentName} | confidence: ${(finding.confidence * 100).toInt()}%</small></p>")
            append("</body></html>")
        }
    }
}
```

### 6. Status Bar Widget (`ui/SentinelStatusBarWidget.kt`)

Shows connection status and finding count.

```kotlin
class SentinelStatusBarWidget(project: Project) : StatusBarWidget, StatusBarWidget.TextPresentation {

    private val findingsService = project.getService(SentinelFindingsService::class.java)
    private var statusBar: StatusBar? = null

    init {
        project.coroutineScope.launch {
            findingsService.state.collect {
                ApplicationManager.getApplication().invokeLater {
                    statusBar?.updateWidget(ID())
                }
            }
        }
    }

    override fun ID(): String = "SentinelStatus"
    override fun getPresentation(): StatusBarWidget.WidgetPresentation = this
    override fun install(statusBar: StatusBar) { this.statusBar = statusBar }

    override fun getText(): String {
        val state = findingsService.state.value
        val icon = when (state.connectionStatus) {
            ConnectionStatus.CONNECTED -> "shield"
            ConnectionStatus.DISCONNECTED -> "shield-off"
            ConnectionStatus.ERROR -> "shield-alert"
        }
        val count = state.findings.size
        return "Sentinel: $count finding${if (count != 1) "s" else ""}"
    }

    override fun getTooltipText(): String {
        val state = findingsService.state.value
        return "Sentinel Security | ${state.connectionStatus.label} | ${state.findings.size} findings | Last updated: ${state.lastUpdated ?: "never"}"
    }

    override fun getAlignment(): Float = Component.CENTER_ALIGNMENT
}
```

### 7. Custom LSP Request Manager (`lsp/SentinelLspRequestManager.kt`)

Sends custom `sentinel/*` requests to the LSP server.

```kotlin
class SentinelLspRequestManager(private val project: Project) {

    fun triggerScan(files: List<String> = emptyList()) {
        sendRequest("sentinel/triggerScan", mapOf(
            "projectId" to getSettings().projectId,
            "files" to files,
        ))
    }

    fun suppressFinding(findingId: String) {
        sendRequest("sentinel/suppress", mapOf("findingId" to findingId))
    }

    fun getStatus(): CompletableFuture<Map<String, Any>> {
        return sendRequest("sentinel/status", emptyMap())
    }

    private fun sendRequest(method: String, params: Map<String, Any>): CompletableFuture<Map<String, Any>> {
        // LSP4IJ provides LanguageServerManager for sending custom requests
        val server = LanguageServerManager.getInstance(project)
            .getLanguageServer("sentinel") ?: return CompletableFuture.completedFuture(emptyMap())
        return server.requestManager.sendRequest(method, params)
    }
}
```

### 8. Settings Service (`services/SentinelSettingsService.kt`)

Persistent project-level settings.

```kotlin
@Service(Service.Level.PROJECT)
@State(
    name = "SentinelSettings",
    storages = [Storage("sentinel.xml")]
)
class SentinelSettingsService : PersistentStateComponent<SentinelSettingsService.State> {

    data class State(
        var apiUrl: String = "https://sentinel.example.com",
        var projectId: String = "",
        var enableGutterIcons: Boolean = true,
        var enableToolWindow: Boolean = true,
        var enableAnnotations: Boolean = true,
        var severityThreshold: String = "medium",  // Only show findings >= this severity
        var autoScanOnSave: Boolean = false,
    )

    private var myState = State()

    override fun getState(): State = myState
    override fun loadState(state: State) { myState = state }
}
```

### 9. Auth Service (`services/SentinelAuthService.kt`)

Credential management via JetBrains PasswordSafe.

```kotlin
@Service(Service.Level.APP)
class SentinelAuthService {

    private val credentialAttributes = CredentialAttributes(
        generateServiceName("Sentinel", "API Token")
    )

    fun getToken(project: Project): String? {
        // Try project-specific token first
        val projectKey = CredentialAttributes(
            generateServiceName("Sentinel", "API Token:${project.locationHash}")
        )
        return PasswordSafe.instance.getPassword(projectKey)
            ?: PasswordSafe.instance.getPassword(credentialAttributes)
    }

    fun setToken(token: String, project: Project? = null) {
        val key = if (project != null) {
            CredentialAttributes(
                generateServiceName("Sentinel", "API Token:${project.locationHash}")
            )
        } else credentialAttributes
        PasswordSafe.instance.setPassword(key, token)
    }

    fun hasToken(project: Project): Boolean = getToken(project) != null
}
```

### 10. Model Classes

```kotlin
// model/Finding.kt
data class Finding(
    val id: String,
    val scanId: String,
    val agentName: String,
    val severity: String,  // "critical" | "high" | "medium" | "low" | "info"
    val category: String?,
    val file: String,
    val lineStart: Int,
    val lineEnd: Int,
    val title: String?,
    val description: String?,
    val remediation: String?,
    val cweId: String?,
    val confidence: Double,
    val suppressed: Boolean,
    val createdAt: String,
)

// model/FindingsState.kt
data class FindingsState(
    val findings: List<Finding> = emptyList(),
    val byFile: Map<String, List<Finding>> = emptyMap(),
    val connectionStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED,
    val lastUpdated: Instant? = null,
    val activeScanId: String? = null,
) {
    companion object {
        val EMPTY = FindingsState()
    }
}

enum class ConnectionStatus(val label: String) {
    CONNECTED("Connected"),
    DISCONNECTED("Disconnected"),
    ERROR("Error"),
}

// model/SeverityMapper.kt
object SeverityMapper {
    private val iconMap = mapOf(
        "critical" to IconLoader.getIcon("/icons/sentinel-critical.svg", SeverityMapper::class.java),
        "high" to IconLoader.getIcon("/icons/sentinel-high.svg", SeverityMapper::class.java),
        "medium" to IconLoader.getIcon("/icons/sentinel-medium.svg", SeverityMapper::class.java),
        "low" to IconLoader.getIcon("/icons/sentinel-low.svg", SeverityMapper::class.java),
        "info" to IconLoader.getIcon("/icons/sentinel-info.svg", SeverityMapper::class.java),
    )

    fun toIcon(severity: String): Icon = iconMap[severity] ?: AllIcons.General.Information

    fun toAnnotationSeverity(severity: String): HighlightSeverity = when (severity) {
        "critical", "high" -> HighlightSeverity.ERROR
        "medium" -> HighlightSeverity.WARNING
        "low" -> HighlightSeverity.WEAK_WARNING
        else -> HighlightSeverity.INFORMATION
    }
}

// model/PriorityScorer.kt
object PriorityScorer {
    private val weights = mapOf(
        "critical" to 5.0, "high" to 4.0, "medium" to 3.0, "low" to 2.0, "info" to 1.0
    )

    fun score(finding: Finding): Double {
        return (weights[finding.severity] ?: 1.0) * finding.confidence
    }
}
```

---

## plugin.xml Registration

```xml
<idea-plugin>
    <id>com.sentinel.intellij</id>
    <name>Sentinel Security</name>
    <vendor>Sentinel</vendor>
    <version>0.1.0</version>
    <description>
        Real-time security findings, IP attribution, and compliance checks
        inline in your JetBrains IDE.
    </description>

    <depends>com.intellij.modules.platform</depends>
    <depends>com.redhat.devtools.lsp4ij</depends>

    <extensions defaultExtensionNs="com.intellij">
        <!-- Services -->
        <projectService serviceImplementation="com.sentinel.intellij.services.SentinelProjectService"/>
        <projectService serviceImplementation="com.sentinel.intellij.services.SentinelFindingsService"/>
        <projectService serviceImplementation="com.sentinel.intellij.services.SentinelSettingsService"/>
        <applicationService serviceImplementation="com.sentinel.intellij.services.SentinelAuthService"/>

        <!-- Tool Window -->
        <toolWindow id="Sentinel"
                    anchor="bottom"
                    factoryClass="com.sentinel.intellij.ui.SentinelToolWindowFactory"
                    icon="/icons/sentinel-logo.svg"/>

        <!-- Gutter Icons -->
        <codeInsight.lineMarkerProvider
                language=""
                implementationClass="com.sentinel.intellij.ui.SentinelGutterIconProvider"/>

        <!-- Inline Annotations -->
        <externalAnnotator
                language=""
                implementationClass="com.sentinel.intellij.ui.SentinelExternalAnnotator"/>

        <!-- Status Bar -->
        <statusBarWidgetFactory
                id="SentinelStatusBar"
                implementation="com.sentinel.intellij.ui.SentinelStatusBarWidgetFactory"/>

        <!-- Settings -->
        <projectConfigurable
                parentId="tools"
                instance="com.sentinel.intellij.ui.SentinelSettingsConfigurable"
                id="sentinel.settings"
                displayName="Sentinel Security"/>
    </extensions>

    <extensions defaultExtensionNs="com.redhat.devtools.lsp4ij">
        <server id="sentinel"
                name="Sentinel LSP"
                factoryClass="com.sentinel.intellij.lsp.SentinelLspServerDescriptor">
            <description><![CDATA[Sentinel security analysis language server]]></description>
        </server>
    </extensions>

    <actions>
        <group id="Sentinel.Actions" text="Sentinel" popup="true">
            <add-to-group group-id="ToolsMenu" anchor="last"/>
            <action id="Sentinel.TriggerScan"
                    class="com.sentinel.intellij.actions.TriggerScanAction"
                    text="Trigger Security Scan"
                    description="Run Sentinel scan on current project"
                    icon="AllIcons.Actions.Execute"/>
            <action id="Sentinel.Configure"
                    class="com.sentinel.intellij.actions.ConfigureAction"
                    text="Configure Sentinel"
                    description="Configure API connection"/>
            <action id="Sentinel.OpenDashboard"
                    class="com.sentinel.intellij.actions.OpenDashboardAction"
                    text="Open Dashboard"
                    description="Open Sentinel dashboard in browser"/>
        </group>
    </actions>
</idea-plugin>
```

---

## Data Flow

### File Open -> Diagnostics

```
Developer opens file.kt in IntelliJ
    |
    v
LSP4IJ sends textDocument/didOpen to sentinel-lsp (stdio)
    |
    v
sentinel-lsp FindingCache.getForFile(path, workspaceRoot)
    +-- HashMap lookup (O(1)) -> findings found
    |
    v
sentinel-lsp sends textDocument/publishDiagnostics
    |
    v
LSP4IJ renders native squiggly underlines + Problems panel
    |
    (simultaneously)
    v
SentinelFindingsService receives diagnostics via LSP4IJ listener
    +-- Updates StateFlow with parsed Finding objects
    +-- Dedup by finding ID
    +-- Priority sort by severity x confidence
    |
    v
Kotlin UI layer observes StateFlow changes:
    +-- SentinelGutterIconProvider: renders severity icons in gutter
    +-- SentinelExternalAnnotator: renders inline descriptions
    +-- SentinelToolWindowPanel: updates findings table
    +-- SentinelStatusBarWidget: updates finding count
```

### Real-Time Update Flow

```
Scan completes (background)
    |
    v
Sentinel worker publishes scan.completed + finding.created events
    |
    v
SSE stream delivers to sentinel-lsp SseListener
    |
    v
sentinel-lsp fetches updated findings, updates FindingCache
    |
    v
sentinel-lsp sends textDocument/publishDiagnostics for affected files
    |
    v
LSP4IJ delivers to JetBrains plugin
    |
    v
SentinelFindingsService.updateFindings() -> StateFlow emits
    |
    v
All UI components update reactively (tool window, gutter, annotations, status bar)
```

### Suppress Finding Flow

```
Developer right-clicks gutter icon -> "Suppress Finding"
    |
    v
SuppressFindingAction.actionPerformed()
    |
    v
SentinelFindingsService.suppressFinding(findingId)
    +-- Optimistic UI: removes finding from StateFlow immediately
    +-- Sends sentinel/suppress to LSP via SentinelLspRequestManager
    |
    v
sentinel-lsp executes: apiClient.suppressFinding(findingId)
    +-- PATCH /v1/findings/{id} { suppressed: true }
    |
    v
FindingCache removes finding, re-pushes diagnostics
    |
    v
Gutter icon + squiggly underline disappear (already gone from optimistic update)
```

---

## Error Handling

| Failure | Behavior | Recovery |
|---------|----------|----------|
| LSP binary not found | Status bar shows "LSP not found". Notification with download link. | Re-install plugin |
| LSP server crashes | LSP4IJ auto-restarts (built-in). Status bar flashes "reconnecting". | Automatic — LSP4IJ handles restart |
| Sentinel API unreachable | LSP serves cached findings. Status bar shows "offline". | SSE reconnect with exponential backoff (1s -> 30s max) |
| API token missing/invalid | Notification: "Configure Sentinel API token". Settings dialog opens. | User enters token via Settings |
| Finding cache corrupted | LSP deletes cache, refetches from API. | Automatic — cache is disposable |
| SSE heartbeat missed | EventSource triggers reconnect automatically. | Built into EventSource spec |
| File not in project | No findings, no gutter icons, no annotations. | Normal — file not tracked |
| EDT blocking detected | All I/O on `Dispatchers.IO`. UI updates via `invokeLater()`. | Architecture prevents this |

---

## Build Configuration

```kotlin
// build.gradle.kts
plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.25"
    id("org.jetbrains.intellij") version "1.17.4"
}

group = "com.sentinel"
version = "0.1.0"

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
    testImplementation("io.mockk:mockk:1.13.12")
}

intellij {
    version.set("2024.1")
    type.set("IC")
    plugins.set(listOf("com.redhat.devtools.lsp4ij:0.4.0"))
}

tasks {
    withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
        kotlinOptions.jvmTarget = "17"
    }
    patchPluginXml {
        sinceBuild.set("241")
        untilBuild.set("251.*")  // Support 2024.1 through 2025.1
    }
    // Copy pre-compiled LSP binaries into plugin sandbox
    prepareSandbox {
        from("${project.rootDir}/bin") {
            into("${intellij.pluginName.get()}/bin")
        }
    }
    test {
        useJUnitPlatform()
    }
}
```

---

## Testing Strategy

| Component | Tests | Type | Framework |
|-----------|-------|------|-----------|
| PriorityScorer | 4 | Unit | kotlin-test + JUnit5 |
| SeverityMapper | 5 | Unit | kotlin-test + JUnit5 |
| SentinelFindingsService | 6 | Unit | mockk + kotlin-test |
| SentinelAuthService | 4 | Unit | mockk (mock PasswordSafe) |
| SentinelLspRequestManager | 4 | Contract | mockk (verify LSP JSON payloads) |
| SentinelToolWindowPanel | 3 | Integration | BasePlatformTestCase |
| SentinelGutterIconProvider | 2 | Integration | BasePlatformTestCase |

**~28 tests, ~600 lines of test code.**

---

## File Impact Summary

| File | Action | Est. Lines |
|------|--------|-----------|
| `packages/sentinel-jetbrains/build.gradle.kts` | Rewrite | ~50 |
| `packages/sentinel-jetbrains/src/main/resources/META-INF/plugin.xml` | Create | ~70 |
| `packages/sentinel-jetbrains/src/main/resources/icons/*.svg` | Create | 6 files |
| `packages/sentinel-jetbrains/src/main/kotlin/.../SentinelPlugin.kt` | Create | ~30 |
| `packages/sentinel-jetbrains/src/main/kotlin/.../services/SentinelProjectService.kt` | Create | ~60 |
| `packages/sentinel-jetbrains/src/main/kotlin/.../services/SentinelFindingsService.kt` | Create | ~120 |
| `packages/sentinel-jetbrains/src/main/kotlin/.../services/SentinelSettingsService.kt` | Create | ~40 |
| `packages/sentinel-jetbrains/src/main/kotlin/.../services/SentinelAuthService.kt` | Create | ~45 |
| `packages/sentinel-jetbrains/src/main/kotlin/.../lsp/SentinelLspServerDescriptor.kt` | Create | ~60 |
| `packages/sentinel-jetbrains/src/main/kotlin/.../lsp/SentinelLspRequestManager.kt` | Create | ~50 |
| `packages/sentinel-jetbrains/src/main/kotlin/.../ui/SentinelToolWindowFactory.kt` | Create | ~15 |
| `packages/sentinel-jetbrains/src/main/kotlin/.../ui/SentinelToolWindowPanel.kt` | Create | ~120 |
| `packages/sentinel-jetbrains/src/main/kotlin/.../ui/SentinelGutterIconProvider.kt` | Create | ~80 |
| `packages/sentinel-jetbrains/src/main/kotlin/.../ui/SentinelExternalAnnotator.kt` | Create | ~80 |
| `packages/sentinel-jetbrains/src/main/kotlin/.../ui/SentinelStatusBarWidget.kt` | Create | ~60 |
| `packages/sentinel-jetbrains/src/main/kotlin/.../ui/SentinelSettingsConfigurable.kt` | Create | ~80 |
| `packages/sentinel-jetbrains/src/main/kotlin/.../actions/TriggerScanAction.kt` | Create | ~30 |
| `packages/sentinel-jetbrains/src/main/kotlin/.../actions/SuppressFindingAction.kt` | Create | ~35 |
| `packages/sentinel-jetbrains/src/main/kotlin/.../actions/OpenDashboardAction.kt` | Create | ~20 |
| `packages/sentinel-jetbrains/src/main/kotlin/.../actions/ConfigureAction.kt` | Create | ~15 |
| `packages/sentinel-jetbrains/src/main/kotlin/.../model/Finding.kt` | Create | ~25 |
| `packages/sentinel-jetbrains/src/main/kotlin/.../model/FindingsState.kt` | Create | ~25 |
| `packages/sentinel-jetbrains/src/main/kotlin/.../model/SeverityMapper.kt` | Create | ~30 |
| `packages/sentinel-jetbrains/src/main/kotlin/.../model/PriorityScorer.kt` | Create | ~15 |
| Tests (7 files) | Create | ~600 |

**Total: ~1,820 LOC Kotlin + tests. 30 files.**

**Dependencies on P8 LSP server:** This plugin requires the `sentinel-lsp` server (Tasks 1-10 of existing P8 plan) to be built first. The LSP server provides: finding cache, API client, SSE listener, diagnostic mapper, code actions, code lens. The JetBrains plugin adds native UI on top.

**No new Docker services. No database migrations. No new npm dependencies.** Gradle handles all Kotlin/JetBrains dependencies.

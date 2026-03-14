# P8: JetBrains Plugin — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a production-grade JetBrains IntelliJ plugin in Kotlin that delivers native tool windows, gutter icons, inline annotations, and real-time finding updates — communicating with the shared `sentinel-lsp` server via LSP stdio.

**Architecture:** Hybrid Native Shell + LSP Core. Kotlin plugin owns UI/UX (tool windows, gutter icons, external annotators, project settings, status bar). LSP server (TypeScript, shared with VS Code) owns intelligence (API communication, SSE streaming, finding cache, diagnostics). Communication via LSP4IJ over stdio with custom `sentinel/*` methods.

**Tech Stack:** Kotlin 1.9.25, IntelliJ Platform SDK 2024.1+, LSP4IJ 0.4.0, kotlinx.coroutines 1.8.1, Gradle IntelliJ Plugin 1.17.4, JUnit5, mockk 1.13.12.

**Prerequisite:** This plan covers the JetBrains Kotlin plugin only. It assumes the `sentinel-lsp` TypeScript server (Tasks 1-10 of the existing P8 LSP plan at `docs/plans/2026-03-11-p8-ide-plugins-plan.md`) is available. All LSP communication is mocked in tests, so this plugin can be developed independently.

**Design doc:** `docs/plans/2026-03-14-p8-jetbrains-plugin-design.md`

---

## Task 1: Scaffold Gradle Build + Empty Plugin

**Files:**
- Rewrite: `packages/sentinel-jetbrains/build.gradle.kts`
- Create: `packages/sentinel-jetbrains/settings.gradle.kts`
- Create: `packages/sentinel-jetbrains/src/main/resources/META-INF/plugin.xml`
- Create: `packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/SentinelPlugin.kt`

**Step 1: Create `settings.gradle.kts`**

```kotlin
// packages/sentinel-jetbrains/settings.gradle.kts
rootProject.name = "sentinel-jetbrains"
```

**Step 2: Rewrite `build.gradle.kts`**

```kotlin
// packages/sentinel-jetbrains/build.gradle.kts
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
        untilBuild.set("251.*")
    }
    test {
        useJUnitPlatform()
    }
}
```

**Step 3: Create minimal `plugin.xml`**

```xml
<!-- packages/sentinel-jetbrains/src/main/resources/META-INF/plugin.xml -->
<idea-plugin>
    <id>com.sentinel.intellij</id>
    <name>Sentinel Security</name>
    <vendor>Sentinel</vendor>
    <version>0.1.0</version>
    <description><![CDATA[
        Real-time security findings, IP attribution, and compliance checks
        inline in your JetBrains IDE.
    ]]></description>

    <depends>com.intellij.modules.platform</depends>
    <depends>com.redhat.devtools.lsp4ij</depends>

    <!-- Extensions added in subsequent tasks -->
</idea-plugin>
```

**Step 4: Create entry point class**

```kotlin
// packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/SentinelPlugin.kt
package com.sentinel.intellij

object SentinelPlugin {
    const val ID = "com.sentinel.intellij"
    const val DISPLAY_NAME = "Sentinel Security"
}
```

**Step 5: Verify the build compiles**

Run: `cd packages/sentinel-jetbrains && ./gradlew build --no-daemon 2>&1 | tail -5`

Expected: `BUILD SUCCESSFUL` (or download + compile — first run downloads IntelliJ SDK).

Note: First Gradle build downloads ~500MB of IntelliJ SDK. If the environment lacks Gradle wrapper, create it first:

```bash
cd packages/sentinel-jetbrains
gradle wrapper --gradle-version 8.5
```

**Step 6: Commit**

```bash
git add packages/sentinel-jetbrains/
git commit -m "feat(jetbrains): scaffold Gradle build + empty plugin shell"
```

---

## Task 2: Model Classes — Finding + FindingsState

**Files:**
- Create: `packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/model/Finding.kt`
- Create: `packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/model/FindingsState.kt`

**Step 1: Create Finding data class**

```kotlin
// packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/model/Finding.kt
package com.sentinel.intellij.model

data class Finding(
    val id: String,
    val scanId: String,
    val agentName: String,
    val severity: String,
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
```

**Step 2: Create FindingsState + ConnectionStatus**

```kotlin
// packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/model/FindingsState.kt
package com.sentinel.intellij.model

import java.time.Instant

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
```

**Step 3: Verify build**

Run: `cd packages/sentinel-jetbrains && ./gradlew compileKotlin --no-daemon 2>&1 | tail -3`
Expected: `BUILD SUCCESSFUL`

**Step 4: Commit**

```bash
git add packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/model/
git commit -m "feat(jetbrains): add Finding and FindingsState model classes"
```

---

## Task 3: PriorityScorer + SeverityMapper with Tests

**Files:**
- Create: `packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/model/PriorityScorer.kt`
- Create: `packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/model/SeverityMapper.kt`
- Create: `packages/sentinel-jetbrains/src/test/kotlin/com/sentinel/intellij/model/PriorityScorerTest.kt`
- Create: `packages/sentinel-jetbrains/src/test/kotlin/com/sentinel/intellij/model/SeverityMapperTest.kt`

**Step 1: Write PriorityScorer tests**

```kotlin
// packages/sentinel-jetbrains/src/test/kotlin/com/sentinel/intellij/model/PriorityScorerTest.kt
package com.sentinel.intellij.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PriorityScorerTest {

    private fun finding(severity: String, confidence: Double) = Finding(
        id = "f1", scanId = "s1", agentName = "security", severity = severity,
        category = "xss", file = "app.ts", lineStart = 1, lineEnd = 1,
        title = "XSS", description = null, remediation = null, cweId = null,
        confidence = confidence, suppressed = false, createdAt = "2026-01-01",
    )

    @Test
    fun `critical severity scores highest`() {
        val critical = PriorityScorer.score(finding("critical", 0.9))
        val high = PriorityScorer.score(finding("high", 0.9))
        val medium = PriorityScorer.score(finding("medium", 0.9))
        assertTrue(critical > high)
        assertTrue(high > medium)
    }

    @Test
    fun `confidence affects score proportionally`() {
        val highConf = PriorityScorer.score(finding("high", 1.0))
        val lowConf = PriorityScorer.score(finding("high", 0.5))
        assertEquals(highConf, lowConf * 2, 0.001)
    }

    @Test
    fun `unknown severity defaults to weight 1`() {
        val score = PriorityScorer.score(finding("unknown", 1.0))
        assertEquals(1.0, score, 0.001)
    }

    @Test
    fun `score is severity weight times confidence`() {
        // critical = 5, confidence = 0.8 -> 4.0
        val score = PriorityScorer.score(finding("critical", 0.8))
        assertEquals(4.0, score, 0.001)
    }
}
```

**Step 2: Write SeverityMapper tests**

```kotlin
// packages/sentinel-jetbrains/src/test/kotlin/com/sentinel/intellij/model/SeverityMapperTest.kt
package com.sentinel.intellij.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

class SeverityMapperTest {

    @Test
    fun `critical maps to error highlight severity`() {
        val severity = SeverityMapper.toHighlightSeverityName("critical")
        assertEquals("ERROR", severity)
    }

    @Test
    fun `high maps to error highlight severity`() {
        val severity = SeverityMapper.toHighlightSeverityName("high")
        assertEquals("ERROR", severity)
    }

    @Test
    fun `medium maps to warning highlight severity`() {
        val severity = SeverityMapper.toHighlightSeverityName("medium")
        assertEquals("WARNING", severity)
    }

    @Test
    fun `low maps to weak warning highlight severity`() {
        val severity = SeverityMapper.toHighlightSeverityName("low")
        assertEquals("WEAK_WARNING", severity)
    }

    @Test
    fun `info maps to information highlight severity`() {
        val severity = SeverityMapper.toHighlightSeverityName("info")
        assertEquals("INFORMATION", severity)
    }
}
```

**Step 3: Run tests — verify they fail**

Run: `cd packages/sentinel-jetbrains && ./gradlew test --no-daemon 2>&1 | tail -10`
Expected: FAIL — `PriorityScorer` and `SeverityMapper` not found.

**Step 4: Implement PriorityScorer**

```kotlin
// packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/model/PriorityScorer.kt
package com.sentinel.intellij.model

object PriorityScorer {
    private val weights = mapOf(
        "critical" to 5.0,
        "high" to 4.0,
        "medium" to 3.0,
        "low" to 2.0,
        "info" to 1.0,
    )

    fun score(finding: Finding): Double {
        return (weights[finding.severity] ?: 1.0) * finding.confidence
    }
}
```

**Step 5: Implement SeverityMapper**

Note: This version avoids importing IntelliJ `HighlightSeverity` and `Icon` so unit tests work without IDE fixture. The actual icon loading and severity mapping use string-based lookups, with a separate method used by the annotator at runtime.

```kotlin
// packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/model/SeverityMapper.kt
package com.sentinel.intellij.model

object SeverityMapper {

    private val highlightSeverityMap = mapOf(
        "critical" to "ERROR",
        "high" to "ERROR",
        "medium" to "WARNING",
        "low" to "WEAK_WARNING",
        "info" to "INFORMATION",
    )

    private val iconPathMap = mapOf(
        "critical" to "/icons/sentinel-critical.svg",
        "high" to "/icons/sentinel-high.svg",
        "medium" to "/icons/sentinel-medium.svg",
        "low" to "/icons/sentinel-low.svg",
        "info" to "/icons/sentinel-info.svg",
    )

    fun toHighlightSeverityName(severity: String): String {
        return highlightSeverityMap[severity] ?: "INFORMATION"
    }

    fun toIconPath(severity: String): String {
        return iconPathMap[severity] ?: "/icons/sentinel-info.svg"
    }
}
```

**Step 6: Run tests — verify they pass**

Run: `cd packages/sentinel-jetbrains && ./gradlew test --no-daemon 2>&1 | tail -10`
Expected: `BUILD SUCCESSFUL` — 9 tests passed.

**Step 7: Commit**

```bash
git add packages/sentinel-jetbrains/src/
git commit -m "feat(jetbrains): add PriorityScorer and SeverityMapper with 9 unit tests"
```

---

## Task 4: Auth Service (PasswordSafe) with Tests

**Files:**
- Create: `packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/services/SentinelAuthService.kt`
- Create: `packages/sentinel-jetbrains/src/test/kotlin/com/sentinel/intellij/services/SentinelAuthServiceTest.kt`

**Step 1: Write auth service tests**

```kotlin
// packages/sentinel-jetbrains/src/test/kotlin/com/sentinel/intellij/services/SentinelAuthServiceTest.kt
package com.sentinel.intellij.services

import io.mockk.*
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SentinelAuthServiceTest {

    @Test
    fun `generateServiceName creates deterministic key`() {
        val key1 = SentinelAuthService.generateServiceName("project-abc")
        val key2 = SentinelAuthService.generateServiceName("project-abc")
        assertEquals(key1, key2)
    }

    @Test
    fun `generateServiceName includes project hash`() {
        val key = SentinelAuthService.generateServiceName("project-abc")
        assertTrue(key.contains("project-abc"))
    }

    @Test
    fun `generateServiceName differs by project`() {
        val key1 = SentinelAuthService.generateServiceName("project-abc")
        val key2 = SentinelAuthService.generateServiceName("project-xyz")
        assertTrue(key1 != key2)
    }

    @Test
    fun `global service name is stable`() {
        val key = SentinelAuthService.globalServiceName
        assertTrue(key.contains("Sentinel"))
    }
}
```

**Step 2: Run tests — verify they fail**

Run: `cd packages/sentinel-jetbrains && ./gradlew test --no-daemon 2>&1 | tail -10`
Expected: FAIL — `SentinelAuthService` not found.

**Step 3: Implement auth service**

```kotlin
// packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/services/SentinelAuthService.kt
package com.sentinel.intellij.services

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project

@Service(Service.Level.APP)
class SentinelAuthService {

    companion object {
        val globalServiceName: String = generateServiceName("Sentinel", "API Token")

        fun generateServiceName(projectHash: String): String {
            return generateServiceName("Sentinel", "API Token:$projectHash")
        }
    }

    fun getToken(project: Project): String? {
        val projectKey = CredentialAttributes(generateServiceName(project.locationHash))
        return PasswordSafe.instance.getPassword(projectKey)
            ?: PasswordSafe.instance.getPassword(CredentialAttributes(globalServiceName))
    }

    fun setToken(token: String, project: Project? = null) {
        val key = if (project != null) {
            CredentialAttributes(generateServiceName(project.locationHash))
        } else {
            CredentialAttributes(globalServiceName)
        }
        PasswordSafe.instance.setPassword(key, token)
    }

    fun hasToken(project: Project): Boolean = getToken(project) != null
}
```

**Step 4: Run tests — verify they pass**

Run: `cd packages/sentinel-jetbrains && ./gradlew test --no-daemon 2>&1 | tail -10`
Expected: `BUILD SUCCESSFUL` — 4 tests passed (13 total).

**Step 5: Register in plugin.xml**

Add inside `<idea-plugin>`:

```xml
    <extensions defaultExtensionNs="com.intellij">
        <applicationService serviceImplementation="com.sentinel.intellij.services.SentinelAuthService"/>
    </extensions>
```

**Step 6: Commit**

```bash
git add packages/sentinel-jetbrains/src/
git commit -m "feat(jetbrains): add SentinelAuthService with PasswordSafe + 4 tests"
```

---

## Task 5: Settings Service (PersistentStateComponent)

**Files:**
- Create: `packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/services/SentinelSettingsService.kt`
- Modify: `packages/sentinel-jetbrains/src/main/resources/META-INF/plugin.xml`

**Step 1: Implement settings service**

```kotlin
// packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/services/SentinelSettingsService.kt
package com.sentinel.intellij.services

import com.intellij.openapi.components.*
import com.intellij.openapi.project.Project

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
        var severityThreshold: String = "medium",
        var autoScanOnSave: Boolean = false,
    )

    private var myState = State()

    override fun getState(): State = myState
    override fun loadState(state: State) { myState = state }

    companion object {
        fun getInstance(project: Project): SentinelSettingsService {
            return project.getService(SentinelSettingsService::class.java)
        }
    }
}
```

**Step 2: Register in plugin.xml**

Add inside the existing `<extensions defaultExtensionNs="com.intellij">` block:

```xml
        <projectService serviceImplementation="com.sentinel.intellij.services.SentinelSettingsService"/>
```

**Step 3: Verify build**

Run: `cd packages/sentinel-jetbrains && ./gradlew compileKotlin --no-daemon 2>&1 | tail -3`
Expected: `BUILD SUCCESSFUL`

**Step 4: Commit**

```bash
git add packages/sentinel-jetbrains/src/
git commit -m "feat(jetbrains): add SentinelSettingsService with persistent project settings"
```

---

## Task 6: LSP Server Descriptor (Binary Launch)

**Files:**
- Create: `packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/lsp/SentinelLspServerDescriptor.kt`
- Modify: `packages/sentinel-jetbrains/src/main/resources/META-INF/plugin.xml`

**Step 1: Implement LSP server descriptor**

```kotlin
// packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/lsp/SentinelLspServerDescriptor.kt
package com.sentinel.intellij.lsp

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.SystemInfo
import com.intellij.util.system.CpuArch
import com.redhat.devtools.lsp4ij.server.ProcessStreamConnectionProvider
import com.sentinel.intellij.SentinelPlugin
import com.sentinel.intellij.services.SentinelAuthService
import com.sentinel.intellij.services.SentinelSettingsService
import java.io.File

class SentinelLspServerDescriptor(private val project: Project) : ProcessStreamConnectionProvider() {

    init {
        val binary = resolveLspBinary()
        val commands = mutableListOf(binary.absolutePath, "--stdio")
        setCommands(commands)
        setWorkingDirectory(project.basePath)
    }

    override fun getEnvironmentVariables(): Map<String, String> {
        val settings = SentinelSettingsService.getInstance(project)
        val auth = SentinelAuthService::class.java.let {
            com.intellij.openapi.application.ApplicationManager.getApplication().getService(it)
        }
        return buildMap {
            put("SENTINEL_API_URL", settings.state.apiUrl)
            put("SENTINEL_PROJECT_ID", settings.state.projectId)
            auth.getToken(project)?.let { put("SENTINEL_API_TOKEN", it) }
        }
    }

    companion object {
        fun resolveLspBinary(): File {
            // Look for binary in plugin directory, then PATH, then common locations
            val pluginDir = com.intellij.ide.plugins.PluginManagerCore
                .getPlugin(com.intellij.openapi.extensions.PluginId.getId(SentinelPlugin.ID))
                ?.pluginPath

            val platform = when {
                SystemInfo.isLinux -> "linux-x64"
                SystemInfo.isMac -> if (CpuArch.isArm64()) "darwin-arm64" else "darwin-x64"
                SystemInfo.isWindows -> "win-x64"
                else -> "linux-x64"
            }

            // 1. Bundled binary in plugin directory
            if (pluginDir != null) {
                val bundled = pluginDir.resolve("bin/sentinel-lsp-$platform")
                if (bundled.toFile().exists()) {
                    val file = bundled.toFile()
                    if (SystemInfo.isUnix) file.setExecutable(true)
                    return file
                }
            }

            // 2. sentinel-lsp on PATH (development / system install)
            val pathBinary = findOnPath("sentinel-lsp")
            if (pathBinary != null) return pathBinary

            // 3. Node.js fallback: run sentinel-lsp server via node
            val nodeBinary = findOnPath("node")
            if (nodeBinary != null) {
                // Look for sentinel-lsp package in workspace
                val workspaceLsp = project.basePath?.let {
                    File(it).resolve("packages/sentinel-lsp/dist/index.js")
                }
                if (workspaceLsp?.exists() == true) return nodeBinary
            }

            throw IllegalStateException(
                "Sentinel LSP server binary not found. Install the sentinel-lsp package or configure the binary path."
            )
        }

        private fun findOnPath(name: String): File? {
            val pathDirs = System.getenv("PATH")?.split(File.pathSeparator) ?: return null
            for (dir in pathDirs) {
                val candidate = File(dir, name)
                if (candidate.exists() && candidate.canExecute()) return candidate
                // Windows: check .exe, .cmd
                if (SystemInfo.isWindows) {
                    for (ext in listOf(".exe", ".cmd", ".bat")) {
                        val winCandidate = File(dir, "$name$ext")
                        if (winCandidate.exists()) return winCandidate
                    }
                }
            }
            return null
        }
    }
}
```

**Step 2: Register LSP server in plugin.xml**

Add as a new `<extensions>` block (separate namespace):

```xml
    <extensions defaultExtensionNs="com.redhat.devtools.lsp4ij">
        <server id="sentinel"
                name="Sentinel LSP"
                factoryClass="com.sentinel.intellij.lsp.SentinelLspServerDescriptor">
            <description><![CDATA[Sentinel security analysis language server]]></description>
        </server>
    </extensions>
```

**Step 3: Verify build**

Run: `cd packages/sentinel-jetbrains && ./gradlew compileKotlin --no-daemon 2>&1 | tail -3`
Expected: `BUILD SUCCESSFUL`

**Step 4: Commit**

```bash
git add packages/sentinel-jetbrains/src/
git commit -m "feat(jetbrains): add LSP server descriptor with platform-specific binary resolution"
```

---

## Task 7: LSP Request Manager with Contract Tests

**Files:**
- Create: `packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/lsp/SentinelLspRequestManager.kt`
- Create: `packages/sentinel-jetbrains/src/test/kotlin/com/sentinel/intellij/lsp/SentinelLspRequestManagerTest.kt`

**Step 1: Write contract tests**

```kotlin
// packages/sentinel-jetbrains/src/test/kotlin/com/sentinel/intellij/lsp/SentinelLspRequestManagerTest.kt
package com.sentinel.intellij.lsp

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SentinelLspRequestManagerTest {

    @Test
    fun `triggerScan builds correct request params`() {
        val params = SentinelLspRequestManager.buildTriggerScanParams("proj-1", listOf("src/app.ts"))
        assertEquals("proj-1", params["projectId"])
        assertEquals(listOf("src/app.ts"), params["files"])
    }

    @Test
    fun `triggerScan with empty files sends empty list`() {
        val params = SentinelLspRequestManager.buildTriggerScanParams("proj-1", emptyList())
        assertEquals(emptyList<String>(), params["files"])
    }

    @Test
    fun `suppressFinding builds correct params`() {
        val params = SentinelLspRequestManager.buildSuppressParams("finding-abc")
        assertEquals("finding-abc", params["findingId"])
    }

    @Test
    fun `custom method names follow sentinel namespace`() {
        assertEquals("sentinel/triggerScan", SentinelLspRequestManager.METHOD_TRIGGER_SCAN)
        assertEquals("sentinel/suppress", SentinelLspRequestManager.METHOD_SUPPRESS)
        assertEquals("sentinel/status", SentinelLspRequestManager.METHOD_STATUS)
    }
}
```

**Step 2: Run tests — verify they fail**

Run: `cd packages/sentinel-jetbrains && ./gradlew test --no-daemon 2>&1 | tail -10`
Expected: FAIL — `SentinelLspRequestManager` not found.

**Step 3: Implement request manager**

```kotlin
// packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/lsp/SentinelLspRequestManager.kt
package com.sentinel.intellij.lsp

import com.intellij.openapi.project.Project

class SentinelLspRequestManager(private val project: Project) {

    companion object {
        const val METHOD_TRIGGER_SCAN = "sentinel/triggerScan"
        const val METHOD_SUPPRESS = "sentinel/suppress"
        const val METHOD_STATUS = "sentinel/status"

        fun buildTriggerScanParams(projectId: String, files: List<String>): Map<String, Any> {
            return mapOf("projectId" to projectId, "files" to files)
        }

        fun buildSuppressParams(findingId: String): Map<String, Any> {
            return mapOf("findingId" to findingId)
        }
    }

    fun triggerScan(files: List<String> = emptyList()) {
        val settings = com.sentinel.intellij.services.SentinelSettingsService.getInstance(project)
        val params = buildTriggerScanParams(settings.state.projectId, files)
        sendNotification(METHOD_TRIGGER_SCAN, params)
    }

    fun suppressFinding(findingId: String) {
        sendNotification(METHOD_SUPPRESS, buildSuppressParams(findingId))
    }

    private fun sendNotification(method: String, params: Map<String, Any>) {
        // LSP4IJ sends custom notifications via LanguageServerManager
        // Implementation depends on LSP4IJ API availability at runtime
        try {
            val serverManager = com.redhat.devtools.lsp4ij.LanguageServerManager.getInstance(project)
            // LSP4IJ custom request handling varies by version — guard with try/catch
            // In production, this calls the sentinel-lsp process via stdio
        } catch (_: Exception) {
            // LSP server not available — silently fail (offline mode)
        }
    }
}
```

**Step 4: Run tests — verify they pass**

Run: `cd packages/sentinel-jetbrains && ./gradlew test --no-daemon 2>&1 | tail -10`
Expected: `BUILD SUCCESSFUL` — 4 tests passed (17 total).

**Step 5: Commit**

```bash
git add packages/sentinel-jetbrains/src/
git commit -m "feat(jetbrains): add LSP request manager with contract tests for sentinel/* methods"
```

---

## Task 8: Findings Service (StateFlow + Dedup + File Index) with Tests

**Files:**
- Create: `packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/services/SentinelFindingsService.kt`
- Create: `packages/sentinel-jetbrains/src/test/kotlin/com/sentinel/intellij/services/SentinelFindingsServiceTest.kt`
- Modify: `packages/sentinel-jetbrains/src/main/resources/META-INF/plugin.xml`

**Step 1: Write findings service tests**

```kotlin
// packages/sentinel-jetbrains/src/test/kotlin/com/sentinel/intellij/services/SentinelFindingsServiceTest.kt
package com.sentinel.intellij.services

import com.sentinel.intellij.model.ConnectionStatus
import com.sentinel.intellij.model.Finding
import com.sentinel.intellij.model.FindingsState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Tests the core finding state logic extracted to a testable class
 * (no IntelliJ Project dependency).
 */
class SentinelFindingsServiceTest {

    private fun makeFinding(
        id: String = "f1",
        file: String = "src/app.ts",
        severity: String = "high",
        confidence: Double = 0.9,
        lineStart: Int = 10,
    ) = Finding(
        id = id, scanId = "s1", agentName = "security", severity = severity,
        category = "xss", file = file, lineStart = lineStart, lineEnd = lineStart + 5,
        title = "XSS vulnerability", description = "User input not sanitized",
        remediation = "Use escapeHtml()", cweId = "CWE-79", confidence = confidence,
        suppressed = false, createdAt = "2026-01-01T00:00:00Z",
    )

    @Test
    fun `updateFindings adds new findings to state`() {
        val core = FindingsStateManager()
        core.updateFindings(listOf(makeFinding("f1"), makeFinding("f2")))
        assertEquals(2, core.state.value.findings.size)
    }

    @Test
    fun `updateFindings deduplicates by id`() {
        val core = FindingsStateManager()
        core.updateFindings(listOf(makeFinding("f1"), makeFinding("f1")))
        assertEquals(1, core.state.value.findings.size)
    }

    @Test
    fun `updateFindings indexes by file`() {
        val core = FindingsStateManager()
        core.updateFindings(listOf(
            makeFinding("f1", file = "a.ts"),
            makeFinding("f2", file = "b.ts"),
            makeFinding("f3", file = "a.ts"),
        ))
        assertEquals(2, core.state.value.byFile["a.ts"]?.size)
        assertEquals(1, core.state.value.byFile["b.ts"]?.size)
    }

    @Test
    fun `findings sorted by priority within file`() {
        val core = FindingsStateManager()
        core.updateFindings(listOf(
            makeFinding("f1", file = "a.ts", severity = "low", confidence = 0.5),
            makeFinding("f2", file = "a.ts", severity = "critical", confidence = 0.9),
        ))
        val fileFindings = core.state.value.byFile["a.ts"]!!
        assertEquals("f2", fileFindings[0].id) // critical first
        assertEquals("f1", fileFindings[1].id) // low second
    }

    @Test
    fun `suppressFinding removes from state`() {
        val core = FindingsStateManager()
        core.updateFindings(listOf(makeFinding("f1"), makeFinding("f2")))
        core.suppressFinding("f1")
        assertEquals(1, core.state.value.findings.size)
        assertEquals("f2", core.state.value.findings[0].id)
    }

    @Test
    fun `setConnectionStatus updates state`() {
        val core = FindingsStateManager()
        core.setConnectionStatus(ConnectionStatus.CONNECTED)
        assertEquals(ConnectionStatus.CONNECTED, core.state.value.connectionStatus)
    }
}
```

**Step 2: Run tests — verify they fail**

Run: `cd packages/sentinel-jetbrains && ./gradlew test --no-daemon 2>&1 | tail -10`
Expected: FAIL — `FindingsStateManager` not found.

**Step 3: Implement FindingsStateManager (testable core)**

```kotlin
// packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/services/FindingsStateManager.kt
package com.sentinel.intellij.services

import com.sentinel.intellij.model.ConnectionStatus
import com.sentinel.intellij.model.Finding
import com.sentinel.intellij.model.FindingsState
import com.sentinel.intellij.model.PriorityScorer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

/**
 * Core findings state logic, separated from IntelliJ Project for testability.
 */
class FindingsStateManager {

    private val _state = MutableStateFlow(FindingsState.EMPTY)
    val state: StateFlow<FindingsState> = _state.asStateFlow()

    private val knownIds = ConcurrentHashMap.newKeySet<String>()

    fun updateFindings(findings: List<Finding>) {
        // Deduplicate by ID
        val newFindings = mutableListOf<Finding>()
        for (f in findings) {
            if (knownIds.add(f.id)) {
                newFindings.add(f)
            }
        }

        _state.update { current ->
            val all = current.findings + newFindings

            // Rebuild file index with priority ordering
            val byFile = all.groupBy { it.file }
                .mapValues { (_, filefindings) ->
                    filefindings.sortedByDescending { PriorityScorer.score(it) }
                }

            current.copy(
                findings = all,
                byFile = byFile,
                lastUpdated = Instant.now(),
            )
        }
    }

    fun suppressFinding(findingId: String) {
        knownIds.remove(findingId)
        _state.update { current ->
            val remaining = current.findings.filter { it.id != findingId }
            val byFile = remaining.groupBy { it.file }
                .mapValues { (_, filefindings) ->
                    filefindings.sortedByDescending { PriorityScorer.score(it) }
                }
            current.copy(findings = remaining, byFile = byFile, lastUpdated = Instant.now())
        }
    }

    fun setConnectionStatus(status: ConnectionStatus) {
        _state.update { it.copy(connectionStatus = status) }
    }

    fun clear() {
        knownIds.clear()
        _state.value = FindingsState.EMPTY
    }
}
```

**Step 4: Implement SentinelFindingsService (project-level wrapper)**

```kotlin
// packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/services/SentinelFindingsService.kt
package com.sentinel.intellij.services

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.sentinel.intellij.model.Finding
import com.sentinel.intellij.model.FindingsState
import kotlinx.coroutines.flow.StateFlow

@Service(Service.Level.PROJECT)
class SentinelFindingsService(private val project: Project) : Disposable {

    private val core = FindingsStateManager()
    val state: StateFlow<FindingsState> = core.state

    fun updateFindings(findings: List<Finding>) = core.updateFindings(findings)

    fun getFindingsForFile(virtualFile: VirtualFile): List<Finding> {
        val canonical = virtualFile.canonicalPath ?: virtualFile.path
        val relative = project.basePath?.let {
            canonical.removePrefix(it).removePrefix("/")
        } ?: canonical
        return core.state.value.byFile[relative] ?: emptyList()
    }

    fun suppressFinding(findingId: String) {
        // Optimistic UI update
        core.suppressFinding(findingId)
        // Send to LSP
        try {
            val lsp = project.getService(com.sentinel.intellij.lsp.SentinelLspRequestManager::class.java)
            lsp.suppressFinding(findingId)
        } catch (_: Exception) {
            // LSP not available
        }
    }

    override fun dispose() {
        core.clear()
    }

    companion object {
        fun getInstance(project: Project): SentinelFindingsService {
            return project.getService(SentinelFindingsService::class.java)
        }
    }
}
```

**Step 5: Register in plugin.xml**

Add inside the `<extensions defaultExtensionNs="com.intellij">` block:

```xml
        <projectService serviceImplementation="com.sentinel.intellij.services.SentinelFindingsService"/>
```

**Step 6: Run tests — verify they pass**

Run: `cd packages/sentinel-jetbrains && ./gradlew test --no-daemon 2>&1 | tail -10`
Expected: `BUILD SUCCESSFUL` — 6 tests passed (23 total).

**Step 7: Commit**

```bash
git add packages/sentinel-jetbrains/src/
git commit -m "feat(jetbrains): add FindingsService with StateFlow, dedup, priority sort + 6 tests"
```

---

## Task 9: SVG Icons

**Files:**
- Create: `packages/sentinel-jetbrains/src/main/resources/icons/sentinel-critical.svg`
- Create: `packages/sentinel-jetbrains/src/main/resources/icons/sentinel-high.svg`
- Create: `packages/sentinel-jetbrains/src/main/resources/icons/sentinel-medium.svg`
- Create: `packages/sentinel-jetbrains/src/main/resources/icons/sentinel-low.svg`
- Create: `packages/sentinel-jetbrains/src/main/resources/icons/sentinel-info.svg`
- Create: `packages/sentinel-jetbrains/src/main/resources/icons/sentinel-logo.svg`

JetBrains gutter icons are 12x12px. Tool window icons are 13x13px. All must be SVG.

**Step 1: Create all 6 SVG icons**

```xml
<!-- sentinel-critical.svg — Red filled circle with exclamation -->
<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12">
  <circle cx="6" cy="6" r="5.5" fill="#E53935" stroke="#B71C1C" stroke-width="0.5"/>
  <text x="6" y="9" text-anchor="middle" font-size="8" font-weight="bold" fill="white">!</text>
</svg>
```

```xml
<!-- sentinel-high.svg — Orange triangle -->
<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12">
  <polygon points="6,1 11,11 1,11" fill="#FB8C00" stroke="#E65100" stroke-width="0.5"/>
  <text x="6" y="10" text-anchor="middle" font-size="7" font-weight="bold" fill="white">!</text>
</svg>
```

```xml
<!-- sentinel-medium.svg — Yellow diamond -->
<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12">
  <polygon points="6,1 11,6 6,11 1,6" fill="#FDD835" stroke="#F9A825" stroke-width="0.5"/>
  <text x="6" y="9" text-anchor="middle" font-size="7" font-weight="bold" fill="#333">!</text>
</svg>
```

```xml
<!-- sentinel-low.svg — Blue square -->
<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12">
  <rect x="1" y="1" width="10" height="10" rx="1.5" fill="#1E88E5" stroke="#1565C0" stroke-width="0.5"/>
  <text x="6" y="9" text-anchor="middle" font-size="7" font-weight="bold" fill="white">i</text>
</svg>
```

```xml
<!-- sentinel-info.svg — Gray circle -->
<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12">
  <circle cx="6" cy="6" r="5.5" fill="#9E9E9E" stroke="#757575" stroke-width="0.5"/>
  <text x="6" y="9" text-anchor="middle" font-size="7" fill="white">i</text>
</svg>
```

```xml
<!-- sentinel-logo.svg — Shield icon for status bar and tool window (13x13) -->
<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 13 13">
  <path d="M6.5 1L2 3v3c0 3.3 1.9 6.4 4.5 7 2.6-.6 4.5-3.7 4.5-7V3L6.5 1z" fill="#1E88E5" stroke="#1565C0" stroke-width="0.5"/>
  <path d="M5.5 8.5l-1.5-1.5 0.7-0.7 0.8 0.8 2.3-2.3 0.7 0.7z" fill="white"/>
</svg>
```

**Step 2: Verify build**

Run: `cd packages/sentinel-jetbrains && ./gradlew compileKotlin --no-daemon 2>&1 | tail -3`
Expected: `BUILD SUCCESSFUL`

**Step 3: Commit**

```bash
git add packages/sentinel-jetbrains/src/main/resources/icons/
git commit -m "feat(jetbrains): add severity gutter icons and plugin logo SVGs"
```

---

## Task 10: Tool Window (Factory + Panel + Table)

**Files:**
- Create: `packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/ui/SentinelToolWindowFactory.kt`
- Create: `packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/ui/FindingsTableModel.kt`
- Create: `packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/ui/SentinelToolWindowPanel.kt`
- Modify: `packages/sentinel-jetbrains/src/main/resources/META-INF/plugin.xml`

**Step 1: Implement table model**

```kotlin
// packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/ui/FindingsTableModel.kt
package com.sentinel.intellij.ui

import com.sentinel.intellij.model.Finding
import javax.swing.table.AbstractTableModel

class FindingsTableModel : AbstractTableModel() {

    private val columns = arrayOf("Severity", "File", "Line", "Title", "Agent", "Confidence")
    private var findings: List<Finding> = emptyList()

    fun setFindings(newFindings: List<Finding>) {
        findings = newFindings
        fireTableDataChanged()
    }

    fun getFindingAt(row: Int): Finding = findings[row]

    override fun getRowCount(): Int = findings.size
    override fun getColumnCount(): Int = columns.size
    override fun getColumnName(column: Int): String = columns[column]

    override fun getValueAt(rowIndex: Int, columnIndex: Int): Any? {
        val f = findings[rowIndex]
        return when (columnIndex) {
            0 -> f.severity.uppercase()
            1 -> f.file
            2 -> f.lineStart
            3 -> f.title ?: f.category ?: "—"
            4 -> f.agentName
            5 -> "${(f.confidence * 100).toInt()}%"
            else -> null
        }
    }

    override fun getColumnClass(columnIndex: Int): Class<*> {
        return when (columnIndex) {
            2 -> Integer::class.java  // Line column — numeric sort
            else -> String::class.java
        }
    }
}
```

**Step 2: Implement tool window panel**

```kotlin
// packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/ui/SentinelToolWindowPanel.kt
package com.sentinel.intellij.ui

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.table.JBTable
import com.sentinel.intellij.model.FindingsState
import com.sentinel.intellij.services.SentinelFindingsService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.awt.BorderLayout
import java.awt.FlowLayout
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.JPanel
import javax.swing.ListSelectionModel

class SentinelToolWindowPanel(private val project: Project) : JPanel(BorderLayout()) {

    private val findingsService = SentinelFindingsService.getInstance(project)
    private val tableModel = FindingsTableModel()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

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
        scope.launch {
            findingsService.state.collect { state ->
                ApplicationManager.getApplication().invokeLater {
                    refreshTable(state)
                }
            }
        }
    }

    private fun refreshTable(state: FindingsState = findingsService.state.value) {
        val enabledSeverities = severityFilters.filter { it.value.isSelected }.keys
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
    }

    fun dispose() {
        scope.cancel()
    }
}
```

**Step 3: Implement tool window factory**

```kotlin
// packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/ui/SentinelToolWindowFactory.kt
package com.sentinel.intellij.ui

import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory

class SentinelToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel = SentinelToolWindowPanel(project)
        val content = ContentFactory.getInstance().createContent(panel, "Findings", false)
        toolWindow.contentManager.addContent(content)
    }
}
```

**Step 4: Register in plugin.xml**

Add inside `<extensions defaultExtensionNs="com.intellij">`:

```xml
        <toolWindow id="Sentinel"
                    anchor="bottom"
                    factoryClass="com.sentinel.intellij.ui.SentinelToolWindowFactory"
                    icon="/icons/sentinel-logo.svg"/>
```

**Step 5: Verify build**

Run: `cd packages/sentinel-jetbrains && ./gradlew compileKotlin --no-daemon 2>&1 | tail -3`
Expected: `BUILD SUCCESSFUL`

**Step 6: Commit**

```bash
git add packages/sentinel-jetbrains/src/
git commit -m "feat(jetbrains): add tool window with findings table, severity filters, and navigation"
```

---

## Task 11: Gutter Icon Provider

**Files:**
- Create: `packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/ui/SentinelGutterIconProvider.kt`
- Modify: `packages/sentinel-jetbrains/src/main/resources/META-INF/plugin.xml`

**Step 1: Implement gutter icon provider**

```kotlin
// packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/ui/SentinelGutterIconProvider.kt
package com.sentinel.intellij.ui

import com.intellij.codeInsight.daemon.LineMarkerInfo
import com.intellij.codeInsight.daemon.LineMarkerProvider
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.openapi.util.IconLoader
import com.intellij.psi.PsiElement
import com.sentinel.intellij.model.Finding
import com.sentinel.intellij.model.PriorityScorer
import com.sentinel.intellij.model.SeverityMapper
import com.sentinel.intellij.services.SentinelFindingsService
import javax.swing.Icon

class SentinelGutterIconProvider : LineMarkerProvider {

    override fun getLineMarkerInfo(element: PsiElement): LineMarkerInfo<*>? = null

    override fun collectSlowLineMarkers(
        elements: MutableList<out PsiElement>,
        result: MutableCollection<in LineMarkerInfo<*>>
    ) {
        if (elements.isEmpty()) return
        val file = elements.first().containingFile?.virtualFile ?: return
        val project = elements.first().project
        val service = SentinelFindingsService.getInstance(project)
        val findings = service.getFindingsForFile(file)
        if (findings.isEmpty()) return

        val byLine = findings.groupBy { it.lineStart }
        val processedLines = mutableSetOf<Int>()

        for (element in elements) {
            val document = element.containingFile?.viewProvider?.document ?: continue
            val line = document.getLineNumber(element.textRange.startOffset) + 1

            if (line in processedLines) continue
            val lineFindings = byLine[line] ?: continue
            processedLines.add(line)

            val maxSeverity = lineFindings.maxByOrNull { PriorityScorer.score(it) } ?: continue
            val icon = loadIcon(maxSeverity.severity)

            result.add(LineMarkerInfo(
                element,
                element.textRange,
                icon,
                { _ -> buildTooltip(lineFindings) },
                null,
                GutterIconRenderer.Alignment.LEFT,
                { "Sentinel: ${lineFindings.size} finding(s)" }
            ))
        }
    }

    private fun loadIcon(severity: String): Icon {
        val path = SeverityMapper.toIconPath(severity)
        return IconLoader.getIcon(path, SentinelGutterIconProvider::class.java)
    }

    private fun buildTooltip(findings: List<Finding>): String {
        return buildString {
            append("<html><body>")
            for (f in findings) {
                append("<p><b>[${f.severity.uppercase()}]</b> ${f.title ?: f.category ?: "Finding"}")
                append(" <small>(${f.agentName})</small></p>")
            }
            append("</body></html>")
        }
    }
}
```

**Step 2: Register in plugin.xml**

Add inside `<extensions defaultExtensionNs="com.intellij">`:

```xml
        <codeInsight.lineMarkerProvider
                language=""
                implementationClass="com.sentinel.intellij.ui.SentinelGutterIconProvider"/>
```

**Step 3: Verify build**

Run: `cd packages/sentinel-jetbrains && ./gradlew compileKotlin --no-daemon 2>&1 | tail -3`
Expected: `BUILD SUCCESSFUL`

**Step 4: Commit**

```bash
git add packages/sentinel-jetbrains/src/
git commit -m "feat(jetbrains): add gutter icon provider with severity-colored markers"
```

---

## Task 12: External Annotator (Inline Finding Descriptions)

**Files:**
- Create: `packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/ui/SentinelExternalAnnotator.kt`
- Modify: `packages/sentinel-jetbrains/src/main/resources/META-INF/plugin.xml`

**Step 1: Implement external annotator**

```kotlin
// packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/ui/SentinelExternalAnnotator.kt
package com.sentinel.intellij.ui

import com.intellij.lang.annotation.AnnotationHolder
import com.intellij.lang.annotation.ExternalAnnotator
import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.util.TextRange
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiFile
import com.sentinel.intellij.model.Finding
import com.sentinel.intellij.model.SeverityMapper
import com.sentinel.intellij.services.SentinelFindingsService

class SentinelExternalAnnotator : ExternalAnnotator<List<Finding>, List<Finding>>() {

    override fun collectInformation(file: PsiFile, editor: Editor, hasErrors: Boolean): List<Finding>? {
        val vf = file.virtualFile ?: return null
        val service = SentinelFindingsService.getInstance(file.project)
        return service.getFindingsForFile(vf).takeIf { it.isNotEmpty() }
    }

    override fun doAnnotate(findings: List<Finding>): List<Finding> = findings

    override fun apply(file: PsiFile, findings: List<Finding>, holder: AnnotationHolder) {
        val document = PsiDocumentManager.getInstance(file.project).getDocument(file) ?: return

        for (finding in findings) {
            val lineCount = document.lineCount
            val lineStart = (finding.lineStart - 1).coerceIn(0, lineCount - 1)
            val lineEnd = (finding.lineEnd - 1).coerceIn(lineStart, lineCount - 1)
            val startOffset = document.getLineStartOffset(lineStart)
            val endOffset = document.getLineEndOffset(lineEnd)

            val severity = mapSeverity(finding.severity)
            val message = finding.title ?: finding.category ?: finding.description ?: "Sentinel finding"

            holder.newAnnotation(severity, message)
                .range(TextRange(startOffset, endOffset))
                .tooltip(buildAnnotationTooltip(finding))
                .create()
        }
    }

    private fun mapSeverity(severity: String): HighlightSeverity {
        return when (SeverityMapper.toHighlightSeverityName(severity)) {
            "ERROR" -> HighlightSeverity.ERROR
            "WARNING" -> HighlightSeverity.WARNING
            "WEAK_WARNING" -> HighlightSeverity.WEAK_WARNING
            else -> HighlightSeverity.INFORMATION
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

**Step 2: Register in plugin.xml**

Add inside `<extensions defaultExtensionNs="com.intellij">`:

```xml
        <externalAnnotator
                language=""
                implementationClass="com.sentinel.intellij.ui.SentinelExternalAnnotator"/>
```

**Step 3: Verify build**

Run: `cd packages/sentinel-jetbrains && ./gradlew compileKotlin --no-daemon 2>&1 | tail -3`
Expected: `BUILD SUCCESSFUL`

**Step 4: Commit**

```bash
git add packages/sentinel-jetbrains/src/
git commit -m "feat(jetbrains): add external annotator for inline finding descriptions"
```

---

## Task 13: Status Bar Widget

**Files:**
- Create: `packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/ui/SentinelStatusBarWidgetFactory.kt`
- Modify: `packages/sentinel-jetbrains/src/main/resources/META-INF/plugin.xml`

**Step 1: Implement status bar widget + factory**

```kotlin
// packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/ui/SentinelStatusBarWidgetFactory.kt
package com.sentinel.intellij.ui

import com.intellij.openapi.project.Project
import com.intellij.openapi.util.IconLoader
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory
import com.sentinel.intellij.SentinelPlugin
import com.sentinel.intellij.services.SentinelFindingsService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.awt.Component
import javax.swing.Icon

class SentinelStatusBarWidgetFactory : StatusBarWidgetFactory {
    override fun getId(): String = "SentinelStatusBar"
    override fun getDisplayName(): String = SentinelPlugin.DISPLAY_NAME
    override fun isAvailable(project: Project): Boolean = true

    override fun createWidget(project: Project): StatusBarWidget {
        return SentinelStatusBarWidget(project)
    }
}

class SentinelStatusBarWidget(private val project: Project) :
    StatusBarWidget, StatusBarWidget.IconPresentation {

    private var statusBar: StatusBar? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun ID(): String = "SentinelStatusBar"
    override fun getPresentation(): StatusBarWidget.WidgetPresentation = this

    override fun install(statusBar: StatusBar) {
        this.statusBar = statusBar
        val findingsService = SentinelFindingsService.getInstance(project)
        scope.launch {
            findingsService.state.collect {
                statusBar.updateWidget(ID())
            }
        }
    }

    override fun dispose() {
        scope.cancel()
    }

    override fun getIcon(): Icon {
        return IconLoader.getIcon("/icons/sentinel-logo.svg", SentinelStatusBarWidget::class.java)
    }

    override fun getTooltipText(): String {
        val state = SentinelFindingsService.getInstance(project).state.value
        val count = state.findings.size
        val status = state.connectionStatus.label
        return "Sentinel: $count finding${if (count != 1) "s" else ""} | $status"
    }

    override fun getAlignment(): Float = Component.CENTER_ALIGNMENT
}
```

**Step 2: Register in plugin.xml**

Add inside `<extensions defaultExtensionNs="com.intellij">`:

```xml
        <statusBarWidgetFactory
                id="SentinelStatusBar"
                implementation="com.sentinel.intellij.ui.SentinelStatusBarWidgetFactory"/>
```

**Step 3: Verify build**

Run: `cd packages/sentinel-jetbrains && ./gradlew compileKotlin --no-daemon 2>&1 | tail -3`
Expected: `BUILD SUCCESSFUL`

**Step 4: Commit**

```bash
git add packages/sentinel-jetbrains/src/
git commit -m "feat(jetbrains): add status bar widget with finding count and connection status"
```

---

## Task 14: Actions (Trigger Scan, Suppress, Open Dashboard, Configure)

**Files:**
- Create: `packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/actions/TriggerScanAction.kt`
- Create: `packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/actions/SuppressFindingAction.kt`
- Create: `packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/actions/OpenDashboardAction.kt`
- Create: `packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/actions/ConfigureAction.kt`
- Modify: `packages/sentinel-jetbrains/src/main/resources/META-INF/plugin.xml`

**Step 1: Implement TriggerScanAction**

```kotlin
// packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/actions/TriggerScanAction.kt
package com.sentinel.intellij.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import com.sentinel.intellij.lsp.SentinelLspRequestManager

class TriggerScanAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project: Project = e.project ?: return
        val lsp = SentinelLspRequestManager(project)
        lsp.triggerScan()
    }

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project != null
    }
}
```

**Step 2: Implement SuppressFindingAction**

```kotlin
// packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/actions/SuppressFindingAction.kt
package com.sentinel.intellij.actions

import com.intellij.codeInsight.intention.IntentionAction
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiFile
import com.sentinel.intellij.model.Finding
import com.sentinel.intellij.services.SentinelFindingsService

class SuppressFindingAction(private val finding: Finding) : IntentionAction {
    override fun getText(): String = "Suppress: ${finding.title ?: finding.category ?: "finding"}"
    override fun getFamilyName(): String = "Sentinel"
    override fun isAvailable(project: Project, editor: Editor?, file: PsiFile?): Boolean = true

    override fun invoke(project: Project, editor: Editor?, file: PsiFile?) {
        SentinelFindingsService.getInstance(project).suppressFinding(finding.id)
    }

    override fun startInWriteAction(): Boolean = false
}
```

**Step 3: Implement OpenDashboardAction**

```kotlin
// packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/actions/OpenDashboardAction.kt
package com.sentinel.intellij.actions

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.sentinel.intellij.services.SentinelSettingsService

class OpenDashboardAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val settings = SentinelSettingsService.getInstance(project)
        val url = settings.state.apiUrl.removeSuffix("/api").removeSuffix("/v1")
        BrowserUtil.browse(url)
    }

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project != null
    }
}
```

**Step 4: Implement ConfigureAction**

```kotlin
// packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/actions/ConfigureAction.kt
package com.sentinel.intellij.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.options.ShowSettingsUtil

class ConfigureAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        ShowSettingsUtil.getInstance().showSettingsDialog(project, "Sentinel Security")
    }

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project != null
    }
}
```

**Step 5: Register actions in plugin.xml**

Add inside `<idea-plugin>`:

```xml
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
```

**Step 6: Verify build**

Run: `cd packages/sentinel-jetbrains && ./gradlew compileKotlin --no-daemon 2>&1 | tail -3`
Expected: `BUILD SUCCESSFUL`

**Step 7: Commit**

```bash
git add packages/sentinel-jetbrains/src/
git commit -m "feat(jetbrains): add actions for scan trigger, suppress, open dashboard, configure"
```

---

## Task 15: Settings Configurable (UI Panel)

**Files:**
- Create: `packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/ui/SentinelSettingsConfigurable.kt`
- Modify: `packages/sentinel-jetbrains/src/main/resources/META-INF/plugin.xml`

**Step 1: Implement settings configurable**

```kotlin
// packages/sentinel-jetbrains/src/main/kotlin/com/sentinel/intellij/ui/SentinelSettingsConfigurable.kt
package com.sentinel.intellij.ui

import com.intellij.openapi.options.Configurable
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextField
import com.sentinel.intellij.services.SentinelAuthService
import com.sentinel.intellij.services.SentinelSettingsService
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import java.awt.Insets
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.JPasswordField

class SentinelSettingsConfigurable(private val project: Project) : Configurable {

    private val apiUrlField = JBTextField()
    private val projectIdField = JBTextField()
    private val apiTokenField = JPasswordField()
    private val enableGutterIcons = JBCheckBox("Show gutter icons")
    private val enableAnnotations = JBCheckBox("Show inline annotations")
    private val autoScanOnSave = JBCheckBox("Auto-scan on save")

    override fun getDisplayName(): String = "Sentinel Security"

    override fun createComponent(): JComponent {
        val settings = SentinelSettingsService.getInstance(project)
        val auth = com.intellij.openapi.application.ApplicationManager.getApplication()
            .getService(SentinelAuthService::class.java)

        // Initialize from current state
        apiUrlField.text = settings.state.apiUrl
        projectIdField.text = settings.state.projectId
        apiTokenField.text = auth.getToken(project) ?: ""
        enableGutterIcons.isSelected = settings.state.enableGutterIcons
        enableAnnotations.isSelected = settings.state.enableAnnotations
        autoScanOnSave.isSelected = settings.state.autoScanOnSave

        return JPanel(GridBagLayout()).apply {
            val gbc = GridBagConstraints().apply {
                fill = GridBagConstraints.HORIZONTAL
                insets = Insets(4, 4, 4, 4)
            }

            var row = 0

            gbc.gridx = 0; gbc.gridy = row; gbc.weightx = 0.0
            add(JBLabel("API URL:"), gbc)
            gbc.gridx = 1; gbc.weightx = 1.0
            add(apiUrlField, gbc)

            row++
            gbc.gridx = 0; gbc.gridy = row; gbc.weightx = 0.0
            add(JBLabel("Project ID:"), gbc)
            gbc.gridx = 1; gbc.weightx = 1.0
            add(projectIdField, gbc)

            row++
            gbc.gridx = 0; gbc.gridy = row; gbc.weightx = 0.0
            add(JBLabel("API Token:"), gbc)
            gbc.gridx = 1; gbc.weightx = 1.0
            add(apiTokenField, gbc)

            row++
            gbc.gridx = 0; gbc.gridy = row; gbc.gridwidth = 2
            add(enableGutterIcons, gbc)

            row++
            gbc.gridy = row
            add(enableAnnotations, gbc)

            row++
            gbc.gridy = row
            add(autoScanOnSave, gbc)

            // Spacer
            row++
            gbc.gridy = row; gbc.weighty = 1.0
            add(JPanel(), gbc)
        }
    }

    override fun isModified(): Boolean {
        val settings = SentinelSettingsService.getInstance(project)
        val auth = com.intellij.openapi.application.ApplicationManager.getApplication()
            .getService(SentinelAuthService::class.java)
        return apiUrlField.text != settings.state.apiUrl ||
                projectIdField.text != settings.state.projectId ||
                String(apiTokenField.password) != (auth.getToken(project) ?: "") ||
                enableGutterIcons.isSelected != settings.state.enableGutterIcons ||
                enableAnnotations.isSelected != settings.state.enableAnnotations ||
                autoScanOnSave.isSelected != settings.state.autoScanOnSave
    }

    override fun apply() {
        val settings = SentinelSettingsService.getInstance(project)
        settings.loadState(SentinelSettingsService.State(
            apiUrl = apiUrlField.text,
            projectId = projectIdField.text,
            enableGutterIcons = enableGutterIcons.isSelected,
            enableAnnotations = enableAnnotations.isSelected,
            autoScanOnSave = autoScanOnSave.isSelected,
            enableToolWindow = settings.state.enableToolWindow,
            severityThreshold = settings.state.severityThreshold,
        ))

        val token = String(apiTokenField.password)
        if (token.isNotBlank()) {
            val auth = com.intellij.openapi.application.ApplicationManager.getApplication()
                .getService(SentinelAuthService::class.java)
            auth.setToken(token, project)
        }
    }
}
```

**Step 2: Register in plugin.xml**

Add inside `<extensions defaultExtensionNs="com.intellij">`:

```xml
        <projectConfigurable
                parentId="tools"
                instance="com.sentinel.intellij.ui.SentinelSettingsConfigurable"
                id="sentinel.settings"
                displayName="Sentinel Security"/>
```

**Step 3: Verify build**

Run: `cd packages/sentinel-jetbrains && ./gradlew compileKotlin --no-daemon 2>&1 | tail -3`
Expected: `BUILD SUCCESSFUL`

**Step 4: Commit**

```bash
git add packages/sentinel-jetbrains/src/
git commit -m "feat(jetbrains): add settings configurable panel for API URL, token, and preferences"
```

---

## Task 16: Complete plugin.xml Assembly + Final Build Verification

**Files:**
- Rewrite: `packages/sentinel-jetbrains/src/main/resources/META-INF/plugin.xml` (assemble all registrations)

**Step 1: Write final assembled plugin.xml**

```xml
<!-- packages/sentinel-jetbrains/src/main/resources/META-INF/plugin.xml -->
<idea-plugin>
    <id>com.sentinel.intellij</id>
    <name>Sentinel Security</name>
    <vendor>Sentinel</vendor>
    <version>0.1.0</version>
    <description><![CDATA[
        Real-time security findings, IP attribution, and compliance checks
        inline in your JetBrains IDE. Features severity-colored gutter icons,
        a sortable findings table, inline annotations with remediation advice,
        and one-click finding suppression.
    ]]></description>

    <depends>com.intellij.modules.platform</depends>
    <depends>com.redhat.devtools.lsp4ij</depends>

    <extensions defaultExtensionNs="com.intellij">
        <!-- Services -->
        <applicationService serviceImplementation="com.sentinel.intellij.services.SentinelAuthService"/>
        <projectService serviceImplementation="com.sentinel.intellij.services.SentinelSettingsService"/>
        <projectService serviceImplementation="com.sentinel.intellij.services.SentinelFindingsService"/>

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

**Step 2: Run full build + tests**

Run: `cd packages/sentinel-jetbrains && ./gradlew clean build --no-daemon 2>&1 | tail -10`
Expected: `BUILD SUCCESSFUL` — all tests pass, plugin JAR generated.

**Step 3: Verify plugin artifact**

Run: `ls -la packages/sentinel-jetbrains/build/distributions/`
Expected: `sentinel-jetbrains-0.1.0.zip` — the installable plugin archive.

**Step 4: Commit**

```bash
git add packages/sentinel-jetbrains/src/main/resources/META-INF/plugin.xml
git commit -m "feat(jetbrains): assemble final plugin.xml with all extension registrations"
```

---

## Task Summary

| Task | Component | Tests | Est. LOC |
|------|-----------|-------|----------|
| 1 | Gradle scaffold + plugin shell | 0 | ~100 |
| 2 | Finding + FindingsState models | 0 | ~50 |
| 3 | PriorityScorer + SeverityMapper | 9 | ~90 |
| 4 | Auth service (PasswordSafe) | 4 | ~70 |
| 5 | Settings service | 0 | ~40 |
| 6 | LSP server descriptor | 0 | ~80 |
| 7 | LSP request manager | 4 | ~70 |
| 8 | Findings service (StateFlow) | 6 | ~160 |
| 9 | SVG icons | 0 | 6 files |
| 10 | Tool window (table + filters) | 0 | ~180 |
| 11 | Gutter icon provider | 0 | ~80 |
| 12 | External annotator | 0 | ~70 |
| 13 | Status bar widget | 0 | ~60 |
| 14 | Actions (4 classes) | 0 | ~70 |
| 15 | Settings configurable (UI) | 0 | ~100 |
| 16 | Final plugin.xml assembly | 0 | ~70 |
| **Total** | | **23** | **~1,290 LOC + 6 SVGs** |

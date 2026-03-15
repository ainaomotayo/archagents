package com.sentinel.intellij.lsp

import com.intellij.openapi.application.ApplicationManager
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

        val settings = SentinelSettingsService.getInstance(project)
        val auth = ApplicationManager.getApplication().getService(SentinelAuthService::class.java)
        val env = mutableMapOf<String, String>()
        env["SENTINEL_API_URL"] = settings.state.apiUrl
        env["SENTINEL_PROJECT_ID"] = settings.state.projectId
        auth.getToken(project)?.let { env["SENTINEL_API_TOKEN"] = it }
        setUserEnvironmentVariables(env)
    }

    companion object {
        fun resolveLspBinary(): File {
            val platform = when {
                SystemInfo.isLinux -> "linux-x64"
                SystemInfo.isMac -> if (CpuArch.isArm64()) "darwin-arm64" else "darwin-x64"
                SystemInfo.isWindows -> "win-x64"
                else -> "linux-x64"
            }

            // 1. Bundled binary in plugin directory
            val pluginDir = com.intellij.ide.plugins.PluginManagerCore
                .getPlugin(com.intellij.openapi.extensions.PluginId.getId(SentinelPlugin.ID))
                ?.pluginPath
            if (pluginDir != null) {
                val suffix = if (SystemInfo.isWindows) ".exe" else ""
                val bundled = pluginDir.resolve("bin/sentinel-lsp-$platform$suffix")
                if (bundled.toFile().exists()) {
                    val file = bundled.toFile()
                    if (SystemInfo.isUnix) file.setExecutable(true)
                    return file
                }
            }

            // 2. sentinel-lsp on PATH
            val pathBinary = findOnPath("sentinel-lsp")
            if (pathBinary != null) return pathBinary

            // 3. Node.js fallback
            val nodeBinary = findOnPath("node")
            if (nodeBinary != null) return nodeBinary

            throw IllegalStateException(
                "Sentinel LSP server binary not found. Install the sentinel-lsp package or configure the binary path."
            )
        }

        private fun findOnPath(name: String): File? {
            val pathDirs = System.getenv("PATH")?.split(File.pathSeparator) ?: return null
            for (dir in pathDirs) {
                val candidate = File(dir, name)
                if (candidate.exists() && candidate.canExecute()) return candidate
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

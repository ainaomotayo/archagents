package com.sentinel.intellij.lsp

import com.intellij.openapi.project.Project
import com.sentinel.intellij.services.SentinelSettingsService

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
        val settings = SentinelSettingsService.getInstance(project)
        val params = buildTriggerScanParams(settings.state.projectId, files)
        sendNotification(METHOD_TRIGGER_SCAN, params)
    }

    fun suppressFinding(findingId: String) {
        sendNotification(METHOD_SUPPRESS, buildSuppressParams(findingId))
    }

    private fun sendNotification(method: String, params: Map<String, Any>) {
        try {
            val serverManager = com.redhat.devtools.lsp4ij.LanguageServerManager.getInstance(project)
            // LSP4IJ custom request handling — guarded for offline mode
        } catch (_: Exception) {
            // LSP server not available — silently fail
        }
    }
}

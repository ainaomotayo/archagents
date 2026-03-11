package com.sentinel.intellij

import com.intellij.openapi.project.Project
import com.redhat.devtools.lsp4ij.server.ProcessStreamConnectionProvider
import com.redhat.devtools.lsp4ij.server.StreamConnectionProvider
import com.redhat.devtools.lsp4ij.LanguageServerFactory

class SentinelLspServerDescriptor : LanguageServerFactory {
    override fun createConnectionProvider(project: Project): StreamConnectionProvider {
        val nodePath = System.getenv("SENTINEL_NODE_PATH") ?: "node"
        val serverPath = System.getenv("SENTINEL_LSP_PATH")
            ?: findServerInProject(project)
            ?: throw IllegalStateException("Cannot find sentinel-lsp server. Set SENTINEL_LSP_PATH.")
        val env = mutableMapOf<String, String>()
        System.getenv("SENTINEL_API_URL")?.let { env["SENTINEL_API_URL"] = it }
        System.getenv("SENTINEL_API_TOKEN")?.let { env["SENTINEL_API_TOKEN"] = it }
        System.getenv("SENTINEL_ORG_ID")?.let { env["SENTINEL_ORG_ID"] = it }
        return ProcessStreamConnectionProvider(listOf(nodePath, serverPath, "--stdio"), project.basePath, env)
    }
    private fun findServerInProject(project: Project): String? {
        val basePath = project.basePath ?: return null
        val candidate = "$basePath/node_modules/@sentinel/sentinel-lsp/dist/index.js"
        return if (java.io.File(candidate).exists()) candidate else null
    }
}

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
        core.suppressFinding(findingId)
        try {
            val lsp = project.getService(com.sentinel.intellij.lsp.SentinelLspRequestManager::class.java)
            lsp.suppressFinding(findingId)
        } catch (_: Exception) {}
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

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

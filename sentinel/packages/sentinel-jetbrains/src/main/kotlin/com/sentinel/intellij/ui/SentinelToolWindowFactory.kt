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

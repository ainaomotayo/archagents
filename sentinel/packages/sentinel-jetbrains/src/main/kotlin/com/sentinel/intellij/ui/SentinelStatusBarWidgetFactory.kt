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

}

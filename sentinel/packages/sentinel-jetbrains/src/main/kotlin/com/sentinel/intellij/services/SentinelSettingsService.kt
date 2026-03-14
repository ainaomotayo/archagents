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

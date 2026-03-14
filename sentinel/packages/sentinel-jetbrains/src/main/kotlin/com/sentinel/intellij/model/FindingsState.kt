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

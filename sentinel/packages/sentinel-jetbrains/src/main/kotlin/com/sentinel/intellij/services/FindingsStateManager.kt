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

class FindingsStateManager {

    private val _state = MutableStateFlow(FindingsState.EMPTY)
    val state: StateFlow<FindingsState> = _state.asStateFlow()

    private val knownIds = ConcurrentHashMap.newKeySet<String>()

    fun updateFindings(findings: List<Finding>) {
        val newFindings = mutableListOf<Finding>()
        for (f in findings) {
            if (knownIds.add(f.id)) {
                newFindings.add(f)
            }
        }

        _state.update { current ->
            val all = current.findings + newFindings
            val byFile = all.groupBy { it.file }
                .mapValues { (_, filefindings) ->
                    filefindings.sortedByDescending { PriorityScorer.score(it) }
                }
            current.copy(findings = all, byFile = byFile, lastUpdated = Instant.now())
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

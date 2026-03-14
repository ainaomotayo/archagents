package com.sentinel.intellij.services

import com.sentinel.intellij.model.ConnectionStatus
import com.sentinel.intellij.model.Finding
import kotlin.test.Test
import kotlin.test.assertEquals

class SentinelFindingsServiceTest {

    private fun makeFinding(
        id: String = "f1",
        file: String = "src/app.ts",
        severity: String = "high",
        confidence: Double = 0.9,
        lineStart: Int = 10,
    ) = Finding(
        id = id, scanId = "s1", agentName = "security", severity = severity,
        category = "xss", file = file, lineStart = lineStart, lineEnd = lineStart + 5,
        title = "XSS vulnerability", description = "User input not sanitized",
        remediation = "Use escapeHtml()", cweId = "CWE-79", confidence = confidence,
        suppressed = false, createdAt = "2026-01-01T00:00:00Z",
    )

    @Test
    fun `updateFindings adds new findings to state`() {
        val core = FindingsStateManager()
        core.updateFindings(listOf(makeFinding("f1"), makeFinding("f2")))
        assertEquals(2, core.state.value.findings.size)
    }

    @Test
    fun `updateFindings deduplicates by id`() {
        val core = FindingsStateManager()
        core.updateFindings(listOf(makeFinding("f1"), makeFinding("f1")))
        assertEquals(1, core.state.value.findings.size)
    }

    @Test
    fun `updateFindings indexes by file`() {
        val core = FindingsStateManager()
        core.updateFindings(listOf(
            makeFinding("f1", file = "a.ts"),
            makeFinding("f2", file = "b.ts"),
            makeFinding("f3", file = "a.ts"),
        ))
        assertEquals(2, core.state.value.byFile["a.ts"]?.size)
        assertEquals(1, core.state.value.byFile["b.ts"]?.size)
    }

    @Test
    fun `findings sorted by priority within file`() {
        val core = FindingsStateManager()
        core.updateFindings(listOf(
            makeFinding("f1", file = "a.ts", severity = "low", confidence = 0.5),
            makeFinding("f2", file = "a.ts", severity = "critical", confidence = 0.9),
        ))
        val fileFindings = core.state.value.byFile["a.ts"]!!
        assertEquals("f2", fileFindings[0].id)
        assertEquals("f1", fileFindings[1].id)
    }

    @Test
    fun `suppressFinding removes from state`() {
        val core = FindingsStateManager()
        core.updateFindings(listOf(makeFinding("f1"), makeFinding("f2")))
        core.suppressFinding("f1")
        assertEquals(1, core.state.value.findings.size)
        assertEquals("f2", core.state.value.findings[0].id)
    }

    @Test
    fun `setConnectionStatus updates state`() {
        val core = FindingsStateManager()
        core.setConnectionStatus(ConnectionStatus.CONNECTED)
        assertEquals(ConnectionStatus.CONNECTED, core.state.value.connectionStatus)
    }
}

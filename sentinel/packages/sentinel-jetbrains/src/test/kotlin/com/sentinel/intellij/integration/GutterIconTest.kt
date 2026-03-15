package com.sentinel.intellij.integration

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.sentinel.intellij.model.Finding
import com.sentinel.intellij.services.FindingsStateManager
import com.sentinel.intellij.ui.FindingsTableModel

/**
 * Integration tests for the findings table model and gutter icon data flow.
 * Runs inside IntelliJ Platform test sandbox.
 */
class GutterIconTest : BasePlatformTestCase() {

    private fun makeFinding(
        id: String = "f1",
        file: String = "src/app.ts",
        severity: String = "high",
        lineStart: Int = 10,
    ) = Finding(
        id = id, scanId = "s1", agentName = "security", severity = severity,
        category = "xss", file = file, lineStart = lineStart, lineEnd = lineStart + 5,
        title = "XSS vulnerability", description = "User input not sanitized",
        remediation = "Use escapeHtml()", cweId = "CWE-79", confidence = 0.9,
        suppressed = false, createdAt = "2026-01-01T00:00:00Z",
    )

    fun testTableModelColumnsExist() {
        val model = FindingsTableModel()
        assertTrue("Should have at least 4 columns", model.columnCount >= 4)
    }

    fun testTableModelPopulatesFromFindings() {
        val model = FindingsTableModel()
        val findings = listOf(makeFinding("f1"), makeFinding("f2", severity = "critical"))
        model.setFindings(findings)
        assertEquals(2, model.rowCount)
    }

    fun testTableModelRetrievesFinding() {
        val model = FindingsTableModel()
        val findings = listOf(makeFinding("f1"), makeFinding("f2"))
        model.setFindings(findings)
        val retrieved = model.getFindingAt(0)
        assertEquals("f1", retrieved.id)
    }

    fun testFindingsStateManagerFileIndex() {
        val manager = FindingsStateManager()
        manager.updateFindings(listOf(
            makeFinding("f1", file = "src/main.kt", lineStart = 5),
            makeFinding("f2", file = "src/main.kt", lineStart = 10),
            makeFinding("f3", file = "src/util.kt", lineStart = 1),
        ))
        val state = manager.state.value
        assertEquals(2, state.byFile["src/main.kt"]?.size)
        assertEquals(1, state.byFile["src/util.kt"]?.size)
    }

    fun testFindingsStateManagerSuppression() {
        val manager = FindingsStateManager()
        manager.updateFindings(listOf(
            makeFinding("f1"),
            makeFinding("f2"),
            makeFinding("f3"),
        ))
        manager.suppressFinding("f2")
        assertEquals(2, manager.state.value.findings.size)
        assertNull(manager.state.value.findings.find { it.id == "f2" })
    }
}

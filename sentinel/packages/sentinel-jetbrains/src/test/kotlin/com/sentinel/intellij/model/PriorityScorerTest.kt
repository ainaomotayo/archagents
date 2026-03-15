package com.sentinel.intellij.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PriorityScorerTest {

    private fun finding(severity: String, confidence: Double) = Finding(
        id = "f1", scanId = "s1", agentName = "security", severity = severity,
        category = "xss", file = "app.ts", lineStart = 1, lineEnd = 1,
        title = "XSS", description = null, remediation = null, cweId = null,
        confidence = confidence, suppressed = false, createdAt = "2026-01-01",
    )

    @Test
    fun `critical severity scores highest`() {
        val critical = PriorityScorer.score(finding("critical", 0.9))
        val high = PriorityScorer.score(finding("high", 0.9))
        val medium = PriorityScorer.score(finding("medium", 0.9))
        assertTrue(critical > high)
        assertTrue(high > medium)
    }

    @Test
    fun `confidence affects score proportionally`() {
        val highConf = PriorityScorer.score(finding("high", 1.0))
        val lowConf = PriorityScorer.score(finding("high", 0.5))
        assertEquals(highConf, lowConf * 2, 0.001)
    }

    @Test
    fun `unknown severity defaults to weight 1`() {
        val score = PriorityScorer.score(finding("unknown", 1.0))
        assertEquals(1.0, score, 0.001)
    }

    @Test
    fun `score is severity weight times confidence`() {
        val score = PriorityScorer.score(finding("critical", 0.8))
        assertEquals(4.0, score, 0.001)
    }
}

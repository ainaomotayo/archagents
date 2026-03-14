package com.sentinel.intellij.model

object PriorityScorer {
    private val weights = mapOf(
        "critical" to 5.0,
        "high" to 4.0,
        "medium" to 3.0,
        "low" to 2.0,
        "info" to 1.0,
    )

    fun score(finding: Finding): Double {
        return (weights[finding.severity] ?: 1.0) * finding.confidence
    }
}

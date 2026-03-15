package com.sentinel.intellij.model

object SeverityMapper {

    private val highlightSeverityMap = mapOf(
        "critical" to "ERROR",
        "high" to "ERROR",
        "medium" to "WARNING",
        "low" to "WEAK_WARNING",
        "info" to "INFORMATION",
    )

    private val iconPathMap = mapOf(
        "critical" to "/icons/sentinel-critical.svg",
        "high" to "/icons/sentinel-high.svg",
        "medium" to "/icons/sentinel-medium.svg",
        "low" to "/icons/sentinel-low.svg",
        "info" to "/icons/sentinel-info.svg",
    )

    fun toHighlightSeverityName(severity: String): String {
        return highlightSeverityMap[severity] ?: "INFORMATION"
    }

    fun toIconPath(severity: String): String {
        return iconPathMap[severity] ?: "/icons/sentinel-info.svg"
    }
}

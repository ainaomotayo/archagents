package com.sentinel.intellij.model

data class Finding(
    val id: String,
    val scanId: String,
    val agentName: String,
    val severity: String,
    val category: String?,
    val file: String,
    val lineStart: Int,
    val lineEnd: Int,
    val title: String?,
    val description: String?,
    val remediation: String?,
    val cweId: String?,
    val confidence: Double,
    val suppressed: Boolean,
    val createdAt: String,
)

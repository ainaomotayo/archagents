package com.sentinel.intellij.ui

import com.intellij.lang.annotation.AnnotationHolder
import com.intellij.lang.annotation.ExternalAnnotator
import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.util.TextRange
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiFile
import com.sentinel.intellij.model.Finding
import com.sentinel.intellij.model.SeverityMapper
import com.sentinel.intellij.services.SentinelFindingsService

class SentinelExternalAnnotator : ExternalAnnotator<List<Finding>, List<Finding>>() {

    override fun collectInformation(file: PsiFile, editor: Editor, hasErrors: Boolean): List<Finding>? {
        val vf = file.virtualFile ?: return null
        val service = SentinelFindingsService.getInstance(file.project)
        return service.getFindingsForFile(vf).takeIf { it.isNotEmpty() }
    }

    override fun doAnnotate(findings: List<Finding>): List<Finding> = findings

    override fun apply(file: PsiFile, findings: List<Finding>, holder: AnnotationHolder) {
        val document = PsiDocumentManager.getInstance(file.project).getDocument(file) ?: return

        for (finding in findings) {
            val lineCount = document.lineCount
            val lineStart = (finding.lineStart - 1).coerceIn(0, lineCount - 1)
            val lineEnd = (finding.lineEnd - 1).coerceIn(lineStart, lineCount - 1)
            val startOffset = document.getLineStartOffset(lineStart)
            val endOffset = document.getLineEndOffset(lineEnd)

            val severity = mapSeverity(finding.severity)
            val message = finding.title ?: finding.category ?: finding.description ?: "Sentinel finding"

            holder.newAnnotation(severity, message)
                .range(TextRange(startOffset, endOffset))
                .tooltip(buildAnnotationTooltip(finding))
                .create()
        }
    }

    private fun mapSeverity(severity: String): HighlightSeverity {
        return when (SeverityMapper.toHighlightSeverityName(severity)) {
            "ERROR" -> HighlightSeverity.ERROR
            "WARNING" -> HighlightSeverity.WARNING
            "WEAK_WARNING" -> HighlightSeverity.WEAK_WARNING
            else -> HighlightSeverity.INFORMATION
        }
    }

    private fun buildAnnotationTooltip(finding: Finding): String {
        return buildString {
            append("<html><body>")
            append("<b>[${finding.severity.uppercase()}]</b> ${finding.title ?: finding.category}<br>")
            finding.description?.let { append("<p>$it</p>") }
            finding.remediation?.let { append("<p><i>Fix: $it</i></p>") }
            finding.cweId?.let { append("<p>CWE: $it</p>") }
            append("<p><small>${finding.agentName} | confidence: ${(finding.confidence * 100).toInt()}%</small></p>")
            append("</body></html>")
        }
    }
}

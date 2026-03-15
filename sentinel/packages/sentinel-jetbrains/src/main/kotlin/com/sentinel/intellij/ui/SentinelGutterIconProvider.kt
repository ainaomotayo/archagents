package com.sentinel.intellij.ui

import com.intellij.codeInsight.daemon.LineMarkerInfo
import com.intellij.codeInsight.daemon.LineMarkerProvider
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.openapi.util.IconLoader
import com.intellij.psi.PsiElement
import com.sentinel.intellij.model.Finding
import com.sentinel.intellij.model.PriorityScorer
import com.sentinel.intellij.model.SeverityMapper
import com.sentinel.intellij.services.SentinelFindingsService
import javax.swing.Icon

class SentinelGutterIconProvider : LineMarkerProvider {

    override fun getLineMarkerInfo(element: PsiElement): LineMarkerInfo<*>? = null

    override fun collectSlowLineMarkers(
        elements: MutableList<out PsiElement>,
        result: MutableCollection<in LineMarkerInfo<*>>
    ) {
        if (elements.isEmpty()) return
        val file = elements.first().containingFile?.virtualFile ?: return
        val project = elements.first().project
        val service = SentinelFindingsService.getInstance(project)
        val findings = service.getFindingsForFile(file)
        if (findings.isEmpty()) return

        val byLine = findings.groupBy { it.lineStart }
        val processedLines = mutableSetOf<Int>()

        for (element in elements) {
            val document = element.containingFile?.viewProvider?.document ?: continue
            val line = document.getLineNumber(element.textRange.startOffset) + 1

            if (line in processedLines) continue
            val lineFindings = byLine[line] ?: continue
            processedLines.add(line)

            val maxSeverity = lineFindings.maxByOrNull { PriorityScorer.score(it) } ?: continue
            val icon = loadIcon(maxSeverity.severity)

            result.add(LineMarkerInfo(
                element,
                element.textRange,
                icon,
                { _ -> buildTooltip(lineFindings) },
                null,
                GutterIconRenderer.Alignment.LEFT,
                { "Sentinel: ${lineFindings.size} finding(s)" }
            ))
        }
    }

    private fun loadIcon(severity: String): Icon {
        val path = SeverityMapper.toIconPath(severity)
        return IconLoader.getIcon(path, SentinelGutterIconProvider::class.java)
    }

    private fun buildTooltip(findings: List<Finding>): String {
        return buildString {
            append("<html><body>")
            for (f in findings) {
                append("<p><b>[${f.severity.uppercase()}]</b> ${f.title ?: f.category ?: "Finding"}")
                append(" <small>(${f.agentName})</small></p>")
            }
            append("</body></html>")
        }
    }
}

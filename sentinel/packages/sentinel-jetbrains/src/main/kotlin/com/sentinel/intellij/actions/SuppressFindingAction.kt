package com.sentinel.intellij.actions

import com.intellij.codeInsight.intention.IntentionAction
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiFile
import com.sentinel.intellij.model.Finding
import com.sentinel.intellij.services.SentinelFindingsService

class SuppressFindingAction(private val finding: Finding) : IntentionAction {
    override fun getText(): String = "Suppress: ${finding.title ?: finding.category ?: "finding"}"
    override fun getFamilyName(): String = "Sentinel"
    override fun isAvailable(project: Project, editor: Editor?, file: PsiFile?): Boolean = true

    override fun invoke(project: Project, editor: Editor?, file: PsiFile?) {
        SentinelFindingsService.getInstance(project).suppressFinding(finding.id)
    }

    override fun startInWriteAction(): Boolean = false
}

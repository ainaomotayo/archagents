package com.sentinel.intellij.ui

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.table.JBTable
import com.sentinel.intellij.model.FindingsState
import com.sentinel.intellij.services.SentinelFindingsService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.awt.BorderLayout
import java.awt.FlowLayout
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.JPanel
import javax.swing.ListSelectionModel

class SentinelToolWindowPanel(private val project: Project) : JPanel(BorderLayout()) {

    private val findingsService = SentinelFindingsService.getInstance(project)
    private val tableModel = FindingsTableModel()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val table = JBTable(tableModel).apply {
        setShowGrid(false)
        autoCreateRowSorter = true
        selectionModel.selectionMode = ListSelectionModel.SINGLE_SELECTION
        addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                if (e.clickCount == 2) navigateToFinding()
            }
        })
    }

    private val severityFilters = mapOf(
        "critical" to JBCheckBox("Critical", true),
        "high" to JBCheckBox("High", true),
        "medium" to JBCheckBox("Medium", true),
        "low" to JBCheckBox("Low", false),
        "info" to JBCheckBox("Info", false),
    )

    init {
        val toolbar = JPanel(FlowLayout(FlowLayout.LEFT)).apply {
            severityFilters.values.forEach { cb ->
                cb.addActionListener { refreshTable() }
                add(cb)
            }
        }
        add(toolbar, BorderLayout.NORTH)
        add(JBScrollPane(table), BorderLayout.CENTER)

        scope.launch {
            findingsService.state.collect { state ->
                ApplicationManager.getApplication().invokeLater {
                    refreshTable(state)
                }
            }
        }
    }

    private fun refreshTable(state: FindingsState = findingsService.state.value) {
        val enabledSeverities = severityFilters.filter { it.value.isSelected }.keys
        val filtered = state.findings.filter { it.severity in enabledSeverities }
        tableModel.setFindings(filtered)
    }

    private fun navigateToFinding() {
        val row = table.selectedRow.takeIf { it >= 0 } ?: return
        val finding = tableModel.getFindingAt(table.convertRowIndexToModel(row))
        val vf = LocalFileSystem.getInstance().findFileByPath(
            "${project.basePath}/${finding.file}"
        ) ?: return
        FileEditorManager.getInstance(project).openFile(vf, true)
    }

    fun dispose() {
        scope.cancel()
    }
}

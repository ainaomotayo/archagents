package com.sentinel.intellij.ui

import com.sentinel.intellij.model.Finding
import javax.swing.table.AbstractTableModel

class FindingsTableModel : AbstractTableModel() {

    private val columns = arrayOf("Severity", "File", "Line", "Title", "Agent", "Confidence")
    private var findings: List<Finding> = emptyList()

    fun setFindings(newFindings: List<Finding>) {
        findings = newFindings
        fireTableDataChanged()
    }

    fun getFindingAt(row: Int): Finding = findings[row]

    override fun getRowCount(): Int = findings.size
    override fun getColumnCount(): Int = columns.size
    override fun getColumnName(column: Int): String = columns[column]

    override fun getValueAt(rowIndex: Int, columnIndex: Int): Any? {
        val f = findings[rowIndex]
        return when (columnIndex) {
            0 -> f.severity.uppercase()
            1 -> f.file
            2 -> f.lineStart
            3 -> f.title ?: f.category ?: "—"
            4 -> f.agentName
            5 -> "${(f.confidence * 100).toInt()}%"
            else -> null
        }
    }

    override fun getColumnClass(columnIndex: Int): Class<*> {
        return when (columnIndex) {
            2 -> Integer::class.java
            else -> String::class.java
        }
    }
}

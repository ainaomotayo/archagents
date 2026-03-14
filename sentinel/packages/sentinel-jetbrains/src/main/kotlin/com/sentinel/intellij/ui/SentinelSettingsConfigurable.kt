package com.sentinel.intellij.ui

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.options.Configurable
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextField
import com.sentinel.intellij.services.SentinelAuthService
import com.sentinel.intellij.services.SentinelSettingsService
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import java.awt.Insets
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.JPasswordField

class SentinelSettingsConfigurable(private val project: Project) : Configurable {

    private val apiUrlField = JBTextField()
    private val projectIdField = JBTextField()
    private val apiTokenField = JPasswordField()
    private val enableGutterIcons = JBCheckBox("Show gutter icons")
    private val enableAnnotations = JBCheckBox("Show inline annotations")
    private val autoScanOnSave = JBCheckBox("Auto-scan on save")

    override fun getDisplayName(): String = "Sentinel Security"

    override fun createComponent(): JComponent {
        val settings = SentinelSettingsService.getInstance(project)
        val auth = ApplicationManager.getApplication().getService(SentinelAuthService::class.java)

        apiUrlField.text = settings.state.apiUrl
        projectIdField.text = settings.state.projectId
        apiTokenField.text = auth.getToken(project) ?: ""
        enableGutterIcons.isSelected = settings.state.enableGutterIcons
        enableAnnotations.isSelected = settings.state.enableAnnotations
        autoScanOnSave.isSelected = settings.state.autoScanOnSave

        return JPanel(GridBagLayout()).apply {
            val gbc = GridBagConstraints().apply {
                fill = GridBagConstraints.HORIZONTAL
                insets = Insets(4, 4, 4, 4)
            }

            var row = 0

            gbc.gridx = 0; gbc.gridy = row; gbc.weightx = 0.0
            add(JBLabel("API URL:"), gbc)
            gbc.gridx = 1; gbc.weightx = 1.0
            add(apiUrlField, gbc)

            row++
            gbc.gridx = 0; gbc.gridy = row; gbc.weightx = 0.0
            add(JBLabel("Project ID:"), gbc)
            gbc.gridx = 1; gbc.weightx = 1.0
            add(projectIdField, gbc)

            row++
            gbc.gridx = 0; gbc.gridy = row; gbc.weightx = 0.0
            add(JBLabel("API Token:"), gbc)
            gbc.gridx = 1; gbc.weightx = 1.0
            add(apiTokenField, gbc)

            row++
            gbc.gridx = 0; gbc.gridy = row; gbc.gridwidth = 2
            add(enableGutterIcons, gbc)

            row++
            gbc.gridy = row
            add(enableAnnotations, gbc)

            row++
            gbc.gridy = row
            add(autoScanOnSave, gbc)

            row++
            gbc.gridy = row; gbc.weighty = 1.0
            add(JPanel(), gbc)
        }
    }

    override fun isModified(): Boolean {
        val settings = SentinelSettingsService.getInstance(project)
        val auth = ApplicationManager.getApplication().getService(SentinelAuthService::class.java)
        return apiUrlField.text != settings.state.apiUrl ||
                projectIdField.text != settings.state.projectId ||
                String(apiTokenField.password) != (auth.getToken(project) ?: "") ||
                enableGutterIcons.isSelected != settings.state.enableGutterIcons ||
                enableAnnotations.isSelected != settings.state.enableAnnotations ||
                autoScanOnSave.isSelected != settings.state.autoScanOnSave
    }

    override fun apply() {
        val settings = SentinelSettingsService.getInstance(project)
        settings.loadState(SentinelSettingsService.State(
            apiUrl = apiUrlField.text,
            projectId = projectIdField.text,
            enableGutterIcons = enableGutterIcons.isSelected,
            enableAnnotations = enableAnnotations.isSelected,
            autoScanOnSave = autoScanOnSave.isSelected,
            enableToolWindow = settings.state.enableToolWindow,
            severityThreshold = settings.state.severityThreshold,
        ))

        val token = String(apiTokenField.password)
        if (token.isNotBlank()) {
            val auth = ApplicationManager.getApplication().getService(SentinelAuthService::class.java)
            auth.setToken(token, project)
        }
    }
}

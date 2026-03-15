package com.sentinel.intellij.integration

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.testFramework.fixtures.BasePlatformTestCase

/**
 * Integration tests verifying Sentinel actions are properly registered.
 * Runs inside IntelliJ Platform test sandbox.
 */
class ActionRegistrationTest : BasePlatformTestCase() {

    fun testTriggerScanActionRegistered() {
        val action = ActionManager.getInstance().getAction("Sentinel.TriggerScan")
        assertNotNull("TriggerScan action should be registered", action)
    }

    fun testConfigureActionRegistered() {
        val action = ActionManager.getInstance().getAction("Sentinel.Configure")
        assertNotNull("Configure action should be registered", action)
    }

    fun testOpenDashboardActionRegistered() {
        val action = ActionManager.getInstance().getAction("Sentinel.OpenDashboard")
        assertNotNull("OpenDashboard action should be registered", action)
    }

    fun testActionGroupRegistered() {
        val action = ActionManager.getInstance().getAction("Sentinel.Actions")
        assertNotNull("Sentinel action group should be registered", action)
    }

    fun testTriggerScanActionText() {
        val action = ActionManager.getInstance().getAction("Sentinel.TriggerScan")
        assertNotNull(action)
        assertEquals("Trigger Security Scan", action!!.templatePresentation.text)
    }

    fun testConfigureActionText() {
        val action = ActionManager.getInstance().getAction("Sentinel.Configure")
        assertNotNull(action)
        assertEquals("Configure Sentinel", action!!.templatePresentation.text)
    }
}

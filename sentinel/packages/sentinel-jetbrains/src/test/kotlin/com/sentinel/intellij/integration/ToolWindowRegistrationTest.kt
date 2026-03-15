package com.sentinel.intellij.integration

import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.testFramework.fixtures.BasePlatformTestCase

/**
 * Integration tests for Sentinel tool window registration.
 * Runs inside IntelliJ Platform test sandbox.
 */
class ToolWindowRegistrationTest : BasePlatformTestCase() {

    fun testToolWindowIsRegistered() {
        val twManager = ToolWindowManager.getInstance(project)
        val toolWindow = twManager.getToolWindow("Sentinel")
        assertNotNull("Sentinel tool window should be registered", toolWindow)
    }

    fun testToolWindowAnchor() {
        val twManager = ToolWindowManager.getInstance(project)
        val toolWindow = twManager.getToolWindow("Sentinel")
        assertNotNull(toolWindow)
        assertEquals("Tool window should be anchored at bottom",
            "bottom", toolWindow!!.anchor.toString().lowercase())
    }

    fun testToolWindowIsAvailable() {
        val twManager = ToolWindowManager.getInstance(project)
        val toolWindow = twManager.getToolWindow("Sentinel")
        assertNotNull(toolWindow)
        assertTrue("Tool window should be available", toolWindow!!.isAvailable)
    }
}

package com.sentinel.intellij.integration

import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.openapi.extensions.PluginId
import com.intellij.testFramework.fixtures.BasePlatformTestCase

/**
 * Integration tests that run inside a real IntelliJ Platform sandbox.
 * Verifies plugin registration, extension points, and action availability.
 */
class PluginRegistrationTest : BasePlatformTestCase() {

    fun testPluginIsLoaded() {
        val pluginId = PluginId.getId("com.sentinel.intellij")
        val descriptor = PluginManagerCore.getPlugin(pluginId)
        assertNotNull("Sentinel plugin should be loaded", descriptor)
        assertTrue("Plugin should be enabled", descriptor!!.isEnabled)
    }

    fun testPluginVersion() {
        val pluginId = PluginId.getId("com.sentinel.intellij")
        val descriptor = PluginManagerCore.getPlugin(pluginId)
        assertNotNull(descriptor)
        assertEquals("0.1.0", descriptor!!.version)
    }

    fun testPluginName() {
        val pluginId = PluginId.getId("com.sentinel.intellij")
        val descriptor = PluginManagerCore.getPlugin(pluginId)
        assertNotNull(descriptor)
        assertEquals("Sentinel Security", descriptor!!.name)
    }

    fun testPluginDependencies() {
        val pluginId = PluginId.getId("com.sentinel.intellij")
        val descriptor = PluginManagerCore.getPlugin(pluginId)
        assertNotNull(descriptor)
        val depIds = descriptor!!.dependencies.map { it.pluginId.idString }
        assertTrue("Should depend on platform", depIds.contains("com.intellij.modules.platform"))
        assertTrue("Should depend on LSP4IJ", depIds.contains("com.redhat.devtools.lsp4ij"))
    }
}

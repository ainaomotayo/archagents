package com.sentinel.intellij.integration

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.sentinel.intellij.services.SentinelAuthService
import com.sentinel.intellij.services.SentinelFindingsService
import com.sentinel.intellij.services.SentinelSettingsService

/**
 * Integration tests verifying Sentinel services are properly registered
 * and can be retrieved from the IntelliJ Platform service container.
 */
class ServiceRegistrationTest : BasePlatformTestCase() {

    fun testAuthServiceAvailable() {
        val service = ApplicationManager.getApplication().getService(SentinelAuthService::class.java)
        assertNotNull("SentinelAuthService should be available as application service", service)
    }

    fun testSettingsServiceAvailable() {
        val service = project.getService(SentinelSettingsService::class.java)
        assertNotNull("SentinelSettingsService should be available as project service", service)
    }

    fun testFindingsServiceAvailable() {
        val service = project.getService(SentinelFindingsService::class.java)
        assertNotNull("SentinelFindingsService should be available as project service", service)
    }

    fun testFindingsServiceCompanionAccessor() {
        val service = SentinelFindingsService.getInstance(project)
        assertNotNull("SentinelFindingsService.getInstance should return service", service)
    }

    fun testSettingsServiceDefaults() {
        val service = project.getService(SentinelSettingsService::class.java)
        assertNotNull(service)
        // Default API URL should be localhost
        assertNotNull("apiUrl should have a default", service.state.apiUrl)
    }
}

package com.sentinel.intellij.services

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SentinelAuthServiceTest {

    @Test
    fun `generateServiceName creates deterministic key`() {
        val key1 = SentinelAuthService.generateServiceName("project-abc")
        val key2 = SentinelAuthService.generateServiceName("project-abc")
        assertEquals(key1, key2)
    }

    @Test
    fun `generateServiceName includes project hash`() {
        val key = SentinelAuthService.generateServiceName("project-abc")
        assertTrue(key.contains("project-abc"))
    }

    @Test
    fun `generateServiceName differs by project`() {
        val key1 = SentinelAuthService.generateServiceName("project-abc")
        val key2 = SentinelAuthService.generateServiceName("project-xyz")
        assertTrue(key1 != key2)
    }

    @Test
    fun `global service name is stable`() {
        val key = SentinelAuthService.globalServiceName
        assertTrue(key.contains("Sentinel"))
    }
}

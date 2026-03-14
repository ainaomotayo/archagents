package com.sentinel.intellij.lsp

import kotlin.test.Test
import kotlin.test.assertEquals

class SentinelLspRequestManagerTest {

    @Test
    fun `triggerScan builds correct request params`() {
        val params = SentinelLspRequestManager.buildTriggerScanParams("proj-1", listOf("src/app.ts"))
        assertEquals("proj-1", params["projectId"])
        assertEquals(listOf("src/app.ts"), params["files"])
    }

    @Test
    fun `triggerScan with empty files sends empty list`() {
        val params = SentinelLspRequestManager.buildTriggerScanParams("proj-1", emptyList())
        assertEquals(emptyList<String>(), params["files"])
    }

    @Test
    fun `suppressFinding builds correct params`() {
        val params = SentinelLspRequestManager.buildSuppressParams("finding-abc")
        assertEquals("finding-abc", params["findingId"])
    }

    @Test
    fun `custom method names follow sentinel namespace`() {
        assertEquals("sentinel/triggerScan", SentinelLspRequestManager.METHOD_TRIGGER_SCAN)
        assertEquals("sentinel/suppress", SentinelLspRequestManager.METHOD_SUPPRESS)
        assertEquals("sentinel/status", SentinelLspRequestManager.METHOD_STATUS)
    }
}

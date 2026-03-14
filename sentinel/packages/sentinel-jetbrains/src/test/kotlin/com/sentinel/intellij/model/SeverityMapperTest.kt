package com.sentinel.intellij.model

import kotlin.test.Test
import kotlin.test.assertEquals

class SeverityMapperTest {

    @Test
    fun `critical maps to error highlight severity`() {
        assertEquals("ERROR", SeverityMapper.toHighlightSeverityName("critical"))
    }

    @Test
    fun `high maps to error highlight severity`() {
        assertEquals("ERROR", SeverityMapper.toHighlightSeverityName("high"))
    }

    @Test
    fun `medium maps to warning highlight severity`() {
        assertEquals("WARNING", SeverityMapper.toHighlightSeverityName("medium"))
    }

    @Test
    fun `low maps to weak warning highlight severity`() {
        assertEquals("WEAK_WARNING", SeverityMapper.toHighlightSeverityName("low"))
    }

    @Test
    fun `info maps to information highlight severity`() {
        assertEquals("INFORMATION", SeverityMapper.toHighlightSeverityName("info"))
    }
}

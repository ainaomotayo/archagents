package com.sentinel.intellij.services

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project

@Service(Service.Level.APP)
class SentinelAuthService {

    companion object {
        val globalServiceName: String = generateServiceName("Sentinel", "API Token")

        fun generateServiceName(projectHash: String): String {
            return com.intellij.credentialStore.generateServiceName("Sentinel", "API Token:$projectHash")
        }
    }

    fun getToken(project: Project): String? {
        val projectKey = CredentialAttributes(generateServiceName(project.locationHash))
        return PasswordSafe.instance.getPassword(projectKey)
            ?: PasswordSafe.instance.getPassword(CredentialAttributes(globalServiceName))
    }

    fun setToken(token: String, project: Project? = null) {
        val key = if (project != null) {
            CredentialAttributes(generateServiceName(project.locationHash))
        } else {
            CredentialAttributes(globalServiceName)
        }
        PasswordSafe.instance.setPassword(key, token)
    }

    fun hasToken(project: Project): Boolean = getToken(project) != null
}

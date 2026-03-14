plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.25"
    id("org.jetbrains.intellij") version "1.17.4"
}

group = "com.sentinel"
version = "0.1.0"

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
    testImplementation("io.mockk:mockk:1.13.12")
}

intellij {
    // IC (Community) is the widest compatibility base — all paid JetBrains IDEs
    // (IntelliJ Ultimate, PhpStorm, WebStorm, PyCharm, GoLand, RubyMine,
    // CLion, Rider, DataGrip) include the IC platform modules.
    version.set("2024.1")
    type.set("IC")
    plugins.set(listOf("com.redhat.devtools.lsp4ij:0.4.0"))
    updateSinceUntilBuild.set(true)
}

tasks {
    withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
        kotlinOptions.jvmTarget = "17"
    }
    patchPluginXml {
        sinceBuild.set("241")
        untilBuild.set("253.*")
        changeNotes.set("""
            <h3>0.1.0</h3>
            <ul>
                <li>Initial release</li>
                <li>Real-time security findings with gutter icons and inline annotations</li>
                <li>Tool window with sortable, filterable findings table</li>
                <li>One-click finding suppression</li>
                <li>LSP-based analysis via shared sentinel-lsp server</li>
                <li>SSE push for real-time finding delivery</li>
                <li>Secure credential storage via PasswordSafe</li>
            </ul>
        """.trimIndent())
    }
    publishPlugin {
        // Token is provided via PUBLISH_TOKEN environment variable in CI
        token.set(System.getenv("PUBLISH_TOKEN") ?: "")
        // Use beta channel for pre-release versions
        channels.set(listOf(if (version.toString().contains("-")) "beta" else "default"))
    }
    signPlugin {
        // Signing credentials provided via environment variables in CI
        certificateChainFile.set(file(System.getenv("CERTIFICATE_CHAIN") ?: "/dev/null"))
        privateKeyFile.set(file(System.getenv("PRIVATE_KEY") ?: "/dev/null"))
        password.set(System.getenv("PRIVATE_KEY_PASSWORD") ?: "")
    }
    test {
        useJUnitPlatform()
    }
}

import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val localProps = Properties()
val localPropsFile = rootProject.file("local.properties")
if (localPropsFile.exists()) {
    localPropsFile.inputStream().use { localProps.load(it) }
}

fun prop(name: String, default: String): String {
    val fromLocal = localProps.getProperty(name)?.trim()
    if (!fromLocal.isNullOrEmpty()) return fromLocal
    val fromGradle = (findProperty(name) as String?)?.trim()
    if (!fromGradle.isNullOrEmpty()) return fromGradle
    return default
}

android {
    namespace = "com.craftguru.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.craftguru.app"
        minSdk = 29
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        val webBase = prop("CRAFTGURU_WEB_BASE_URL", "https://www.craftguru.co.in")
        val apiBase = prop("CRAFTGURU_API_BASE_URL", "")
        buildConfigField("String", "WEB_BASE_URL", "\"$webBase\"")
        buildConfigField("String", "API_BASE_URL", "\"$apiBase\"")
    }

    signingConfigs {
        create("release") {
            val keystorePath = prop("RELEASE_STORE_FILE", "")
            if (keystorePath.isNotEmpty()) {
                storeFile = file(keystorePath)
                storePassword = prop("RELEASE_STORE_PASSWORD", "")
                keyAlias = prop("RELEASE_KEY_ALIAS", "craftguru")
                keyPassword = prop("RELEASE_KEY_PASSWORD", "")
            }
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
            applicationIdSuffix = ".debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            val keystorePath = prop("RELEASE_STORE_FILE", "")
            if (keystorePath.isNotEmpty()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.webkit:webkit:1.11.0")

    // FCM structure (no google-services.json required until push is enabled).
    implementation(platform("com.google.firebase:firebase-bom:33.1.2"))
    implementation("com.google.firebase:firebase-messaging-ktx")
}

// Apply only when google-services.json is present (production FCM setup).
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

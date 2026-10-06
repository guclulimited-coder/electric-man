plugins { id("com.android.application") }

// Release values come from CI (environment); debug builds always use Google's official test ads.
fun env(name: String, fallback: String = "") = System.getenv(name)?.takeIf { it.isNotBlank() } ?: fallback
val testApp = "ca-app-pub-3940256099942544~3347511713"

android {
    namespace = "com.tusneldax.electrichunter"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.tusneldax.electrichunter"
        minSdk = 24
        targetSdk = 36
        versionCode = env("EM_VERSION_CODE", "1").toInt()
        versionName = env("EM_VERSION_NAME", "1.0.0")
    }
    signingConfigs {
        create("upload") {
            val ks = env("EM_KEYSTORE_FILE")
            if (ks.isNotEmpty()) {
                storeFile = file(ks)
                storePassword = env("EM_KEYSTORE_PASSWORD")
                keyAlias = env("EM_KEY_ALIAS", "upload")
                keyPassword = env("EM_KEYSTORE_PASSWORD")
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["admobAppId"] = testApp
            buildConfigField("String", "AD_APP_OPEN", "\"ca-app-pub-3940256099942544/9257395921\"")
            buildConfigField("String", "AD_INTERSTITIAL", "\"ca-app-pub-3940256099942544/1033173712\"")
            buildConfigField("String", "AD_REWARDED", "\"ca-app-pub-3940256099942544/5224354917\"")
        }
        getByName("release") {
            isMinifyEnabled = false
            if (env("EM_KEYSTORE_FILE").isNotEmpty()) signingConfig = signingConfigs.getByName("upload")
            manifestPlaceholders["admobAppId"] = env("EM_ADMOB_APP_ANDROID", testApp)
            buildConfigField("String", "AD_APP_OPEN", "\"" + env("EM_AD_APP_OPEN_ANDROID") + "\"")
            buildConfigField("String", "AD_INTERSTITIAL", "\"" + env("EM_AD_INTERSTITIAL_ANDROID") + "\"")
            buildConfigField("String", "AD_REWARDED", "\"" + env("EM_AD_REWARDED_ANDROID") + "\"")
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.browser:browser:1.8.0")
    implementation("androidx.core:core:1.16.0")
    implementation("com.google.android.gms:play-services-ads:24.5.0")
    implementation("com.google.android.ump:user-messaging-platform:3.2.0")
    implementation("com.android.billingclient:billing:8.0.0")
}

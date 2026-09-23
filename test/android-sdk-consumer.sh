#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
consumer_dir="$(mktemp -d)"
trap 'rm -rf "$consumer_dir"' EXIT
mkdir -p "$consumer_dir/src/main/java/example"
cat > "$consumer_dir/settings.gradle" <<'GRADLE'
pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement {
    repositories {
        maven { url = uri(providers.gradleProperty('sdkRepository').get()) }
        google(); mavenCentral()
    }
}
rootProject.name = 'IndependentSdkConsumer'
GRADLE
cat > "$consumer_dir/build.gradle" <<'GRADLE'
plugins { id 'com.android.application' version '8.10.1' }
android {
    namespace 'example.consumer'
    compileSdk 34
    defaultConfig { applicationId 'example.consumer'; minSdk 26; targetSdk 34 }
    compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }
}
dependencies { implementation 'com.rooiam:android-sdk:0.2.0-alpha.4' }
GRADLE
cat > "$consumer_dir/src/main/AndroidManifest.xml" <<'XML'
<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:allowBackup="false" /></manifest>
XML
cat > "$consumer_dir/src/main/java/example/Integration.java" <<'JAVA'
package example;
import com.rooiam.sdk.RooiamClient;
public final class Integration {
    public RooiamClient create(android.content.Context context, RooiamClient.SessionCookies session) {
        return new RooiamClient(context, "https://auth.example.com", session);
    }
    // Invoked by a host worker only after displaying review and receiving confirmation.
    public void approve(RooiamClient client, RooiamClient.Review review, int number) throws Exception {
        client.approve(review, number);
    }
}
JAVA
"$repo_root/rooiam-sdk/android/gradlew" -p "$consumer_dir" \
    -PsdkRepository="$repo_root/rooiam-sdk/android/build/repository" assembleDebug
printf '%s\n' 'PASS: separate Android application assembled using published SDK and transitive dependencies.'

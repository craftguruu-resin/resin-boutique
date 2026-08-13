# Craft Guru — Android App

Native Android shell for the existing Craft Guru storefront. The app loads the production website in a WebView so all UI, APIs, authentication, cart, checkout, and vendor flows stay identical to the mobile website.

**No web or server code was modified** — the Android project lives entirely under `android/`.

## Architecture

```
android/
├── app/
│   ├── build.gradle.kts          # App config, BuildConfig URLs, signing
│   └── src/main/
│       ├── AndroidManifest.xml   # Permissions, activities, deep links, FCM stub
│       ├── java/com/craftguru/app/
│       │   ├── MainActivity.kt           # WebView shell (core)
│       │   ├── SplashActivity.kt         # Branded splash
│       │   ├── CraftGuruApplication.kt   # Cookie / WebView init
│       │   ├── CraftGuruWebViewClient.kt # In-app vs external navigation
│       │   ├── CraftGuruChromeClient.kt  # Progress, file chooser
│       │   ├── CraftGuruDownloadListener.kt
│       │   ├── NetworkMonitor.kt         # Offline detection
│       │   ├── NativeBridge.kt           # JS bridge (share, native flag)
│       │   ├── UrlPolicy.kt              # Deep link / URL rules
│       │   └── fcm/
│       │       └── CraftGuruFirebaseMessagingService.kt  # FCM placeholder
│       └── res/                          # Layouts, themes, icon, strings
├── build.gradle.kts
├── settings.gradle.kts
├── gradle.properties
├── gradlew / gradlew.bat
└── local.properties.example
```

### How it reuses the existing stack

| Feature | Approach |
|--------|----------|
| UI / UX | Full-screen WebView → `https://www.craftguru.co.in` (configurable) |
| APIs | Same-origin from production; optional `CRAFTGURU_API_BASE_URL` for dev |
| Auth sessions | `CookieManager` + `domStorageEnabled` + cookie flush on pause |
| Cart / checkout / wishlist | Existing storefront JS (unchanged) |
| Share product | `navigator.share` polyfill → native share sheet |
| Uploads / camera | `WebChromeClient.onShowFileChooser` + FileProvider |
| Downloads | `DownloadListener` → system DownloadManager |
| Push (future) | FCM service stub; add `google-services.json` when ready |

## Requirements

- **Android Studio** Ladybug (2024.2+) or newer recommended
- **JDK 17** (Android Gradle Plugin 8.5 requires JDK 17)
- **Android SDK** with API 34 platform and build-tools
- **minSdk 29** (Android 10+), **targetSdk 34**

## Environment / configuration

Set values in `android/gradle.properties` or `android/local.properties` (see `local.properties.example`):

| Property | Default | Description |
|----------|---------|-------------|
| `CRAFTGURU_WEB_BASE_URL` | `https://www.craftguru.co.in` | Storefront origin loaded in WebView |
| `CRAFTGURU_API_BASE_URL` | *(empty)* | Injected as `data-bill-api-base` when API host ≠ web host |
| `RELEASE_STORE_FILE` | — | Path to release keystore (signed APK) |
| `RELEASE_STORE_PASSWORD` | — | Keystore password |
| `RELEASE_KEY_ALIAS` | `craftguru` | Key alias |
| `RELEASE_KEY_PASSWORD` | — | Key password |
| `sdk.dir` | — | Android SDK path (auto-created by Android Studio) |

### Local development (emulator)

Emulator cannot reach `127.0.0.1` on your machine — use the host loopback alias:

```properties
CRAFTGURU_WEB_BASE_URL=http://10.0.2.2:8080
CRAFTGURU_API_BASE_URL=http://10.0.2.2:3847
```

Run the existing server (`server/` on port 3847) and static host on 8080 as you do for web dev.

## Dependencies

Declared in `app/build.gradle.kts`:

- AndroidX (Core, AppCompat, Material, ConstraintLayout, SplashScreen, WebKit)
- SwipeRefreshLayout 1.2.0
- Firebase BOM 33.1.2 + `firebase-messaging-ktx` (structure only)

## Build commands

### 1. Open in Android Studio

1. Open the `android/` folder as a project.
2. Let Gradle sync (creates `local.properties` with `sdk.dir`).
3. Run **app** on a device or emulator.

### 2. Command line — debug APK

```bash
cd android
export JAVA_HOME=$(/usr/libexec/java_home -v 17)   # macOS
./gradlew assembleDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk`

(Debug build uses application id `com.craftguru.app.debug`.)

### 3. Command line — release APK

Create a keystore (once):

```bash
keytool -genkey -v -keystore craftguru-release.keystore \
  -alias craftguru -keyalg RSA -keysize 2048 -validity 10000
```

Add to `android/local.properties`:

```properties
RELEASE_STORE_FILE=/absolute/path/to/craftguru-release.keystore
RELEASE_STORE_PASSWORD=your_store_password
RELEASE_KEY_ALIAS=craftguru
RELEASE_KEY_PASSWORD=your_key_password
```

Build:

```bash
cd android
./gradlew assembleRelease
```

Output: `app/build/outputs/apk/release/app-release.apk` (signed when keystore props are set).

### 4. Android App Bundle (Play Store)

```bash
./gradlew bundleRelease
```

Output: `app/build/outputs/bundle/release/app-release.aab`

## Native features implemented

- Splash screen (Android 12+ SplashScreen API + `SplashActivity`)
- Adaptive launcher icon (Craft Guru brand color + logo)
- Full-screen mobile web (no duplicate native header)
- System back → WebView history
- Pull-to-refresh (`SwipeRefreshLayout`)
- Top loading progress bar
- Offline banner + reconnect auto-load
- File / image picker and camera capture for vendor uploads
- Download manager for PDF/Excel exports
- Share via `navigator.share` polyfill
- Deep links: `https://www.craftguru.co.in/*` and `craftguru://open`
- FCM service stub (enable with `google-services.json`)

## Deep linking (prepared)

`MainActivity` is `singleTask` with intent filters for:

- `https://www.craftguru.co.in` and `https://craftguru.co.in`
- Custom scheme: `craftguru://open?url=/product.html?...`

Product URLs opened from Chrome can later use App Links (`android:autoVerify="true"`) once hosting serves the Digital Asset Links file.

## Push notifications (prepared, not active)

1. Create a Firebase project and add Android app `com.craftguru.app`.
2. Place `google-services.json` in `android/app/`.
3. Rebuild — the Google Services plugin applies automatically when the file exists.
4. Implement token upload and `onMessageReceived` in `CraftGuruFirebaseMessagingService` when the server API is ready.

## Files added (summary)

All paths under `android/`:

- Gradle: `settings.gradle.kts`, `build.gradle.kts`, `gradle.properties`, wrapper scripts
- App: `app/build.gradle.kts`, `app/proguard-rules.pro`, `AndroidManifest.xml`
- Kotlin: 10 source files in `app/src/main/java/com/craftguru/app/`
- Resources: layouts, values, mipmap adaptive icons, `file_paths.xml`, `network_security_config.xml`
- Docs: `README.md`, `local.properties.example`, `.gitignore`

**No changes** to root storefront HTML/JS or `server/` for this Android packaging.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| SDK location not found | Open project in Android Studio or set `sdk.dir` in `local.properties` |
| API calls fail on emulator | Set `CRAFTGURU_API_BASE_URL=http://10.0.2.2:3847` |
| Login not persisting | Ensure cookies enabled; production HTTPS cookies persist via `CookieManager` |
| Cleartext HTTP blocked | `network_security_config.xml` allows user-defined dev hosts |
| Release build unsigned | Set all `RELEASE_*` properties in `local.properties` |

## Verify build locally

After installing Android SDK:

```bash
cd android && ./gradlew assembleDebug assembleRelease --no-daemon
```

Both tasks should complete without errors when `sdk.dir` and (for release signing) keystore properties are configured.

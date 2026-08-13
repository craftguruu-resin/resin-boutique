-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.craftguru.app.** { *; }
-keepclassmembers class com.craftguru.app.NativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface

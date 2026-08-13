package com.craftguru.app

import android.app.Application
import android.webkit.CookieManager
import android.webkit.WebView

class CraftGuruApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Persist login cookies / localStorage across app restarts.
        CookieManager.getInstance().setAcceptCookie(true)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
    }
}

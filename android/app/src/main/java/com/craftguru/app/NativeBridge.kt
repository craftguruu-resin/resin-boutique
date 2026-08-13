package com.craftguru.app

import android.content.Context
import android.content.Intent
import android.webkit.JavascriptInterface

/**
 * Thin native bridge — storefront JS can call optional helpers without duplicating business logic.
 */
class NativeBridge(private val context: Context) {
    @JavascriptInterface
    fun shareCurrentUrl(url: String?) {
        if (url.isNullOrBlank()) return
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, url)
        }
        context.startActivity(Intent.createChooser(intent, context.getString(R.string.action_share)))
    }

    @JavascriptInterface
    fun isNativeApp(): Boolean = true
}

package com.craftguru.app

import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

class CraftGuruWebViewClient(
    private val webBase: String,
    private val onPageFinished: () -> Unit,
    private val onProgress: (Int) -> Unit
) : WebViewClient() {

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val uri = request.url
        if (UrlPolicy.isInAppUrl(uri, webBase)) {
            return false
        }
        // External links (WhatsApp, mailto, tel) open in system handlers.
        val scheme = uri.scheme?.lowercase()
        when (scheme) {
            "http", "https" -> {
                view.context.startActivity(
                    android.content.Intent(android.content.Intent.ACTION_VIEW, uri)
                )
                return true
            }
            "mailto", "tel", "sms", "whatsapp", "intent" -> {
                try {
                    view.context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, uri))
                } catch (_: Exception) {
                }
                return true
            }
        }
        return false
    }

    override fun onPageFinished(view: WebView?, url: String?) {
        onPageFinished()
        onProgress(100)
    }

    @Deprecated("Deprecated in Java")
    override fun onReceivedError(
        view: WebView?,
        errorCode: Int,
        description: String?,
        failingUrl: String?
    ) {
        onProgress(100)
    }
}

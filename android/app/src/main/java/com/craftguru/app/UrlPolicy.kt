package com.craftguru.app

import android.net.Uri
import android.webkit.URLUtil

object UrlPolicy {
    private val allowedHosts = setOf(
        "www.craftguru.co.in",
        "craftguru.co.in",
        "127.0.0.1",
        "10.0.2.2",
        "localhost"
    )

    fun isInAppUrl(uri: Uri?, webBase: String): Boolean {
        if (uri == null) return false
        val host = uri.host?.lowercase() ?: return false
        if (allowedHosts.contains(host)) return true
        try {
            val baseHost = Uri.parse(webBase).host?.lowercase()
            if (baseHost != null && host == baseHost) return true
        } catch (_: Exception) {
        }
        return false
    }

    fun normalizeStartUrl(webBase: String, deepLink: Uri?): String {
        if (deepLink != null) {
            when (deepLink.scheme) {
                "craftguru" -> {
                    val path = deepLink.getQueryParameter("url") ?: deepLink.path
                    if (!path.isNullOrBlank()) {
                        return if (path.startsWith("http")) path else webBase.trimEnd('/') + "/" + path.trimStart('/')
                    }
                }
                "http", "https" -> {
                    if (isInAppUrl(deepLink, webBase)) return deepLink.toString()
                }
            }
        }
        return webBase.trimEnd('/') + "/index.html"
    }

    fun isDownloadable(url: String?): Boolean {
        if (url.isNullOrBlank()) return false
        return URLUtil.isHttpsUrl(url) || URLUtil.isHttpUrl(url)
    }
}

package com.craftguru.app

import android.net.Uri
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView

class CraftGuruChromeClient(
    private val onShowFileChooser: (ValueCallback<Array<Uri>>?, Boolean) -> Unit,
    private val onProgress: (Int) -> Unit
) : WebChromeClient() {

    override fun onProgressChanged(view: WebView?, newProgress: Int) {
        onProgress(newProgress)
    }

    override fun onShowFileChooser(
        webView: WebView?,
        filePathCallback: ValueCallback<Array<Uri>>?,
        fileChooserParams: FileChooserParams?
    ): Boolean {
        val capture = fileChooserParams?.isCaptureEnabled == true
        onShowFileChooser(filePathCallback, capture)
        return true
    }
}

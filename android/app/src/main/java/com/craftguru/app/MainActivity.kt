package com.craftguru.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import com.craftguru.app.databinding.ActivityMainBinding
import java.io.File

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var networkMonitor: NetworkMonitor

    private var filePathCallback: android.webkit.ValueCallback<Array<Uri>>? = null
    private var cameraCaptureUri: Uri? = null
    private var pendingStartUrl: String? = null

    private val pickDocuments = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val callback = filePathCallback
        filePathCallback = null
        if (result.resultCode != RESULT_OK) {
            callback?.onReceiveValue(null)
            return@registerForActivityResult
        }
        val data = result.data
        val uris = when {
            data == null -> null
            data.clipData != null -> {
                val clip = data.clipData!!
                Array(clip.itemCount) { i -> clip.getItemAt(i).uri }
            }
            data.data != null -> arrayOf(data.data!!)
            else -> null
        }
        callback?.onReceiveValue(uris)
    }

    private val takePicture = registerForActivityResult(
        ActivityResultContracts.TakePicture()
    ) { success ->
        val callback = filePathCallback
        filePathCallback = null
        if (success && cameraCaptureUri != null) {
            callback?.onReceiveValue(arrayOf(cameraCaptureUri!!))
        } else {
            callback?.onReceiveValue(null)
        }
        cameraCaptureUri = null
    }

    private val requestCameraPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            launchCameraCapture()
        } else {
            filePathCallback?.onReceiveValue(null)
            filePathCallback = null
        }
    }

    private val requestPostNotifications = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        applyWindowInsets()
        setupNetworkMonitor()
        setupSwipeRefresh()
        setupWebView()
        setupBackNavigation()

        val startUrl = UrlPolicy.normalizeStartUrl(BuildConfig.WEB_BASE_URL, intent?.data)
        loadUrl(startUrl)

        if (android.os.Build.VERSION.SDK_INT >= 33) {
            requestPostNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val url = UrlPolicy.normalizeStartUrl(BuildConfig.WEB_BASE_URL, intent.data)
        if (binding.webView.url != url) {
            loadUrl(url)
        }
    }

    override fun onPause() {
        binding.webView.onPause()
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        binding.webView.onResume()
    }

    override fun onDestroy() {
        networkMonitor.stop()
        binding.webView.destroy()
        super.onDestroy()
    }

    private fun applyWindowInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(binding.root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.updatePadding(top = bars.top, bottom = bars.bottom)
            insets
        }
    }

    private fun setupNetworkMonitor() {
        networkMonitor = NetworkMonitor(this) { online ->
            binding.offlineBanner.visibility = if (online) View.GONE else View.VISIBLE
            binding.swipeRefresh.isEnabled = online
            if (online && pendingStartUrl != null) {
                val pending = pendingStartUrl!!
                pendingStartUrl = null
                binding.webView.loadUrl(pending)
            }
        }
        networkMonitor.start()
    }

    private fun setupSwipeRefresh() {
        binding.swipeRefresh.setColorSchemeColors(getColor(R.color.cg_teal))
        binding.swipeRefresh.setOnRefreshListener {
            if (networkMonitor.isOnline()) {
                binding.webView.reload()
            } else {
                binding.swipeRefresh.isRefreshing = false
                Toast.makeText(this, getString(R.string.offline_message), Toast.LENGTH_SHORT).show()
            }
        }
        binding.swipeRefresh.setOnChildScrollUpCallback { _, _ ->
            binding.webView.scrollY > 0
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val webView = binding.webView
        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            loadWithOverviewMode = true
            useWideViewPort = true
            builtInZoomControls = false
            displayZoomControls = false
            setSupportZoom(false)
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = true
            allowContentAccess = true
            javaScriptCanOpenWindowsAutomatically = true
            userAgentString = userAgentString + " CraftGuruAndroid/1.0"
        }

        webView.addJavascriptInterface(NativeBridge(this), "CraftGuruNative")

        val webBase = BuildConfig.WEB_BASE_URL
        webView.webViewClient = CraftGuruWebViewClient(
            webBase = webBase,
            onPageFinished = {
                binding.swipeRefresh.isRefreshing = false
                injectNativeHelpers(webView)
            },
            onProgress = ::updateLoadingProgress
        )

        webView.webChromeClient = CraftGuruChromeClient(
            onShowFileChooser = { callback, capture -> openFileChooser(callback, capture) },
            onProgress = ::updateLoadingProgress
        )

        webView.setDownloadListener(CraftGuruDownloadListener(this))
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    val webView = binding.webView
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            }
        )
    }

    private fun loadUrl(url: String) {
        if (!networkMonitor.isOnline()) {
            pendingStartUrl = url
            binding.offlineBanner.visibility = View.VISIBLE
            return
        }
        pendingStartUrl = null
        binding.webView.loadUrl(url)
    }

    private fun updateLoadingProgress(progress: Int) {
        if (progress in 1..99) {
            binding.progressBar.visibility = View.VISIBLE
            binding.progressBar.progress = progress
        } else {
            binding.progressBar.visibility = View.GONE
            binding.progressBar.progress = 0
        }
        if (progress == 100) {
            binding.swipeRefresh.isRefreshing = false
        }
    }

    private fun injectNativeHelpers(webView: WebView) {
        val apiBase = BuildConfig.API_BASE_URL.trim()
        val apiJs = if (apiBase.isNotEmpty()) {
            "document.documentElement.setAttribute('data-bill-api-base','$apiBase');"
        } else {
            ""
        }
        val script = """
            (function() {
              try {
                document.documentElement.setAttribute('data-native-app','android');
                $apiJs
                if (!navigator.share) {
                  navigator.share = function(data) {
                    var url = (data && data.url) ? data.url : window.location.href;
                    if (window.CraftGuruNative) {
                      window.CraftGuruNative.shareCurrentUrl(url);
                    }
                    return Promise.resolve();
                  };
                }
              } catch (e) {}
            })();
        """.trimIndent()
        webView.evaluateJavascript(script, null)
    }

    private fun openFileChooser(
        callback: android.webkit.ValueCallback<Array<Uri>>?,
        captureEnabled: Boolean
    ) {
        filePathCallback?.onReceiveValue(null)
        filePathCallback = callback

        if (captureEnabled) {
            if (androidx.core.content.ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.CAMERA
                ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            ) {
                launchCameraCapture()
            } else {
                requestCameraPermission.launch(Manifest.permission.CAMERA)
            }
            return
        }

        val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        }
        pickDocuments.launch(Intent.createChooser(intent, getString(R.string.choose_file)))
    }

    private fun launchCameraCapture() {
        val photoFile = File(cacheDir, "upload_${System.currentTimeMillis()}.jpg")
        cameraCaptureUri = FileProvider.getUriForFile(
            this,
            "${packageName}.fileprovider",
            photoFile
        )
        takePicture.launch(cameraCaptureUri)
    }
}

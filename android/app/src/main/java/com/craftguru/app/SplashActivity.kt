package com.craftguru.app

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen

/**
 * Brief branded splash then hands off to the WebView shell.
 */
class SplashActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        val next = Intent(this, MainActivity::class.java).apply {
            data = intent?.data
            intent?.extras?.let { putExtras(it) }
        }
        startActivity(next)
        finish()
    }
}

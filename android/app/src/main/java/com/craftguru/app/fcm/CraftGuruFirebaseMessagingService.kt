package com.craftguru.app.fcm

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * FCM placeholder — server push logic not implemented yet.
 * Add google-services.json and enable topics from vendor dashboard when ready.
 */
class CraftGuruFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        // Persist token to backend when notification API is available.
    }

    override fun onMessageReceived(message: RemoteMessage) {
        // Handle data payloads when server push is enabled.
    }
}

package __NOTICARE_PACKAGE__.bridge

import android.app.Activity
import android.os.Bundle
import android.util.Log
import android.widget.Toast

/**
 * Entry point for every link opened elsewhere on the device once NotiCare is
 * set as the default browser. Registered with a translucent,
 * excludeFromRecents theme so it never shows a visible window of its own
 * while it decides what to do with the link.
 *
 * Step 1 only wires up manifest registration and confirms the activity
 * receives incoming links. Later steps replace the log/Toast below with the
 * real UrlChecker verdict (Step 2), forwarding to the user's real browser
 * (Step 3), and the full-screen warning screen (Step 4).
 */
class LinkHandlerActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val url = intent?.dataString
        if (url == null) {
            Log.w(TAG, "LinkHandlerActivity started without a URL; finishing.")
            finish()
            return
        }

        Log.i(TAG, "Received link: $url")
        Toast.makeText(this, "NotiCare received: $url", Toast.LENGTH_LONG).show()

        finish()
    }

    companion object {
        private const val TAG = "LinkHandlerActivity"
    }
}

package __NOTICARE_PACKAGE__.bridge

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.widget.Toast

/**
 * Entry point for every link opened elsewhere on the device once NotiCare is
 * set as the default browser. Registered with a translucent,
 * excludeFromRecents theme so it never shows a visible window of its own
 * while it decides what to do with the link.
 *
 * SAFE links are forwarded straight to the user's real browser (Step 3).
 * SUSPICIOUS/DANGEROUS links hand off to the React Native full-screen
 * warning screen (Step 4) via a deep link into this app's own MainActivity.
 */
class LinkHandlerActivity : Activity() {
    private val urlChecker: UrlChecker = RuleBasedUrlChecker()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val url = intent?.dataString
        if (url == null) {
            Log.w(TAG, "LinkHandlerActivity started without a URL; finishing.")
            finish()
            return
        }

        val result = urlChecker.check(url)
        Log.i(TAG, "Checked link: $url -> ${result.verdict} (${result.reason})")

        if (result.verdict == UrlVerdict.SAFE) {
            when (val forwarded = LinkForwarder.openInRealBrowser(this, url)) {
                is LinkForwarder.ForwardResult.NoBrowserInstalled ->
                    Toast.makeText(this, "No other browser is installed on this device to open this link.", Toast.LENGTH_LONG).show()
                is LinkForwarder.ForwardResult.Failed ->
                    Toast.makeText(this, "Could not open this link in ${forwarded.browserLabel}.", Toast.LENGTH_LONG).show()
                is LinkForwarder.ForwardResult.Opened -> Unit
            }
        } else {
            showWarningScreen(url, result)
        }
        finish()
    }

    /**
     * Hands the link off to NotiCare's own React Native UI (the app/link-warning
     * screen) via a deep link, using this app's "noticareapp" scheme that
     * MainActivity already registers. setPackage keeps this resolving straight
     * to NotiCare instead of triggering another browser-chooser prompt.
     */
    private fun showWarningScreen(url: String, result: UrlCheckResult) {
        val deepLink = Uri.parse("noticareapp://link-warning")
            .buildUpon()
            .appendQueryParameter("url", url)
            .appendQueryParameter("verdict", result.verdict.name)
            .appendQueryParameter("reason", result.reason)
            .build()
        val warningIntent = Intent(Intent.ACTION_VIEW, deepLink).apply {
            setPackage(packageName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        startActivity(warningIntent)
    }

    companion object {
        private const val TAG = "LinkHandlerActivity"
    }
}

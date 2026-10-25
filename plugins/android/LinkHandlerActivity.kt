package __NOTICARE_PACKAGE__.bridge

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.widget.Toast

/**
 * Entry point for every link opened elsewhere on the device once NotiCare is
 * set as the default browser. Registered with a translucent,
 * excludeFromRecents theme so it never shows a visible window of its own
 * while it decides what to do with the link.
 *
 * SAFE links open a local verdict screen before the user chooses a browser.
 * SUSPICIOUS/DANGEROUS links open [LinkWarningActivity] at once, natively,
 * without waiting for React Native to start.
 */
class LinkHandlerActivity : Activity() {
    private val urlChecker: UrlChecker = RuleBasedUrlChecker()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(incoming: Intent?) {
        val url = when (incoming?.action) {
            Intent.ACTION_VIEW -> incoming.dataString
            Intent.ACTION_SEND -> SharedLinkExtractor.extractSingleUrl(
                incoming.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString(),
            )
            else -> null
        }
        if (url == null) {
            Log.w(TAG, "LinkHandlerActivity started without exactly one supported URL; finishing.")
            Toast.makeText(this, "Share one http or https link with NotiCare to check it.", Toast.LENGTH_LONG).show()
            finish()
            return
        }

        val result = urlChecker.check(url)
        // Never log the link itself: it can reveal what the user reads or contain personal data.
        Log.i(TAG, "Checked a link: ${result.verdict} (${result.reason})")

        startActivity(LinkWarningActivity.intent(this, url))
        finish()
    }

    companion object {
        private const val TAG = "LinkHandlerActivity"
    }
}

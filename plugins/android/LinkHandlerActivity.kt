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
 * SAFE links are forwarded straight to the user's real browser.
 * SUSPICIOUS/DANGEROUS links open [LinkWarningActivity] at once, natively,
 * without waiting for React Native to start.
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
        // Never log the link itself: it can reveal what the user reads or contain personal data.
        Log.i(TAG, "Checked a link: ${result.verdict} (${result.reason})")

        if (result.verdict == UrlVerdict.SAFE) {
            val copy = LinkWarningCopy.forContext(this)
            when (val forwarded = LinkForwarder.openInRealBrowser(this, url)) {
                is LinkForwarder.ForwardResult.NoBrowserInstalled ->
                    Toast.makeText(this, copy.noBrowser, Toast.LENGTH_LONG).show()
                is LinkForwarder.ForwardResult.Failed ->
                    Toast.makeText(this, copy.openFailed(forwarded.browserLabel), Toast.LENGTH_LONG).show()
                is LinkForwarder.ForwardResult.Opened -> Unit
            }
        } else {
            startActivity(LinkWarningActivity.intent(this, url))
        }
        finish()
    }

    companion object {
        private const val TAG = "LinkHandlerActivity"
    }
}

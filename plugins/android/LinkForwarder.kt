package __NOTICARE_PACKAGE__.bridge

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log

/**
 * Opens a URL in the user's real browser, never back in NotiCare. Shared by
 * [LinkHandlerActivity] (the instant SAFE-link fast path) and the "Open anyway"
 * button on [LinkWarningActivity], so both use the exact same browser-choice logic.
 * Links are never written to the log.
 */
object LinkForwarder {
    sealed class ForwardResult {
        data class Opened(val browserLabel: String) : ForwardResult()
        object NoBrowserInstalled : ForwardResult()
        data class Failed(val browserLabel: String) : ForwardResult()
    }

    private const val TAG = "LinkForwarder"

    fun openInRealBrowser(context: Context, url: String): ForwardResult {
        val preferred = BrowserPreferences.preferredBrowserPackage(context)
        val target = BrowserResolver.resolveTarget(context, preferred)
            ?: run {
                Log.w(TAG, "No other browser is installed; cannot forward a link.")
                return ForwardResult.NoBrowserInstalled
            }

        val forwardIntent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            setPackage(target.packageName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return try {
            context.startActivity(forwardIntent)
            ForwardResult.Opened(target.label)
        } catch (error: ActivityNotFoundException) {
            Log.w(TAG, "Chosen browser ${target.packageName} could not open a link.", error)
            ForwardResult.Failed(target.label)
        }
    }
}

package __NOTICARE_PACKAGE__.bridge

import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import android.widget.Toast

/**
 * Offers installed browsers after NotiCare checks a link. Links are never written to the log.
 */
object LinkForwarder {
    sealed class ForwardResult {
        data class Opened(val browserLabel: String) : ForwardResult()
        data class Failed(val browserLabel: String) : ForwardResult()
    }

    private const val TAG = "LinkForwarder"

    fun showBrowserChooser(activity: Activity, url: String, onFinished: () -> Unit) {
        val browsers = BrowserResolver.installedBrowsers(activity)
        if (browsers.isEmpty()) {
            Log.w(TAG, "No other browser is installed; cannot forward a link.")
            Toast.makeText(activity, LinkWarningCopy.forContext(activity).noBrowser, Toast.LENGTH_LONG).show()
            onFinished()
            return
        }

        val preferredPackage = BrowserPreferences.preferredBrowserPackage(activity)
        val initiallySelected = BrowserResolver.resolveTarget(activity, preferredPackage)
            ?.let { preferred -> browsers.indexOfFirst { it.packageName == preferred.packageName } }
            ?.takeIf { it >= 0 } ?: 0
        var selectedIndex = initiallySelected
        val copy = LinkWarningCopy.forContext(activity)
        AlertDialog.Builder(activity)
            .setTitle(copy.chooseBrowser)
            .setSingleChoiceItems(browsers.map { it.label }.toTypedArray(), initiallySelected) { _, which ->
                selectedIndex = which
            }
            .setNegativeButton(copy.cancel) { _, _ -> onFinished() }
            .setPositiveButton(copy.openBrowser) { _, _ ->
                when (val result = openInBrowser(activity, url, browsers[selectedIndex])) {
                    is ForwardResult.Failed ->
                        Toast.makeText(activity, copy.openFailed(result.browserLabel), Toast.LENGTH_LONG).show()
                    is ForwardResult.Opened -> Unit
                }
                onFinished()
            }
            .setOnCancelListener { onFinished() }
            .show()
    }

    private fun openInBrowser(context: Context, url: String, target: BrowserApp): ForwardResult {
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

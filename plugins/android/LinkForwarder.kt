package __NOTICARE_PACKAGE__.bridge

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import android.widget.Toast

/**
 * Opens checked links only after the user chooses. Links are never written to the log.
 */
object LinkForwarder {
    private const val TAG = "LinkForwarder"

    fun openPreferredBrowser(activity: Activity, url: String): Boolean {
        val copy = LinkWarningCopy.forContext(activity)
        val preferredPackage = BrowserPreferences.preferredBrowserPackage(activity)
        val target = BrowserResolver.resolveTarget(activity, preferredPackage)
        if (target == null) {
            Log.w(TAG, "No other browser is installed; cannot forward a link.")
            Toast.makeText(activity, copy.noBrowser, Toast.LENGTH_LONG).show()
            return false
        }

        return openInBrowser(activity, url, target)
    }

    /** Uses Android's native Open with sheet, excluding NotiCare to prevent a handler loop. */
    fun openWithSystemChooser(activity: Activity, url: String, requestCode: Int): Boolean {
        val copy = LinkWarningCopy.forContext(activity)
        val browsers = BrowserResolver.installedBrowsers(activity)
        if (browsers.isEmpty()) {
            Log.w(TAG, "No other browser is installed; cannot forward a link.")
            Toast.makeText(activity, copy.noBrowser, Toast.LENGTH_LONG).show()
            return false
        }
        val preferred = BrowserResolver.resolveTarget(
            activity,
            BrowserPreferences.preferredBrowserPackage(activity),
        )
        val orderedBrowsers = listOfNotNull(preferred) + browsers.filterNot {
            it.packageName == preferred?.packageName
        }
        val browserIntents = orderedBrowsers.map { browser ->
            Intent(Intent.ACTION_VIEW, Uri.parse(url))
                .addCategory(Intent.CATEGORY_BROWSABLE)
                .setPackage(browser.packageName)
        }
        val chooser = Intent.createChooser(
            browserIntents.first(),
            copy.chooseBrowser,
        )
        if (browserIntents.size > 1) {
            chooser.putExtra(
                Intent.EXTRA_INITIAL_INTENTS,
                browserIntents.drop(1).toTypedArray(),
            )
        }
        return try {
            activity.startActivityForResult(chooser, requestCode)
            true
        } catch (error: ActivityNotFoundException) {
            Log.w(TAG, "Android could not show the browser chooser.", error)
            Toast.makeText(activity, copy.noBrowser, Toast.LENGTH_LONG).show()
            false
        }
    }

    private fun openInBrowser(context: Context, url: String, target: BrowserApp): Boolean {
        val copy = LinkWarningCopy.forContext(context)
        val forwardIntent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            setPackage(target.packageName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return try {
            context.startActivity(forwardIntent)
            true
        } catch (error: ActivityNotFoundException) {
            Log.w(TAG, "Chosen browser ${target.packageName} could not open a link.", error)
            Toast.makeText(context, copy.openFailed(target.label), Toast.LENGTH_LONG).show()
            false
        }
    }
}

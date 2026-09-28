package __NOTICARE_PACKAGE__.bridge

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri

/** One browser app installed on the device that can open https links. */
data class BrowserApp(val packageName: String, val label: String)

/**
 * Finds the "real" browsers installed on the device — the ones a SAFE link
 * should actually open in, never this app itself.
 */
object BrowserResolver {
    private const val CHROME_PACKAGE = "com.android.chrome"

    /** Every installed app that can handle an https link, excluding NotiCare itself. */
    fun installedBrowsers(context: Context): List<BrowserApp> {
        val probeIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com"))
            .addCategory(Intent.CATEGORY_BROWSABLE)
        val packageManager = context.packageManager
        // MATCH_ALL is required: once NotiCare is the default browser, Android filters
        // web-intent query results down to just the default handler, which would leave
        // nothing after NotiCare excludes itself below.
        val resolved = packageManager.queryIntentActivities(probeIntent, PackageManager.MATCH_ALL)
        return resolved
            .map { it.activityInfo.packageName }
            .distinct()
            .filter { it != context.packageName }
            .map { packageName -> BrowserApp(packageName, appLabel(packageManager, packageName)) }
    }

    /**
     * The browser a SAFE link should open in: the user's saved choice if it's
     * still installed, otherwise Chrome if present, otherwise whichever
     * browser was found first. Null only if no browser at all is installed.
     */
    fun resolveTarget(context: Context, preferredPackage: String?): BrowserApp? {
        val browsers = installedBrowsers(context)
        if (browsers.isEmpty()) return null
        preferredPackage?.let { preferred -> browsers.find { it.packageName == preferred } }?.let { return it }
        browsers.find { it.packageName == CHROME_PACKAGE }?.let { return it }
        return browsers.first()
    }

    private fun appLabel(packageManager: PackageManager, packageName: String): String = try {
        packageManager.getApplicationLabel(packageManager.getApplicationInfo(packageName, 0)).toString()
    } catch (_: Exception) {
        packageName
    }
}

package __NOTICARE_PACKAGE__.bridge

import android.content.Context

/** The user's saved "open safe links in" browser choice, set from the app's settings screen. */
object BrowserPreferences {
    private const val PREFS_NAME = "noticare_browser_prefs"
    private const val KEY_PREFERRED_BROWSER = "preferred_browser_package"

    fun preferredBrowserPackage(context: Context): String? =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(KEY_PREFERRED_BROWSER, null)

    fun setPreferredBrowserPackage(context: Context, packageName: String?) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_PREFERRED_BROWSER, packageName)
            .apply()
    }
}

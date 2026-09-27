package __NOTICARE_PACKAGE__

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import __NOTICARE_PACKAGE__.bridge.BrowserPreferences
import __NOTICARE_PACKAGE__.bridge.BrowserResolver
import __NOTICARE_PACKAGE__.bridge.LinkForwarder

/**
 * Lets the Settings screen list installed browsers and choose which one gets
 * SAFE links, and lets the warning screen's "Open anyway" button forward a
 * SUSPICIOUS/DANGEROUS link the person chose to open despite the warning.
 */
class LinkHandlerModule(
    private val appContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(appContext) {
    override fun getName(): String = NAME

    @ReactMethod
    fun getInstalledBrowsers(promise: Promise) {
        try {
            val preferred = BrowserPreferences.preferredBrowserPackage(appContext)
            val resolvedDefault = BrowserResolver.resolveTarget(appContext, preferredPackage = null)
            val browsers: WritableArray = Arguments.createArray()
            BrowserResolver.installedBrowsers(appContext).forEach { browser ->
                browsers.pushMap(
                    Arguments.createMap().apply {
                        putString("packageName", browser.packageName)
                        putString("label", browser.label)
                        val isPreferred = if (preferred != null) {
                            browser.packageName == preferred
                        } else {
                            browser.packageName == resolvedDefault?.packageName
                        }
                        putBoolean("isPreferred", isPreferred)
                    },
                )
            }
            promise.resolve(browsers)
        } catch (error: Exception) {
            promise.reject("browsers_unavailable", "Unable to list installed browsers.", error)
        }
    }

    @ReactMethod
    fun setPreferredBrowser(packageName: String, promise: Promise) {
        try {
            BrowserPreferences.setPreferredBrowserPackage(appContext, packageName)
            promise.resolve(true)
        } catch (error: Exception) {
            promise.reject("preferred_browser_failed", "Unable to save the preferred browser.", error)
        }
    }

    /** Forwards a link the user explicitly chose to open despite NotiCare's warning. */
    @ReactMethod
    fun openInRealBrowser(url: String, promise: Promise) {
        when (val result = LinkForwarder.openInRealBrowser(appContext, url)) {
            is LinkForwarder.ForwardResult.Opened -> promise.resolve(true)
            is LinkForwarder.ForwardResult.NoBrowserInstalled ->
                promise.reject("no_browser_installed", "No other browser is installed on this device.")
            is LinkForwarder.ForwardResult.Failed ->
                promise.reject("open_failed", "Could not open this link in ${result.browserLabel}.")
        }
    }

    companion object {
        const val NAME = "LinkHandlerModule"
    }
}

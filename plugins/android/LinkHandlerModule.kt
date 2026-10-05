package __NOTICARE_PACKAGE__

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import __NOTICARE_PACKAGE__.bridge.BrowserPreferences
import __NOTICARE_PACKAGE__.bridge.BrowserResolver
import __NOTICARE_PACKAGE__.bridge.DefaultBrowserStatus

/**
 * Lets the Settings screen list installed browsers, choose which one gets
 * SAFE links, and make NotiCare the default browser so tapped links are checked.
 */
class LinkHandlerModule(
    private val appContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(appContext) {
    private var pendingRoleRequest: Promise? = null

    private val roleResultListener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode != ROLE_REQUEST_CODE) return
            val promise = pendingRoleRequest ?: return
            pendingRoleRequest = null
            promise.resolve(if (DefaultBrowserStatus.isDefaultBrowser(appContext)) "granted" else "declined")
        }
    }

    init {
        appContext.addActivityEventListener(roleResultListener)
    }

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

    /** Whether NotiCare is currently the device's default browser. */
    @ReactMethod
    fun isDefaultBrowser(promise: Promise) {
        try {
            promise.resolve(DefaultBrowserStatus.isDefaultBrowser(appContext))
        } catch (error: Exception) {
            promise.reject("default_browser_status_failed", "Unable to read default browser status.", error)
        }
    }

    /**
     * Asks Android to make NotiCare the default browser. Resolves "granted" or "declined" from
     * Android 10+'s dialog, or "settings" when it opened the Default apps screen instead (Android 9
     * and older, or when the dialog can't be shown).
     */
    @ReactMethod
    fun requestDefaultBrowser(promise: Promise) {
        try {
            if (DefaultBrowserStatus.isDefaultBrowser(appContext)) {
                promise.resolve("granted")
                return
            }
            val activity = appContext.currentActivity
            val roleIntent = DefaultBrowserStatus.roleRequestIntent(appContext)
            if (activity == null || roleIntent == null) {
                DefaultBrowserStatus.openDefaultAppsSettings(appContext)
                promise.resolve("settings")
                return
            }
            // A second tap before the first dialog answers settles the earlier request.
            pendingRoleRequest?.resolve("declined")
            pendingRoleRequest = promise
            activity.startActivityForResult(roleIntent, ROLE_REQUEST_CODE)
        } catch (error: Exception) {
            pendingRoleRequest = null
            promise.reject("default_browser_request_failed", "Unable to open default browser settings.", error)
        }
    }

    /** Opens Android's Default apps screen, to change or pick the default browser by hand. */
    @ReactMethod
    fun openDefaultAppsSettings(promise: Promise) {
        try {
            DefaultBrowserStatus.openDefaultAppsSettings(appContext)
            promise.resolve(true)
        } catch (error: Exception) {
            promise.reject("default_apps_settings_failed", "Unable to open default apps settings.", error)
        }
    }

    companion object {
        const val NAME = "LinkHandlerModule"
        private const val ROLE_REQUEST_CODE = 41_207
    }
}

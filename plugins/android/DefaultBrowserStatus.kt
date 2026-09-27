package __NOTICARE_PACKAGE__.bridge

import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings

/**
 * Whether NotiCare is currently set as the device's default browser, and how
 * to ask Android to change that. Android 10+ has a real "browser" role;
 * older versions only expose a general default-apps settings screen, so
 * status there is inferred from whichever app currently resolves a generic
 * https link.
 */
object DefaultBrowserStatus {
    fun isDefaultBrowser(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val roleManager = context.getSystemService(Context.ROLE_SERVICE) as? RoleManager
            return roleManager?.isRoleAvailable(RoleManager.ROLE_BROWSER) == true &&
                roleManager.isRoleHeld(RoleManager.ROLE_BROWSER)
        }
        val probeIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com"))
        val resolved = context.packageManager.resolveActivity(probeIntent, PackageManager.MATCH_DEFAULT_ONLY)
        return resolved?.activityInfo?.packageName == context.packageName
    }

    /** Whether [requestDefaultBrowser] has anything meaningful to launch on this OS version. */
    fun canRequestDefaultBrowser(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val roleManager = context.getSystemService(Context.ROLE_SERVICE) as? RoleManager
            return roleManager?.isRoleAvailable(RoleManager.ROLE_BROWSER) == true
        }
        // ACTION_MANAGE_DEFAULT_APPS_SETTINGS exists from API 24, this app's minimum.
        return true
    }

    /**
     * Opens the right system UI for the user to make NotiCare their default
     * browser: Android 10+'s direct role request dialog, or the general
     * default-apps settings screen on older versions.
     */
    fun requestDefaultBrowser(context: Context) {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val roleManager = context.getSystemService(Context.ROLE_SERVICE) as RoleManager
            roleManager.createRequestRoleIntent(RoleManager.ROLE_BROWSER)
        } else {
            Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS)
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }
}

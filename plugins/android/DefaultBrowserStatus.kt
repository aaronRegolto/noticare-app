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

    /**
     * Android 10+'s "Set NotiCare as your default browser app?" dialog, or null where there is no
     * browser role. It must be started with startActivityForResult from an Activity: started any
     * other way, Android can't tell which app is asking and closes it without showing anything.
     */
    fun roleRequestIntent(context: Context): Intent? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
        val roleManager = context.getSystemService(Context.ROLE_SERVICE) as? RoleManager ?: return null
        if (!roleManager.isRoleAvailable(RoleManager.ROLE_BROWSER)) return null
        return roleManager.createRequestRoleIntent(RoleManager.ROLE_BROWSER)
    }

    /**
     * Android's Default apps screen, where the user can pick the browser themselves. Used on
     * Android 9 and older, and after the user has declined the dialog (Android then stops showing it).
     */
    fun openDefaultAppsSettings(context: Context) {
        context.startActivity(Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

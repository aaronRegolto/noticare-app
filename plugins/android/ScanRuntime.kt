package __NOTICARE_PACKAGE__.bridge

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.provider.Telephony

/** Process-local diagnostics only. Nothing here contains SMS text or sender data. */
object ScanRuntime {
  @Volatile private var listenerConnected = false
  @Volatile private var lastContentStatus = "idle"
  @Volatile private var storageStatus = "available"

  fun onListenerConnected() {
    listenerConnected = true
  }

  fun onListenerDisconnected() {
    listenerConnected = false
  }

  fun isListenerConnected(): Boolean = listenerConnected

  fun markContentUnavailable() {
    lastContentStatus = "content_unavailable"
  }

  fun markProcessed() {
    lastContentStatus = "processed"
  }

  fun lastContentStatus(): String = lastContentStatus

  fun markStorageUnavailable() {
    storageStatus = "unavailable"
  }

  fun storageStatus(): String = storageStatus

  fun hasNotificationAccess(context: Context): Boolean {
    val enabled = Settings.Secure.getString(
      context.contentResolver,
      "enabled_notification_listeners",
    ).orEmpty()

    return enabled.split(':')
      .mapNotNull(ComponentName::unflattenFromString)
      .any { component -> component.packageName == context.packageName }
  }

  fun defaultSmsPackage(context: Context): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.KITKAT) return null
    val telephonyPackage = Telephony.Sms.getDefaultSmsPackage(context)?.takeIf { it.isNotBlank() }
    if (telephonyPackage != null) return telephonyPackage

    return runCatching {
      context.packageManager
        .resolveActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:")), 0)
        ?.activityInfo
        ?.packageName
        ?.takeIf { it.isNotBlank() }
    }.getOrNull()
  }

  fun defaultSmsAppLabel(context: Context, packageName: String?): String? {
    val target = packageName ?: return null
    return runCatching {
      val applicationInfo = context.packageManager.getApplicationInfo(target, 0)
      context.packageManager.getApplicationLabel(applicationInfo).toString()
    }.getOrNull()
  }
}

package __NOTICARE_PACKAGE__.bridge

import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.provider.Telephony
import android.service.notification.NotificationListenerService

/** Process-local diagnostics only. Nothing here contains SMS text or sender data. */
object ScanRuntime {
  @Volatile private var listenerConnected = false
  @Volatile private var lastContentStatus = "idle"
  @Volatile private var storageStatus = "available"
  @Volatile private var lastRebindAttemptAt = 0L
  private const val REBIND_COOLDOWN_MS = 15_000L

  fun onListenerConnected() {
    listenerConnected = true
  }

  fun onListenerDisconnected() {
    listenerConnected = false
  }

  fun isListenerConnected(): Boolean = listenerConnected

  /**
   * Self-heals a stuck "Service disconnected" status. Android does not always
   * re-invoke onListenerConnected() after this process is killed and restarted,
   * even though the system still considers the listener bound — so without
   * forcing a fresh bind here, the app could keep reporting disconnected
   * indefinitely despite notifications actually still being deliverable.
   * Throttled so a UI polling this status repeatedly cannot spam system_server.
   */
  fun requestListenerRebindIfStale(context: Context, listenerClass: Class<*>) {
    if (listenerConnected) return
    val now = System.currentTimeMillis()
    if (now - lastRebindAttemptAt < REBIND_COOLDOWN_MS) return
    lastRebindAttemptAt = now
    runCatching { NotificationListenerService.requestRebind(ComponentName(context, listenerClass)) }
  }

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

  /**
   * OEM battery managers (notably ColorOS/Realme, and similar on other brands)
   * kill backgrounded apps that are not exempt from battery optimization. When
   * that happens, Android restarts this bound listener service automatically,
   * but with growing backoff delay — during that gap, incoming SMS
   * notifications are silently missed. Requesting this exemption is the one
   * mitigation available from the app itself.
   */
  fun isIgnoringBatteryOptimizations(context: Context): Boolean {
    val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return true
    return powerManager.isIgnoringBatteryOptimizations(context.packageName)
  }

  /**
   * Android 14+ lets the user revoke an app's ability to launch a full-screen danger warning from
   * a notification (Settings > Apps > Special app access > Full screen notifications). When
   * revoked, the warning silently falls back to a heads-up banner only. Below Android 14 this
   * permission is granted automatically to any app that declares it, so this always returns true.
   */
  fun canUseFullScreenIntent(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true
    val manager = context.getSystemService(NotificationManager::class.java) ?: return true
    return manager.canUseFullScreenIntent()
  }

  /**
   * Whether NotiCare's danger alerts can sound/vibrate even while the phone is in Do Not Disturb.
   * Requires the user to grant Notification Policy Access (Settings > Apps > Special app access >
   * Do Not Disturb access); until granted, the alarm-style channel settings are silently ignored
   * and a Dangerous-message alert stays silent under DND like a normal notification.
   */
  fun canBypassDnd(context: Context): Boolean {
    val manager = context.getSystemService(NotificationManager::class.java) ?: return false
    return manager.isNotificationPolicyAccessGranted
  }

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

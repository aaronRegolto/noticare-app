package __NOTICARE_PACKAGE__

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import java.io.IOException
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import __NOTICARE_PACKAGE__.bridge.BlockedHistoryRecord
import __NOTICARE_PACKAGE__.bridge.EncryptedCommunityReportQueue
import __NOTICARE_PACKAGE__.bridge.EncryptedHistoryStore
import __NOTICARE_PACKAGE__.bridge.EncryptedTelemetryQueue
import __NOTICARE_PACKAGE__.bridge.ExtractedUrl
import __NOTICARE_PACKAGE__.bridge.NotiCareNotifications
import __NOTICARE_PACKAGE__.bridge.RealtimeScanPreferences
import __NOTICARE_PACKAGE__.bridge.ScanRuntime
import __NOTICARE_PACKAGE__.bridge.SmishingEvaluator
import __NOTICARE_PACKAGE__.bridge.SmsNotificationListener
import __NOTICARE_PACKAGE__.bridge.ThreatReason
import __NOTICARE_PACKAGE__.bridge.ThreatResult
import __NOTICARE_PACKAGE__.bridge.ThreatWarningOverlay
import __NOTICARE_PACKAGE__.bridge.V3RiskEvaluator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Narrow JavaScript bridge for status and user-initiated local-History actions.
 * No listener callback transports SMS text through React Native.
 */
class NotificationListenerModule(
  private val appContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(appContext) {
  private val bridgeScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  override fun getName(): String = NAME

  override fun invalidate() {
    bridgeScope.cancel()
    super.invalidate()
  }

  @ReactMethod
  fun requestNotificationListenerAccess(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      appContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("notification_settings_unavailable", "Unable to open Android Notification Access settings.", error)
    }
  }

  /**
   * Opens the system screen where the user can let NotiCare's danger alerts sound/vibrate even
   * while the phone is in Do Not Disturb. Without this, a Dangerous-message alert stays silent
   * under DND like any other notification.
   */
  @ReactMethod
  fun requestNotificationPolicyAccess(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      appContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject(
        "notification_policy_settings_unavailable",
        "Unable to open Do Not Disturb access settings.",
        error,
      )
    }
  }

  @ReactMethod
  fun openAppNotificationSettings(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
        putExtra(Settings.EXTRA_APP_PACKAGE, appContext.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      appContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("app_notification_settings_unavailable", "Unable to open Android notification settings.", error)
    }
  }

  /**
   * Opens NotiCare's App info screen, where the user can set Battery to "Unrestricted".
   * Without that, OEM battery managers can kill NotiCare in the background and miss incoming
   * SMS notifications until Android restarts the listener service.
   *
   * Deliberately avoids ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS: that direct prompt needs
   * the REQUEST_IGNORE_BATTERY_OPTIMIZATIONS permission, which Google Play restricts to a short
   * list of app types. Falls back to the system-wide battery optimization list.
   */
  @ReactMethod
  fun requestIgnoreBatteryOptimizations(promise: Promise) {
    try {
      val appInfo = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.parse("package:${appContext.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      val intent = if (appInfo.resolveActivity(appContext.packageManager) != null) {
        appInfo
      } else {
        Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      appContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject(
        "battery_optimization_settings_unavailable",
        "Unable to open Android battery optimization settings.",
        error,
      )
    }
  }

  /**
   * Opens the Android 14+ screen where the user can re-allow full-screen danger warnings for
   * NotiCare. Resolves false (never throws) below Android 14, where there is nothing to open.
   */
  @ReactMethod
  fun requestFullScreenIntentPermission(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      promise.resolve(false)
      return
    }
    try {
      val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
        data = Uri.parse("package:${appContext.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      appContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject(
        "full_screen_intent_settings_unavailable",
        "Unable to open Android full-screen notification settings.",
        error,
      )
    }
  }

  /**
   * Opens Android's "Display over other apps" screen for NotiCare, which lets the full-screen
   * warning cover whatever app is in use when a threat is detected.
   */
  @ReactMethod
  fun requestOverlayPermission(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
        data = Uri.parse("package:${appContext.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      appContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("overlay_settings_unavailable", "Unable to open Android display-over-other-apps settings.", error)
    }
  }

  @ReactMethod
  fun getMonitoringStatus(promise: Promise) {
    bridgeScope.launch {
      runCatching { monitoringStatusMap() }
        .onSuccess(promise::resolve)
        .onFailure { error -> promise.reject("monitoring_status_failed", "Unable to read monitoring status.", error) }
    }
  }

  @ReactMethod
  fun setScanningEnabled(enabled: Boolean, promise: Promise) {
    bridgeScope.launch {
      runCatching {
        RealtimeScanPreferences.setScanningEnabled(appContext, enabled)
        monitoringStatusMap()
      }.onSuccess(promise::resolve)
        .onFailure { error -> promise.reject("scanning_preference_failed", "Unable to save the real-time scanning preference.", error) }
    }
  }

  @ReactMethod
  fun setFullScreenWarnings(enabled: Boolean, promise: Promise) {
    bridgeScope.launch {
      runCatching {
        RealtimeScanPreferences.setFullScreenWarnings(appContext, enabled)
        monitoringStatusMap()
      }.onSuccess(promise::resolve)
        .onFailure { error -> promise.reject("warning_style_preference_failed", "Unable to save the warning style.", error) }
    }
  }

  /**
   * Associates encrypted History with the signed-in profile without persisting
   * that profile's raw identifier. Passing null clears the owner and disables
   * scanning so a shared signed-out device cannot save a new raw SMS record.
   */
  @ReactMethod
  fun setHistoryOwner(ownerId: String?, promise: Promise) {
    bridgeScope.launch {
      runCatching {
        RealtimeScanPreferences.setHistoryOwner(appContext, ownerId)
        monitoringStatusMap()
      }.onSuccess(promise::resolve)
        .onFailure { error -> promise.reject("history_owner_failed", "Unable to update the protected History owner.", error) }
    }
  }

  /** Mirrors the RevenueCat-derived tier into native so the real-time listener can enforce it offline. */
  @ReactMethod
  fun setSubscriptionTier(tier: String, promise: Promise) {
    val normalized = tier.takeIf { it in setOf("free", "pro") } ?: "free"
    bridgeScope.launch {
      runCatching {
        RealtimeScanPreferences.setSubscriptionTier(appContext, normalized)
        monitoringStatusMap()
      }.onSuccess(promise::resolve)
        .onFailure { error -> promise.reject("subscription_tier_failed", "Unable to update the subscription tier.", error) }
    }
  }

  @ReactMethod
  fun scanText(text: String, promise: Promise) {
    bridgeScope.launch {
      runCatching { threatResultMap(V3RiskEvaluator.evaluate(appContext, text)) }
        .onSuccess(promise::resolve)
        .onFailure { error -> promise.reject("manual_scan_failed", "Unable to scan this message locally.", error) }
    }
  }

  /**
   * Reads the text in a photo or screenshot the user picked for Manual Scan, with ML Kit's bundled
   * on-device model. Nothing is uploaded, logged, or stored; the app deletes the image afterwards.
   * Resolves { blocks: [{ lines: [...] }] } in reading order, capped at the Manual Scan input limit.
   */
  @ReactMethod
  fun recognizeTextInImage(uri: String, promise: Promise) {
    bridgeScope.launch {
      runCatching {
        val image = InputImage.fromFilePath(appContext, Uri.parse(uri))
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        try {
          recognizedTextMap(Tasks.await(recognizer.process(image)))
        } finally {
          recognizer.close()
        }
      }.onSuccess(promise::resolve)
        .onFailure { error ->
          if (error is IOException || error is IllegalArgumentException) {
            promise.reject("image_unreadable", "Unable to open this image.", error)
          } else {
            promise.reject("text_recognition_failed", "Unable to read text in this image.", error)
          }
        }
    }
  }

  @ReactMethod
  fun getHistory(promise: Promise) {
    bridgeScope.launch {
      runCatching {
        Arguments.createArray().apply {
          val ownerScope = RealtimeScanPreferences.historyOwnerScope(appContext)
          if (ownerScope != null) {
            EncryptedHistoryStore.list(appContext, ownerScope).forEach { pushMap(historyListMap(it)) }
          }
        }
      }.onSuccess(promise::resolve)
        .onFailure { error ->
          ScanRuntime.markStorageUnavailable()
          promise.reject("history_unavailable", "Protected local History is unavailable on this device.", error)
        }
    }
  }

  @ReactMethod
  fun getHistoryRecord(id: String, promise: Promise) {
    bridgeScope.launch {
      runCatching {
        RealtimeScanPreferences.historyOwnerScope(appContext)
          ?.let { ownerScope -> EncryptedHistoryStore.find(appContext, id, ownerScope) }
          ?.let(::historyDetailMap)
      }.onSuccess(promise::resolve)
        .onFailure { error ->
          ScanRuntime.markStorageUnavailable()
          promise.reject("history_record_unavailable", "Unable to open this protected History record.", error)
        }
    }
  }

  @ReactMethod
  fun markHistoryRead(id: String, promise: Promise) {
    bridgeScope.launch {
      runCatching {
        RealtimeScanPreferences.historyOwnerScope(appContext)
          ?.let { ownerScope -> EncryptedHistoryStore.markRead(appContext, id, ownerScope) }
          ?: false
      }.onSuccess(promise::resolve)
        .onFailure { error -> promise.reject("history_read_failed", "Unable to mark this message as read.", error) }
    }
  }

  @ReactMethod
  fun deleteHistoryRecord(id: String, promise: Promise) {
    bridgeScope.launch {
      runCatching {
        RealtimeScanPreferences.historyOwnerScope(appContext)
          ?.let { ownerScope -> EncryptedHistoryStore.delete(appContext, id, ownerScope) }
          ?: false
      }
        .onSuccess(promise::resolve)
        .onFailure { error -> promise.reject("history_delete_failed", "Unable to delete this History record.", error) }
    }
  }

  @ReactMethod
  fun clearHistory(promise: Promise) {
    bridgeScope.launch {
      runCatching {
        RealtimeScanPreferences.historyOwnerScope(appContext)
          ?.let { ownerScope -> EncryptedHistoryStore.clear(appContext, ownerScope); true }
          ?: false
      }.onSuccess(promise::resolve)
        .onFailure { error -> promise.reject("history_clear_failed", "Unable to clear protected local History.", error) }
    }
  }

  @ReactMethod
  fun getPendingTelemetry(promise: Promise) {
    bridgeScope.launch {
      runCatching {
        Arguments.createArray().apply {
          EncryptedTelemetryQueue.claimPending(appContext).forEach { event ->
            pushMap(Arguments.createMap().apply {
              putString("id", event.id)
              putString("source", event.source)
              putString("level", event.level)
              putInt("scoreBucket", event.scoreBucket)
              putBoolean("blocked", event.blocked)
              putArray("indicatorCodes", Arguments.createArray().apply { event.indicatorCodes.forEach(::pushString) })
              putInt("urlCount", event.urlCount)
              putString("ruleVersion", event.ruleVersion)
              putDouble("occurredAt", event.occurredAt.toDouble())
            })
          }
        }
      }.onSuccess(promise::resolve)
        .onFailure { error -> promise.reject("telemetry_queue_unavailable", "Unable to read the local privacy-safe telemetry queue.", error) }
    }
  }

  @ReactMethod
  fun ackTelemetry(ids: ReadableArray, promise: Promise) {
    bridgeScope.launch {
      runCatching {
        val acknowledged = buildSet {
          for (index in 0 until ids.size()) ids.getString(index)?.takeIf { it.isNotBlank() }?.let(::add)
        }
        EncryptedTelemetryQueue.acknowledge(appContext, acknowledged)
      }.onSuccess { removed -> promise.resolve(removed) }
        .onFailure { error -> promise.reject("telemetry_ack_failed", "Unable to acknowledge uploaded telemetry events.", error) }
    }
  }

  /**
   * Reads "Block & Report" taps queued by the real-time listener while the app
   * was closed or offline. Unlike getPendingTelemetry, this intentionally
   * includes message text and sender — see EncryptedCommunityReportQueue.
   */
  @ReactMethod
  fun getPendingCommunityReports(promise: Promise) {
    bridgeScope.launch {
      runCatching {
        Arguments.createArray().apply {
          EncryptedCommunityReportQueue.claimPending(appContext).forEach { report ->
            pushMap(Arguments.createMap().apply {
              putString("id", report.id)
              putString("messageText", report.messageText)
              putNullableString("sampleSender", report.sampleSender)
              putArray("indicatorCodes", Arguments.createArray().apply { report.indicatorCodes.forEach(::pushString) })
              putString("ruleVersion", report.ruleVersion)
              report.riskScore?.let { putInt("riskScore", it) } ?: putNull("riskScore")
              putDouble("createdAt", report.createdAt.toDouble())
            })
          }
        }
      }.onSuccess(promise::resolve)
        .onFailure { error -> promise.reject("community_report_queue_unavailable", "Unable to read the local community report queue.", error) }
    }
  }

  @ReactMethod
  fun ackCommunityReports(ids: ReadableArray, promise: Promise) {
    bridgeScope.launch {
      runCatching {
        val acknowledged = buildSet {
          for (index in 0 until ids.size()) ids.getString(index)?.takeIf { it.isNotBlank() }?.let(::add)
        }
        EncryptedCommunityReportQueue.acknowledge(appContext, acknowledged)
      }.onSuccess { removed -> promise.resolve(removed) }
        .onFailure { error -> promise.reject("community_report_ack_failed", "Unable to acknowledge uploaded community reports.", error) }
    }
  }

  /** Shows the async follow-up telling the user whether their reported message was new. */
  @ReactMethod
  fun notifyCommunityReportResult(isNew: Boolean, reportCount: Int, promise: Promise) {
    runCatching {
      NotiCareNotifications.showCommunityReportResult(appContext, isNew, reportCount)
    }.onSuccess { promise.resolve(true) }
      .onFailure { error -> promise.reject("community_report_notify_failed", "Unable to show the community report result.", error) }
  }

  private suspend fun monitoringStatusMap(): WritableMap {
    val enabled = RealtimeScanPreferences.isScanningEnabled(appContext)
    val accessGranted = ScanRuntime.hasNotificationAccess(appContext)
    val serviceConnected = ScanRuntime.isListenerConnected()
    if (enabled && accessGranted && !serviceConnected) {
      ScanRuntime.requestListenerRebindIfStale(appContext, SmsNotificationListener::class.java)
    }
    val defaultSmsPackage = ScanRuntime.defaultSmsPackage(appContext)
    val status = when {
      !enabled -> "off"
      !accessGranted -> "permission_required"
      !serviceConnected -> "service_disconnected"
      defaultSmsPackage == null -> "sms_app_unavailable"
      else -> "active"
    }

    val historyOwnerScope = RealtimeScanPreferences.historyOwnerScope(appContext)
    val subscriptionTier = RealtimeScanPreferences.subscriptionTier(appContext)

    return Arguments.createMap().apply {
      putString("status", status)
      putString("subscriptionTier", subscriptionTier)
      putBoolean("scanningEnabled", enabled)
      putBoolean("fullScreenWarnings", RealtimeScanPreferences.useFullScreenWarnings(appContext))
      putBoolean("notificationAccessGranted", accessGranted)
      putBoolean("serviceConnected", serviceConnected)
      putNullableString("defaultSmsPackage", defaultSmsPackage)
      putNullableString("defaultSmsAppName", ScanRuntime.defaultSmsAppLabel(appContext, defaultSmsPackage))
      putBoolean("historyOwnerConfigured", historyOwnerScope != null)
      putBoolean("historyStorageAvailable", EncryptedHistoryStore.storageAvailable(appContext))
      putString("historyStorageStatus", ScanRuntime.storageStatus())
      putString("lastContentStatus", ScanRuntime.lastContentStatus())
      putBoolean("batteryOptimizationExempt", ScanRuntime.isIgnoringBatteryOptimizations(appContext))
      putBoolean("fullScreenIntentPermitted", ScanRuntime.canUseFullScreenIntent(appContext))
      putBoolean("overlayPermitted", ThreatWarningOverlay.canDrawOverlays(appContext))
      putBoolean("dndBypassGranted", ScanRuntime.canBypassDnd(appContext))
      // The true all-time count, independent of how many detail records are currently retained
      // (older ones are pruned past historyRetentionLimit) — see EncryptedHistoryStore for why.
      putInt("lifetimeBlockedCount", historyOwnerScope?.let { EncryptedHistoryStore.lifetimeBlockedCount(appContext, it) } ?: 0)
      putInt("historyRetentionLimit", EncryptedHistoryStore.retentionLimitPerAccount(subscriptionTier))
      putBoolean(
        "appNotificationsGranted",
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
          appContext.checkSelfPermission("android.permission.POST_NOTIFICATIONS") == android.content.pm.PackageManager.PERMISSION_GRANTED,
      )
    }
  }

  private fun historyListMap(record: BlockedHistoryRecord): WritableMap = Arguments.createMap().apply {
    putString("id", record.id)
    putString("maskedSender", EncryptedHistoryStore.maskedSender(record.sender))
    putString("sender", record.sender ?: "Unknown sender")
    putString("preview", record.message.replace(Regex("\\s+"), " ").take(160))
    putBoolean("blocked", record.blocked)
    putBoolean("isRead", record.isRead)
    putDouble("receivedAt", record.receivedAt.toDouble())
    putString("level", record.level.wireValue)
    putInt("score", record.score)
    // Preserve the old label for older JS bundles; the new inbox uses preview.
    putString("redactedPreview", record.redactedPreview)
    putInt("warningSignCount", record.reasons.size)
    putString("sourcePackage", record.sourcePackage)
    putString("ruleVersion", record.ruleVersion)
  }

  private fun historyDetailMap(record: BlockedHistoryRecord): WritableMap = historyListMap(record).apply {
    // Full content is decrypted only when the person explicitly opens this item.
    putString("message", record.message)
    putArray("reasons", reasonsArray(record.reasons))
    putArray("urls", urlsArray(record.urls))
    putString("originalSmsNotice", if (record.blocked)
      "NotiCare suppressed this notification. It did not delete the original SMS from your Messages app."
      else "Captured from your Messages app notification. NotiCare did not suppress this notification or delete the original SMS.")
  }

  private fun threatResultMap(result: ThreatResult): WritableMap = Arguments.createMap().apply {
    putString("level", result.level.wireValue)
    putInt("score", result.score)
    putArray("reasons", reasonsArray(result.reasons))
    putArray("urls", urlsArray(result.urls))
    putString("ruleVersion", result.ruleVersion)
  }

  private fun reasonsArray(reasons: List<ThreatReason>): WritableArray = Arguments.createArray().apply {
    reasons.forEach { reason ->
      pushMap(Arguments.createMap().apply {
        putString("code", reason.code)
        putString("label", reason.label)
        putString("description", reason.description)
        putInt("weight", reason.weight)
      })
    }
  }

  private fun urlsArray(urls: List<ExtractedUrl>): WritableArray = Arguments.createArray().apply {
    urls.forEach { url ->
      pushMap(Arguments.createMap().apply {
        putString("display", url.display)
        putNullableString("normalizedDomain", url.normalizedDomain)
        putArray("indicators", Arguments.createArray().apply { url.indicators.forEach(::pushString) })
      })
    }
  }

  private fun WritableMap.putNullableString(name: String, value: String?) {
    if (value == null) putNull(name) else putString(name, value)
  }

  private fun recognizedTextMap(text: Text): WritableMap {
    val blocks = Arguments.createArray()
    var remaining = MAX_RECOGNIZED_CHARACTERS
    for (block in text.textBlocks) {
      if (remaining <= 0) break
      val lines = Arguments.createArray()
      for (line in block.lines) {
        if (remaining <= 0) break
        val value = line.text.trim()
        if (value.isEmpty()) continue
        lines.pushString(value.take(remaining))
        remaining -= value.length
      }
      if (lines.size() > 0) blocks.pushMap(Arguments.createMap().apply { putArray("lines", lines) })
    }
    return Arguments.createMap().apply { putArray("blocks", blocks) }
  }

  companion object {
    const val NAME = "NotificationListenerModule"
    // Matches Manual Scan's input limit; anything past it would be cut off in the text box anyway.
    private const val MAX_RECOGNIZED_CHARACTERS = 12_000
  }
}

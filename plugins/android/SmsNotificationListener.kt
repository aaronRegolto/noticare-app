package __NOTICARE_PACKAGE__.bridge

import android.app.Notification
import android.content.ComponentName
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import java.security.MessageDigest
import java.util.Locale
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.util.UUID

data class PendingThreat(
  val token: String,
  val notificationKey: String,
  val sender: String?,
  val message: String,
  val sourcePackage: String,
  val postedAt: Long,
  val result: ThreatResult,
  val ownerScope: String,
  val recordId: String?,
  // A repeat of a message the user already blocked: the warning only explains the score and has
  // no Block & Report / Ignore choice.
  val reviewOnly: Boolean = false,
)

object ThreatDecisionCoordinator {
  private const val maxPending = 32
  private val pending = LinkedHashMap<String, PendingThreat>()
  @Volatile private var listener: SmsNotificationListener? = null

  @Synchronized fun attach(service: SmsNotificationListener) { listener = service }
  @Synchronized fun detach(service: SmsNotificationListener) { if (listener === service) listener = null }
  @Synchronized fun add(threat: PendingThreat) {
    pending[threat.token] = threat
    while (pending.size > maxPending) pending.remove(pending.entries.first().key)
  }
  @Synchronized fun get(token: String): PendingThreat? = pending[token]
  @Synchronized fun dismiss(token: String) { pending.remove(token) }
  @Synchronized fun decide(token: String, block: Boolean): Boolean {
    val threat = pending.remove(token) ?: return false
    // Already blocked and reported once; never block, report, or count it again.
    if (threat.reviewOnly) return false
    val service = listener ?: return false
    service.applyDecision(threat, block)
    return true
  }
}

/**
 * Android invokes this service even while the React Native UI is closed. The
 * default-SMS package comparison intentionally happens before notification
 * extras are accessed, so unrelated application notifications are not read.
 */
class SmsNotificationListener : NotificationListenerService() {
  private val scanScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val logTag = "NotiCareListener"

  override fun onCreate() {
    super.onCreate()
    NotiCareNotifications.ensureChannels(this)
    ThreatDecisionCoordinator.attach(this)
    // Android does not reliably re-invoke onListenerConnected() after this process is
    // killed and restarted (for example under memory pressure) even though the system
    // still considers the listener bound. Without a fresh bind, ScanRuntime's connected
    // flag would stay false forever in the new process, showing "Service disconnected"
    // even though notifications are actually still flowing. requestRebind() forces
    // Android to tear down and recreate the binding, which reliably re-fires
    // onListenerConnected() for this process.
    requestRebind(ComponentName(this, SmsNotificationListener::class.java))
  }

  override fun onListenerConnected() {
    super.onListenerConnected()
    ScanRuntime.onListenerConnected()
  }

  override fun onListenerDisconnected() {
    ScanRuntime.onListenerDisconnected()
    super.onListenerDisconnected()
  }

  override fun onDestroy() {
    ThreatDecisionCoordinator.detach(this)
    ScanRuntime.onListenerDisconnected()
    scanScope.cancel()
    super.onDestroy()
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    super.onNotificationPosted(sbn)
    Log.d(logTag, "onNotificationPosted pkg=${sbn.packageName}")
    scanScope.launch { processPostedNotification(sbn) }
  }

  private suspend fun processPostedNotification(sbn: StatusBarNotification) {
    // 1. The persisted switch is checked before package/content processing.
    if (!RealtimeScanPreferences.isScanningEnabled(applicationContext)) {
      Log.d(logTag, "drop: scanning disabled")
      return
    }
    val ownerScope = RealtimeScanPreferences.historyOwnerScope(applicationContext)
    if (ownerScope == null) {
      Log.d(logTag, "drop: no signed-in owner scope")
      return
    }

    // 2. Resolve the device's current default SMS provider for every event.
    // This automatically handles default-Messages-app changes.
    val defaultSmsPackage = ScanRuntime.defaultSmsPackage(applicationContext)
    if (defaultSmsPackage == null) {
      Log.d(logTag, "drop: no default SMS package resolved")
      return
    }
    val sourcePackage = sbn.packageName ?: return

    // 3. Reject all non-default-SMS and NotiCare notifications BEFORE extras.
    if (sourcePackage != defaultSmsPackage || sourcePackage == packageName) {
      Log.d(logTag, "drop: source=$sourcePackage default=$defaultSmsPackage")
      return
    }

    val notification = sbn.notification ?: return
    if ((notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0) {
      Log.d(logTag, "drop: group summary notification")
      return
    }

    // Extras are intentionally read only after the package guard above.
    val text = runCatching { NotificationTextExtractor.extractText(notification) }.getOrNull()
    if (text.isNullOrBlank()) {
      Log.d(logTag, "drop: no readable text extras (hidden/redacted preview?)")
      ScanRuntime.markContentUnavailable()
      return
    }

    val sender = runCatching { NotificationTextExtractor.extractSender(notification) }.getOrNull()
    if (sender.isNullOrBlank()) {
      // Real SMS/RCS notifications always carry a contact name or number as the
      // title. A missing sender means this is an app-status notification (sync,
      // background work, RCS setup, etc.), not an actual message — skip it so it
      // doesn't get scanned and logged to History as an "Unknown sender" message.
      Log.d(logTag, "drop: no sender extracted (likely a non-message status notification)")
      return
    }
    val fingerprint = fingerprint("$sourcePackage\n${sender.orEmpty()}", text)
    if (NotificationDeduplicator.isDuplicate(sbn.key, fingerprint)) {
      Log.d(logTag, "drop: duplicate of a recently processed notification")
      return
    }
    // A repeat of a message the user already blocked: hide it and show a quiet banner instead of
    // a second full-screen warning. It isn't counted against the free quota, uploaded, reported,
    // or saved again, so it never shows up twice anywhere. It is re-scored on the phone only, so
    // tapping the banner can show the same warning details in a view-only form.
    if (BlockedMessageStore.contains(applicationContext, ownerScope, BlockedMessageStore.hash(text))) {
      val hidden = runCatching {
        cancelNotification(sbn.key)
        true
      }.getOrDefault(false)
      ScanRuntime.markProcessed()
      val review = PendingThreat(
        token = UUID.randomUUID().toString(),
        notificationKey = sbn.key,
        sender = sender,
        message = text,
        sourcePackage = sourcePackage,
        postedAt = sbn.postTime,
        result = V3RiskEvaluator.evaluate(applicationContext, text),
        ownerScope = ownerScope,
        recordId = null,
        reviewOnly = true,
      )
      ThreatDecisionCoordinator.add(review)
      NotiCareNotifications.showBlockedAgain(applicationContext, hidden, review.token)
      Log.d(logTag, "repeat of a blocked message: hidden=$hidden")
      return
    }
    Log.d(logTag, "processing: textLength=${text.length} hasSender=${sender != null}")

    // Only the free tier's automatic-scan quota gates real-time scanning; Pro
    // remains unlimited, and manual paste-text scanning (a separate code path
    // in NotificationListenerModule.scanText) is never limited.
    val tier = RealtimeScanPreferences.subscriptionTier(applicationContext)
    if (tier == "free" && !RealtimeScanPreferences.checkAndConsumeFreeScanQuota(applicationContext)) {
      Log.d(logTag, "drop: free tier monthly scan quota exceeded")
      if (RealtimeScanPreferences.shouldShowQuotaExceededNotice(applicationContext)) {
        NotiCareNotifications.showQuotaExceeded(applicationContext)
      }
      return
    }

    val result = V3RiskEvaluator.evaluate(applicationContext, text)
    // Do not attribute an in-flight scan to a newly signed-in profile.
    if (RealtimeScanPreferences.historyOwnerScope(applicationContext) != ownerScope) {
      Log.d(logTag, "drop: owner scope changed mid-scan")
      return
    }
    if (!RealtimeScanPreferences.isScanningEnabled(applicationContext)) {
      Log.d(logTag, "drop: scanning turned off mid-scan")
      return
    }
    Log.d(logTag, "evaluated: level=${result.level} score=${result.score}")
    val saved = EncryptedHistoryStore.saveScanned(
      context = applicationContext,
      ownerScope = ownerScope,
      sender = sender,
      receivedAt = sbn.postTime,
      score = result.score,
      message = text,
      reasons = result.reasons,
      urls = result.urls,
      sourcePackage = sourcePackage,
      ruleVersion = result.ruleVersion,
      level = result.level,
      retentionLimit = EncryptedHistoryStore.retentionLimitPerAccount(tier),
    )
    val recordId = (saved as? EncryptedHistoryStore.SaveResult.Saved)?.id
    ScanRuntime.markProcessed()
    Log.d(logTag, "saved=${saved::class.simpleName} recordId=${recordId != null}")

    when (result.level) {
      ThreatLevel.SAFE -> EncryptedTelemetryQueue.enqueue(applicationContext, result, false, sbn.postTime)
      ThreatLevel.SUSPICIOUS -> {
        handleActionableNotification(sbn, sender, text, sourcePackage, result, ownerScope, recordId)
      }
      ThreatLevel.DANGEROUS -> handleActionableNotification(sbn, sender, text, sourcePackage, result, ownerScope, recordId)
    }
  }

  private suspend fun handleActionableNotification(
    sbn: StatusBarNotification,
    sender: String?,
    text: String,
    sourcePackage: String,
    result: ThreatResult,
    ownerScope: String,
    recordId: String?,
  ) {
    val pending = PendingThreat(
      token = UUID.randomUUID().toString(),
      notificationKey = sbn.key,
      sender = sender,
      message = text,
      sourcePackage = sourcePackage,
      postedAt = sbn.postTime,
      result = result,
      ownerScope = ownerScope,
      recordId = recordId,
    )
    ThreatDecisionCoordinator.add(pending)
    // Full-screen warnings are a Pro feature. Re-checking the tier here (rather
    // than trusting the stored preference alone) covers a stale preference left
    // over from a downgrade, or a client that skipped the Settings-screen gate.
    val fullScreen = RealtimeScanPreferences.useFullScreenWarnings(applicationContext) &&
      RealtimeScanPreferences.subscriptionTier(applicationContext) == "pro"
    // While the phone is in use, draw the warning over the current app; the notification stays
    // as the fallback (without its full-screen intent, so the warning doesn't open twice). When
    // locked or dark, or without the overlay permission, the full-screen intent takes over.
    val overlayShown = fullScreen && ThreatWarningOverlay.show(applicationContext, pending) {
      NotiCareNotifications.showDangerChoice(applicationContext, pending, true)
    }
    NotiCareNotifications.showDangerChoice(applicationContext, pending, fullScreen && !overlayShown)
  }

  fun applyDecision(pending: PendingThreat, block: Boolean) {
    scanScope.launch {
      NotiCareNotifications.dismissDangerChoice(applicationContext, pending.token)
      if (RealtimeScanPreferences.historyOwnerScope(applicationContext) != pending.ownerScope) return@launch
      if (!block) {
        EncryptedTelemetryQueue.enqueue(applicationContext, pending.result, false, pending.postedAt)
        return@launch
      }

      val suppressionAccepted = runCatching {
        cancelNotification(pending.notificationKey)
        true
      }.getOrDefault(false)
      if (!suppressionAccepted) {
        EncryptedTelemetryQueue.enqueue(applicationContext, pending.result, false, pending.postedAt)
        NotiCareNotifications.showCaution(applicationContext, pending.result.score)
        return@launch
      }

      EncryptedTelemetryQueue.enqueue(applicationContext, pending.result, true, pending.postedAt)
      BlockedMessageStore.remember(applicationContext, pending.ownerScope, BlockedMessageStore.hash(pending.message))
      val historySaved = pending.recordId?.let { id ->
        runCatching { EncryptedHistoryStore.markBlocked(applicationContext, id, pending.ownerScope) }
          .getOrElse { ScanRuntime.markStorageUnavailable(); false }
      } ?: false
      // "Block & Report" always saves locally first (works fully offline) and is
      // uploaded later by the JS bridge once the app is online — see
      // EncryptedCommunityReportQueue and flushNativeCommunityReports().
      EncryptedCommunityReportQueue.enqueue(
        applicationContext,
        pending.message,
        pending.sender,
        pending.result.reasons.map(ThreatReason::code),
        pending.result.ruleVersion,
        pending.result.score,
      )
      NotiCareNotifications.showBlocked(
        applicationContext,
        pending.recordId.takeIf { historySaved },
        pending.result.score,
        historySaved,
        pending.result.level.wireValue,
        reported = true,
      )
    }
  }

  private fun fingerprint(sourcePackage: String, text: String): String {
    val bytes = MessageDigest.getInstance("SHA-256")
      .digest("$sourcePackage\n$text".toByteArray(Charsets.UTF_8))
    return bytes.joinToString(separator = "") { byte -> "%02x".format(Locale.ROOT, byte.toInt() and 0xff) }
  }
}

private object NotificationTextExtractor {
  fun extractText(notification: Notification): String? {
    val extras = notification.extras ?: return null
    val messages = messagingStyleMessages(extras)
    return NotificationInput.select(
      hasMessages = messages.isNotEmpty(),
      latestMessage = messages.asReversed().maxByOrNull { it.timestamp }?.text?.toString(),
      bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString(),
      text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString(),
      lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.map(CharSequence::toString) ?: emptyList(),
    )
  }

  @Suppress("DEPRECATION")
  private fun messagingStyleMessages(extras: android.os.Bundle): List<Notification.MessagingStyle.Message> {
    val bundles = extras.getParcelableArray(Notification.EXTRA_MESSAGES) ?: return emptyList()
    return Notification.MessagingStyle.Message.getMessagesFromBundleArray(bundles)
  }

  @Suppress("DEPRECATION")
  fun extractSender(notification: Notification): String? {
    val extras = notification.extras ?: return null
    return messagingStyleMessages(extras).asReversed().maxByOrNull { it.timestamp }?.sender?.toString()?.takeIf { it.isNotBlank() }
      ?: extras.getCharSequence(Notification.EXTRA_TITLE_BIG)?.toString()?.takeIf { it.isNotBlank() }
      ?: extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.takeIf { it.isNotBlank() }
      ?: extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString()?.takeIf { it.isNotBlank() }
  }
}

internal object NotificationDeduplicator {
  private const val dedupeWindowMs = 2 * 60 * 1000L
  private const val maxEntries = 256
  private val recent = LinkedHashMap<String, Long>()

  @Synchronized
  fun isDuplicate(notificationKey: String, contentFingerprint: String, now: Long = System.currentTimeMillis()): Boolean {
    recent.entries.removeAll { (_, timestamp) -> now - timestamp > dedupeWindowMs }
    // A conversation notification can be updated with a new incoming message.
    // Only skip a repeat of the same content on that notification.
    val keyEntry = "notification:$notificationKey:$contentFingerprint"
    if (recent.containsKey(keyEntry)) return true
    recent[keyEntry] = now
    while (recent.size > maxEntries) recent.remove(recent.entries.first().key)
    return false
  }
}

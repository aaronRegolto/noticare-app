package __NOTICARE_PACKAGE__.bridge

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
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
  @Synchronized fun decide(token: String, block: Boolean): Boolean {
    val threat = pending.remove(token) ?: return false
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

  override fun onCreate() {
    super.onCreate()
    NotiCareNotifications.ensureChannels(this)
    ThreatDecisionCoordinator.attach(this)
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
    scanScope.launch { processPostedNotification(sbn) }
  }

  private suspend fun processPostedNotification(sbn: StatusBarNotification) {
    // 1. The persisted switch is checked before package/content processing.
    if (!RealtimeScanPreferences.isScanningEnabled(applicationContext)) return

    // 2. Resolve the device's current default SMS provider for every event.
    // This automatically handles default-Messages-app changes.
    val defaultSmsPackage = ScanRuntime.defaultSmsPackage(applicationContext) ?: return
    val sourcePackage = sbn.packageName ?: return

    // 3. Reject all non-default-SMS and NotiCare notifications BEFORE extras.
    if (sourcePackage != defaultSmsPackage || sourcePackage == packageName) return

    val notification = sbn.notification ?: return
    if ((notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return

    // Extras are intentionally read only after the package guard above.
    val text = NotificationTextExtractor.extractText(notification)
    if (text.isNullOrBlank()) {
      ScanRuntime.markContentUnavailable()
      return
    }

    val fingerprint = fingerprint(sourcePackage, text)
    if (NotificationDeduplicator.isDuplicate(sbn.key, fingerprint)) return

    val sender = NotificationTextExtractor.extractSender(notification)
    val result = V3RiskEvaluator.evaluate(applicationContext, text)
    ScanRuntime.markProcessed()

    when (result.level) {
      ThreatLevel.SAFE -> EncryptedTelemetryQueue.enqueue(applicationContext, result, false, sbn.postTime)
      ThreatLevel.SUSPICIOUS -> {
        EncryptedTelemetryQueue.enqueue(applicationContext, result, false, sbn.postTime)
        NotiCareNotifications.showCaution(applicationContext, result.score)
      }
      ThreatLevel.DANGEROUS -> handleDangerousNotification(sbn, sender, text, sourcePackage, result)
    }
  }

  private suspend fun handleDangerousNotification(
    sbn: StatusBarNotification,
    sender: String?,
    text: String,
    sourcePackage: String,
    result: ThreatResult,
  ) {
    val pending = PendingThreat(
      token = UUID.randomUUID().toString(),
      notificationKey = sbn.key,
      sender = sender,
      message = text,
      sourcePackage = sourcePackage,
      postedAt = sbn.postTime,
      result = result,
    )
    ThreatDecisionCoordinator.add(pending)
    NotiCareNotifications.showDangerChoice(applicationContext, pending)
    if (RealtimeScanPreferences.useFullScreenWarnings(applicationContext)) {
      NotiCareNotifications.openWarningScreen(applicationContext, pending.token)
    }
  }

  fun applyDecision(pending: PendingThreat, block: Boolean) {
    scanScope.launch {
      NotiCareNotifications.dismissDangerChoice(applicationContext, pending.token)
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
    val ownerScope = RealtimeScanPreferences.historyOwnerScope(applicationContext)
    if (ownerScope == null) {
      // A signed-out/shared device may still receive the safety warning, but it
      // must never create a raw SMS History record with no account owner.
      NotiCareNotifications.showBlocked(applicationContext, null, pending.result.score, false)
      return@launch
    }

    val saveResult = EncryptedHistoryStore.saveBlocked(
      context = applicationContext,
      ownerScope = ownerScope,
      sender = pending.sender,
      receivedAt = pending.postedAt,
      score = pending.result.score,
      message = pending.message,
      reasons = pending.result.reasons,
      urls = pending.result.urls,
      sourcePackage = pending.sourcePackage,
      ruleVersion = pending.result.ruleVersion,
    )
    when (saveResult) {
      is EncryptedHistoryStore.SaveResult.Saved -> {
        NotiCareNotifications.showBlocked(applicationContext, saveResult.id, pending.result.score, true)
      }
      is EncryptedHistoryStore.SaveResult.Unavailable -> {
        NotiCareNotifications.showBlocked(applicationContext, null, pending.result.score, false)
      }
    }
    }
  }

  private fun fingerprint(sourcePackage: String, text: String): String {
    val normalized = SmishingEvaluator.normalize(text)
    val bytes = MessageDigest.getInstance("SHA-256")
      .digest("$sourcePackage\\n$normalized".toByteArray(Charsets.UTF_8))
    return bytes.joinToString(separator = "") { byte -> "%02x".format(Locale.ROOT, byte.toInt() and 0xff) }
  }
}

private object NotificationTextExtractor {
  fun extractText(notification: Notification): String? {
    val extras = notification.extras ?: return null
    val candidates = buildList {
      messagingStyleMessages(extras)
        .lastOrNull()
        ?.text
        ?.toString()
        ?.let(::add)
      extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.let(::add)
      extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.let(::add)
      extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
        ?.map(CharSequence::toString)
        ?.forEach(::add)
    }
    val unique = mutableListOf<String>()
    for (candidate in candidates) {
      val value = candidate.trim()
      if (value.isBlank()) continue
      val normalized = SmishingEvaluator.normalize(value)
      if (unique.none { existing ->
          val existingNormalized = SmishingEvaluator.normalize(existing)
          existingNormalized == normalized ||
            existingNormalized.contains(normalized) || normalized.contains(existingNormalized)
        }
      ) {
        unique += value
      }
    }
    return unique.joinToString("\n").takeIf { it.isNotBlank() }
  }

  @Suppress("DEPRECATION")
  private fun messagingStyleMessages(extras: android.os.Bundle): List<Notification.MessagingStyle.Message> {
    val bundles = extras.getParcelableArray(Notification.EXTRA_MESSAGES) ?: return emptyList()
    return Notification.MessagingStyle.Message.getMessagesFromBundleArray(bundles)
  }

  fun extractSender(notification: Notification): String? {
    val extras = notification.extras ?: return null
    return extras.getCharSequence(Notification.EXTRA_TITLE_BIG)?.toString()?.takeIf { it.isNotBlank() }
      ?: extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.takeIf { it.isNotBlank() }
      ?: extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString()?.takeIf { it.isNotBlank() }
  }
}

private object NotificationDeduplicator {
  private const val dedupeWindowMs = 2 * 60 * 1000L
  private const val maxEntries = 256
  private val recent = LinkedHashMap<String, Long>()

  @Synchronized
  fun isDuplicate(notificationKey: String, contentFingerprint: String, now: Long = System.currentTimeMillis()): Boolean {
    recent.entries.removeAll { (_, timestamp) -> now - timestamp > dedupeWindowMs }
    val keyEntry = "notification:$notificationKey"
    val contentEntry = "content:$contentFingerprint"
    if (recent.containsKey(keyEntry) || recent.containsKey(contentEntry)) return true
    recent[keyEntry] = now
    recent[contentEntry] = now
    while (recent.size > maxEntries) recent.remove(recent.entries.first().key)
    return false
  }
}

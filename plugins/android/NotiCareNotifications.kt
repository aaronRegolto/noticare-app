package __NOTICARE_PACKAGE__.bridge

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build

/** Native alerts deliberately exclude SMS text, sender, URLs, and OTP values. */
object NotiCareNotifications {
  private const val cautionChannelId = "noticare_caution"
  private const val dangerChannelId = "noticare_danger"
  private const val repeatChannelId = "noticare_repeat_blocked"
  private const val repeatNotificationId = 6301
  private const val cautionNotificationId = 6101
  const val actionDecision = "__NOTICARE_PACKAGE__.ACTION_THREAT_DECISION"
  const val extraToken = "threat_token"
  const val extraBlock = "block_threat"

  fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    manager.createNotificationChannel(
      NotificationChannel(
        cautionChannelId,
        "NotiCare cautions",
        NotificationManager.IMPORTANCE_DEFAULT,
      ).apply {
        description = "Warnings about suspicious SMS notifications."
      },
    )
    manager.createNotificationChannel(
      NotificationChannel(
        dangerChannelId,
        "NotiCare danger warnings",
        NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        description = "High-priority warnings for SMS notifications NotiCare suppressed."
        // Alarm-style audio attributes make Android route this like a call/alarm
        // rather than a normal notification, so it still sounds even when the
        // phone is set to vibrate-only for regular notifications.
        setSound(
          android.provider.Settings.System.DEFAULT_NOTIFICATION_URI,
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 400, 200, 400, 200, 400)
        enableLights(true)
        setBypassDnd(true)
      },
    )
    // A heads-up banner with the normal notification sound: noticeable, but without the danger
    // channel's alarm-style sound or Do Not Disturb bypass, since no decision is needed.
    manager.createNotificationChannel(
      NotificationChannel(
        repeatChannelId,
        "Repeat blocked messages",
        NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        description = "Lets you know when a message you already blocked arrives again."
      },
    )
  }

  fun showCaution(context: Context, score: Int) {
    ensureChannels(context)
    notificationManager(context)?.notify(
      cautionNotificationId,
      builder(context, cautionChannelId)
        .setSmallIcon(context.applicationInfo.icon)
        .setContentTitle("NotiCare: suspicious SMS")
        .setContentText("A message showed warning signs (risk score $score/100). Do not open links until you verify it.")
        .setStyle(Notification.BigTextStyle().bigText("A message showed warning signs (risk score $score/100). Do not open links until you verify it."))
        .setContentIntent(historyIntent(context, null))
        .setAutoCancel(true)
        .setCategory(Notification.CATEGORY_STATUS)
        .setVisibility(Notification.VISIBILITY_PRIVATE)
        .build(),
    )
  }

  /**
   * A direct `startActivity` call from this background service is unreliable by design: Android
   * 10+ blocks most background activity launches, so it silently no-ops unless NotiCare happens
   * to already be the foreground app. `setFullScreenIntent` is the OS-sanctioned way to interrupt
   * the user from the background instead — the system launches [ThreatWarningActivity] directly
   * when the screen is off or locked, and shows a prominent heads-up banner when the phone is
   * awake and in use. Covering the screen while the phone is in use is [ThreatWarningOverlay]'s
   * job; this notification remains as the actionable fallback either way.
   */
  fun showDangerChoice(context: Context, pending: PendingThreat, fullScreen: Boolean) {
    ensureChannels(context)
    val reasonSummary = pending.result.reasons.take(2).joinToString("; ") { it.label }
      .ifBlank { "Multiple phishing indicators were detected" }
    val body = "Risk ${pending.result.score}/100: $reasonSummary. Choose Block & Report or Ignore."
    val notification = builder(context, dangerChannelId)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle("Possible phishing message")
      .setContentText(body)
      .setStyle(Notification.BigTextStyle().bigText(body))
      .setContentIntent(warningIntent(context, pending.token))
      .addAction(Notification.Action.Builder(null, "Ignore", decisionIntent(context, pending.token, false)).build())
      .addAction(Notification.Action.Builder(null, "Block & Report", decisionIntent(context, pending.token, true)).build())
      .setAutoCancel(false)
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_ERROR)
      .setVisibility(Notification.VISIBILITY_PRIVATE)
      // Below Android O, channel-level sound/vibration/priority don't exist, so
      // set them directly here. On O+ these are ignored in favor of the
      // dangerChannelId channel's own (equivalent) settings.
      .setPriority(Notification.PRIORITY_MAX)
      .setDefaults(Notification.DEFAULT_ALL)
      .setVibrate(longArrayOf(0, 400, 200, 400, 200, 400))
      .apply { if (fullScreen) setFullScreenIntent(warningIntent(context, pending.token), true) }
      .build()
      // Repeats the sound/vibration on a loop until the user acts on it or
      // dismisses it. There is no Builder method for this flag, so it's set on
      // the built Notification.
      .apply { flags = flags or Notification.FLAG_INSISTENT }
    notificationManager(context)?.notify(pending.token.hashCode(), notification)
  }

  /** A message the user already blocked arrived again and was handled without a warning. */
  fun showBlockedAgain(context: Context, hidden: Boolean) {
    ensureChannels(context)
    val detail = if (hidden) {
      "Already blocked. You blocked this message before, so NotiCare hid it again. Nothing else to do."
    } else {
      "Already blocked. You blocked this message before, but Android didn't let NotiCare hide it this time. Don't open its links or reply."
    }
    notificationManager(context)?.notify(
      repeatNotificationId,
      builder(context, repeatChannelId)
        .setSmallIcon(context.applicationInfo.icon)
        .setContentTitle("Blocked message notification")
        .setContentText("Already blocked")
        .setStyle(Notification.BigTextStyle().bigText(detail))
        .setContentIntent(historyIntent(context, null))
        .setAutoCancel(true)
        .setPriority(Notification.PRIORITY_HIGH)
        .setCategory(Notification.CATEGORY_STATUS)
        .setVisibility(Notification.VISIBILITY_PRIVATE)
        .build(),
    )
  }

  fun dismissDangerChoice(context: Context, token: String) {
    ThreatWarningOverlay.dismiss(context, token)
    notificationManager(context)?.cancel(token.hashCode())
  }

  fun showBlocked(context: Context, recordId: String?, score: Int, historySaved: Boolean, level: String, reported: Boolean) {
    ensureChannels(context)
    val storageText = if (historySaved) {
      "The original SMS was not deleted. A protected local copy is available in NotiCare Messages."
    } else {
      "The original SMS was not deleted. No protected local message copy was saved."
    }
    val reportText = if (reported) {
      " Saved to report to other NotiCare users once you're online."
    } else {
      ""
    }
    val classification = if (level == "dangerous") "likely smishing" else "suspicious SMS"
    val body = "A $classification notification was suppressed (risk score $score/100). $storageText$reportText"
    notificationManager(context)?.notify(
      recordId?.hashCode() ?: (6200 + score),
      builder(context, dangerChannelId)
        .setSmallIcon(context.applicationInfo.icon)
        .setContentTitle("NotiCare blocked a $classification")
        .setContentText(body)
        .setStyle(Notification.BigTextStyle().bigText(body))
        .setContentIntent(historyIntent(context, recordId))
        .setAutoCancel(true)
        .setCategory(Notification.CATEGORY_ERROR)
        .setVisibility(Notification.VISIBILITY_PRIVATE)
        .build(),
    )
  }

  /**
   * Posted later by the JS bridge once a queued "Block & Report" tap actually
   * finishes uploading (see EncryptedCommunityReportQueue) — this is the
   * asynchronous equivalent of Manual Scan's instant "New" / report-count
   * badge, since a background notification tap has no UI to show it in.
   */
  fun showCommunityReportResult(context: Context, isNew: Boolean, reportCount: Int) {
    ensureChannels(context)
    val body = if (isNew) {
      "Your reported message was new — thanks for helping warn other NotiCare users."
    } else {
      "Your report added to an existing message: $reportCount NotiCare users have now reported it."
    }
    notificationManager(context)?.notify(
      6300 + reportCount,
      builder(context, dangerChannelId)
        .setSmallIcon(context.applicationInfo.icon)
        .setContentTitle("Phishing report shared")
        .setContentText(body)
        .setStyle(Notification.BigTextStyle().bigText(body))
        .setAutoCancel(true)
        .setCategory(Notification.CATEGORY_STATUS)
        .setVisibility(Notification.VISIBILITY_PRIVATE)
        .build(),
    )
  }

  /** Shown at most once per calendar month when the free tier's automatic-scan quota is used up. */
  fun showQuotaExceeded(context: Context) {
    ensureChannels(context)
    val body = "You've used this month's 10 free automatic scans. Upgrade to NotiCare Pro for unlimited real-time protection."
    notificationManager(context)?.notify(
      cautionNotificationId + 1,
      builder(context, cautionChannelId)
        .setSmallIcon(context.applicationInfo.icon)
        .setContentTitle("Free scan limit reached")
        .setContentText(body)
        .setStyle(Notification.BigTextStyle().bigText(body))
        .setContentIntent(paywallIntent(context))
        .setAutoCancel(true)
        .setCategory(Notification.CATEGORY_STATUS)
        .setVisibility(Notification.VISIBILITY_PRIVATE)
        .build(),
    )
  }

  private fun paywallIntent(context: Context): PendingIntent {
    val intent = Intent(context, __NOTICARE_PACKAGE__.MainActivity::class.java).apply {
      action = Intent.ACTION_VIEW
      data = Uri.parse("noticareapp://paywall")
      flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    return PendingIntent.getActivity(
      context,
      "paywall".hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun warningActivityIntent(context: Context, token: String) =
    Intent(context, ThreatWarningActivity::class.java).apply { putExtra(extraToken, token) }

  private fun warningIntent(context: Context, token: String): PendingIntent = PendingIntent.getActivity(
    context,
    token.hashCode(),
    warningActivityIntent(context, token),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
  )

  private fun decisionIntent(context: Context, token: String, block: Boolean): PendingIntent = PendingIntent.getBroadcast(
    context,
    token.hashCode() * 31 + if (block) 1 else 0,
    Intent(context, ThreatDecisionReceiver::class.java).apply {
      action = actionDecision
      putExtra(extraToken, token)
      putExtra(extraBlock, block)
    },
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
  )

  private fun builder(context: Context, channelId: String): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, channelId)
    else Notification.Builder(context)

  private fun notificationManager(context: Context): NotificationManager? =
    context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager

  private fun historyIntent(context: Context, recordId: String?): PendingIntent {
    val uri = Uri.parse(
      if (recordId == null) "noticareapp://history" else "noticareapp://history?recordId=$recordId",
    )
    val intent = Intent(context, __NOTICARE_PACKAGE__.MainActivity::class.java).apply {
      action = Intent.ACTION_VIEW
      data = uri
      flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    return PendingIntent.getActivity(
      context,
      recordId?.hashCode() ?: 0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }
}

package __NOTICARE_PACKAGE__.bridge

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build

/** Native alerts deliberately exclude SMS text, sender, URLs, and OTP values. */
object NotiCareNotifications {
  private const val cautionChannelId = "noticare_caution"
  private const val dangerChannelId = "noticare_danger"
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

  fun showDangerChoice(context: Context, pending: PendingThreat) {
    ensureChannels(context)
    val reasonSummary = pending.result.reasons.take(2).joinToString("; ") { it.label }
      .ifBlank { "Multiple phishing indicators were detected" }
    val body = "Risk ${pending.result.score}/100: $reasonSummary. Choose Block or Ignore."
    notificationManager(context)?.notify(
      pending.token.hashCode(),
      builder(context, dangerChannelId)
        .setSmallIcon(context.applicationInfo.icon)
        .setContentTitle("Possible phishing message")
        .setContentText(body)
        .setStyle(Notification.BigTextStyle().bigText(body))
        .setContentIntent(warningIntent(context, pending.token))
        .addAction(Notification.Action.Builder(null, "Ignore", decisionIntent(context, pending.token, false)).build())
        .addAction(Notification.Action.Builder(null, "Block", decisionIntent(context, pending.token, true)).build())
        .setAutoCancel(false)
        .setOngoing(true)
        .setCategory(Notification.CATEGORY_ERROR)
        .setVisibility(Notification.VISIBILITY_PRIVATE)
        .build(),
    )
  }

  fun openWarningScreen(context: Context, token: String) {
    runCatching { context.startActivity(warningActivityIntent(context, token).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
  }

  fun dismissDangerChoice(context: Context, token: String) {
    notificationManager(context)?.cancel(token.hashCode())
  }

  fun showBlocked(context: Context, recordId: String?, score: Int, historySaved: Boolean, level: String) {
    ensureChannels(context)
    val storageText = if (historySaved) {
      "The original SMS was not deleted. A protected local copy is available in NotiCare Messages."
    } else {
      "The original SMS was not deleted. No protected local message copy was saved."
    }
    val classification = if (level == "dangerous") "likely smishing" else "suspicious SMS"
    val body = "A $classification notification was suppressed (risk score $score/100). $storageText"
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

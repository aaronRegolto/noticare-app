package __NOTICARE_PACKAGE__.bridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class ThreatDecisionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != NotiCareNotifications.actionDecision) return
    val token = intent.getStringExtra(NotiCareNotifications.extraToken) ?: return
    ThreatDecisionCoordinator.decide(token, intent.getBooleanExtra(NotiCareNotifications.extraBlock, false))
    NotiCareNotifications.dismissDangerChoice(context, token)
  }
}

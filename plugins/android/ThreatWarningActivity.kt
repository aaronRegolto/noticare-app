package __NOTICARE_PACKAGE__.bridge

import android.app.Activity
import android.graphics.Color
import android.os.Bundle

/**
 * Full-screen warning launched by the notification's full-screen intent while the phone is locked
 * or the screen is off. While the phone is in use, [ThreatWarningOverlay] shows the same layout.
 * Also opened from the "Already blocked" banner, as a view-only explanation with a Close button.
 */
class ThreatWarningActivity : Activity() {
  private lateinit var token: String
  private var reviewOnly = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setShowWhenLocked(true)
    setTurnScreenOn(true)
    window.statusBarColor = ThreatWarningView.danger
    window.navigationBarColor = Color.WHITE
    token = intent.getStringExtra(NotiCareNotifications.extraToken).orEmpty()
    val threat = ThreatDecisionCoordinator.get(token)
    if (token.isBlank() || threat == null) {
      // The details only live in memory. If Android closed NotiCare since the banner appeared,
      // show History (where the blocked message is saved) rather than doing nothing.
      runCatching { startActivity(NotiCareNotifications.historyActivityIntent(this, null)) }
      finish()
      return
    }
    reviewOnly = threat.reviewOnly
    setContentView(ThreatWarningView.build(this, threat, ::decide))
  }

  override fun onBackPressed() {
    // Back is equivalent to Ignore (or Close, for an already-blocked message): the original
    // Messages notification remains.
    decide(false)
  }

  private fun decide(block: Boolean) {
    if (reviewOnly) {
      ThreatDecisionCoordinator.dismiss(token)
      finishAndRemoveTask()
      return
    }
    ThreatDecisionCoordinator.decide(token, block)
    NotiCareNotifications.dismissDangerChoice(this, token)
    finishAndRemoveTask()
  }
}

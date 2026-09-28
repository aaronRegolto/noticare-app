package __NOTICARE_PACKAGE__.bridge

import android.app.Activity
import android.graphics.Color
import android.os.Bundle

/**
 * Full-screen warning launched by the notification's full-screen intent while the phone is locked
 * or the screen is off. While the phone is in use, [ThreatWarningOverlay] shows the same layout.
 */
class ThreatWarningActivity : Activity() {
  private lateinit var token: String

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setShowWhenLocked(true)
    setTurnScreenOn(true)
    window.statusBarColor = ThreatWarningView.danger
    window.navigationBarColor = Color.WHITE
    token = intent.getStringExtra(NotiCareNotifications.extraToken).orEmpty()
    val threat = ThreatDecisionCoordinator.get(token)
    if (token.isBlank() || threat == null) {
      finish()
      return
    }
    setContentView(ThreatWarningView.build(this, threat, ::decide))
  }

  override fun onBackPressed() {
    // Back is equivalent to Ignore: the original Messages notification remains.
    decide(false)
  }

  private fun decide(block: Boolean) {
    ThreatDecisionCoordinator.decide(token, block)
    NotiCareNotifications.dismissDangerChoice(this, token)
    finishAndRemoveTask()
  }
}

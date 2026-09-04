package __NOTICARE_PACKAGE__.bridge

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/** Privacy-conscious native warning that works without starting React Native. */
class ThreatWarningActivity : Activity() {
  private lateinit var token: String

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setShowWhenLocked(true)
    setTurnScreenOn(true)
    window.statusBarColor = danger
    window.navigationBarColor = Color.WHITE
    token = intent.getStringExtra(NotiCareNotifications.extraToken).orEmpty()
    val threat = ThreatDecisionCoordinator.get(token)
    if (token.isBlank() || threat == null) {
      finish()
      return
    }
    setContentView(buildContent(threat))
  }

  override fun onBackPressed() {
    // Back is equivalent to Ignore: the original Messages notification remains.
    decide(false)
  }

  private fun buildContent(threat: PendingThreat): View {
    val scroll = ScrollView(this).apply {
      setBackgroundColor(Color.rgb(248, 249, 252))
      isFillViewport = true
    }
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(dp(24), dp(38), dp(24), dp(28))
    }

    root.addView(TextView(this).apply {
      text = "!"
      textSize = 38f
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
      typeface = Typeface.DEFAULT_BOLD
      background = rounded(danger, 40f)
    }, LinearLayout.LayoutParams(dp(80), dp(80)))
    root.addView(label("Possible phishing message", 27f, Color.rgb(25, 38, 57), true).withTop(22))
    root.addView(label("NotiCare found strong warning signs. Review why before deciding.", 16f, Color.rgb(82, 99, 122), false).withTop(10))

    val risk = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(18), dp(16), dp(18), dp(16))
      background = rounded(Color.rgb(255, 236, 235), 18f)
      addView(label("HIGH RISK · ${threat.result.score}/100", 14f, danger, true))
      addView(label("Do not tap links or share passwords, PINs, or OTP codes.", 15f, Color.rgb(101, 35, 32), false).withTop(6))
    }
    root.addView(risk, matchWidth(top = 24))
    root.addView(label("Why this was flagged", 18f, Color.rgb(25, 38, 57), true).withTop(26))

    threat.result.reasons.take(5).forEach { reason ->
      val card = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(16), dp(14), dp(16), dp(14))
        background = rounded(Color.WHITE, 14f, Color.rgb(225, 230, 238))
        addView(label(reason.label, 15f, Color.rgb(38, 59, 84), true))
        addView(label(reason.description, 14f, Color.rgb(91, 108, 130), false).withTop(4))
      }
      root.addView(card, matchWidth(top = 10))
    }

    val domains = threat.result.urls.mapNotNull { it.normalizedDomain }.distinct().take(3)
    if (domains.isNotEmpty()) {
      root.addView(label("Suspicious link ${if (domains.size == 1) "domain" else "domains"}: ${domains.joinToString(", ")}", 14f, danger, true).withTop(16))
    }
    root.addView(label("Block hides this notification and saves a protected local History record. Ignore leaves the message notification visible.", 13f, Color.rgb(92, 107, 127), false).withTop(22))

    root.addView(Button(this).apply {
      text = "Block message notification"
      textSize = 16f
      setTextColor(Color.WHITE)
      typeface = Typeface.DEFAULT_BOLD
      isAllCaps = false
      background = rounded(danger, 14f)
      setOnClickListener { decide(true) }
    }, matchWidth(height = 56, top = 24))
    root.addView(Button(this).apply {
      text = "Ignore and keep visible"
      textSize = 16f
      setTextColor(Color.rgb(47, 67, 91))
      typeface = Typeface.DEFAULT_BOLD
      isAllCaps = false
      background = rounded(Color.WHITE, 14f, Color.rgb(205, 214, 225))
      setOnClickListener { decide(false) }
    }, matchWidth(height = 56, top = 12))
    scroll.addView(root)
    return scroll
  }

  private fun decide(block: Boolean) {
    ThreatDecisionCoordinator.decide(token, block)
    NotiCareNotifications.dismissDangerChoice(this, token)
    finishAndRemoveTask()
  }

  private fun label(value: String, size: Float, color: Int, bold: Boolean) = TextView(this).apply {
    text = value
    textSize = size
    setTextColor(color)
    gravity = Gravity.CENTER_HORIZONTAL
    if (bold) typeface = Typeface.DEFAULT_BOLD
  }

  private fun TextView.withTop(top: Int) = apply { layoutParams = matchWidth(top = top) }
  private fun matchWidth(height: Int = LinearLayout.LayoutParams.WRAP_CONTENT, top: Int = 0) =
    LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, if (height > 0) dp(height) else height).apply {
      topMargin = dp(top)
    }

  private fun rounded(fill: Int, radius: Float, stroke: Int? = null) = GradientDrawable().apply {
    setColor(fill)
    cornerRadius = dp(radius.toInt()).toFloat()
    if (stroke != null) setStroke(dp(1), stroke)
  }

  private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

  companion object {
    private val danger = Color.rgb(190, 45, 42)
  }
}

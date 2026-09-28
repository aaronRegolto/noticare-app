package __NOTICARE_PACKAGE__.bridge

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * The native warning layout shared by [ThreatWarningActivity] (lock screen / screen off) and
 * [ThreatWarningOverlay] (drawn over whatever app is in use). Works without starting React Native.
 */
object ThreatWarningView {
  val danger = Color.rgb(190, 45, 42)
  private val caution = Color.rgb(178, 103, 0)

  fun build(context: Context, threat: PendingThreat, onDecide: (block: Boolean) -> Unit): ScrollView {
    val dangerous = threat.result.level == ThreatLevel.DANGEROUS
    val accent = if (dangerous) danger else caution
    val scroll = ScrollView(context).apply {
      setBackgroundColor(Color.rgb(248, 249, 252))
      isFillViewport = true
    }
    val root = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(context.dp(24), context.dp(38), context.dp(24), context.dp(28))
    }

    root.addView(TextView(context).apply {
      text = "!"
      textSize = 38f
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
      typeface = Typeface.DEFAULT_BOLD
      background = context.rounded(accent, 40f)
    }, LinearLayout.LayoutParams(context.dp(80), context.dp(80)))
    root.addView(context.label(if (dangerous) "Possible phishing message" else "Suspicious message", 27f, Color.rgb(25, 38, 57), true).withTop(context, 22))
    root.addView(context.label(if (dangerous) "NotiCare found strong warning signs. Review why before deciding." else "NotiCare found warning signs that need your attention.", 16f, Color.rgb(82, 99, 122), false).withTop(context, 10))

    val risk = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(context.dp(18), context.dp(16), context.dp(18), context.dp(16))
      background = context.rounded(if (dangerous) Color.rgb(255, 236, 235) else Color.rgb(255, 246, 225), 18f)
      addView(context.label("${if (dangerous) "HIGH RISK" else "CAUTION"} · ${threat.result.score}/100", 14f, accent, true))
      addView(context.label("Do not tap links or share passwords, PINs, or OTP codes.", 15f, Color.rgb(101, 35, 32), false).withTop(context, 6))
    }
    root.addView(risk, context.matchWidth(top = 24))
    root.addView(context.label("Why this was flagged", 18f, Color.rgb(25, 38, 57), true).withTop(context, 26))

    threat.result.reasons.take(5).forEach { reason ->
      val card = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(context.dp(16), context.dp(14), context.dp(16), context.dp(14))
        background = context.rounded(Color.WHITE, 14f, Color.rgb(225, 230, 238))
        addView(context.label(reason.label, 15f, Color.rgb(38, 59, 84), true))
        addView(context.label(reason.description, 14f, Color.rgb(91, 108, 130), false).withTop(context, 4))
      }
      root.addView(card, context.matchWidth(top = 10))
    }

    val domains = threat.result.urls.mapNotNull { it.normalizedDomain }.distinct().take(3)
    if (domains.isNotEmpty()) {
      root.addView(context.label("Suspicious link ${if (domains.size == 1) "domain" else "domains"}: ${domains.joinToString(", ")}", 14f, accent, true).withTop(context, 16))
    }
    root.addView(context.label("Block hides this notification and saves a protected local History record. Ignore leaves the message notification visible.", 13f, Color.rgb(92, 107, 127), false).withTop(context, 22))

    root.addView(Button(context).apply {
      text = "Block message notification"
      textSize = 16f
      setTextColor(Color.WHITE)
      typeface = Typeface.DEFAULT_BOLD
      isAllCaps = false
      background = context.rounded(accent, 14f)
      setOnClickListener { onDecide(true) }
    }, context.matchWidth(height = 56, top = 24))
    root.addView(Button(context).apply {
      text = "Ignore and keep visible"
      textSize = 16f
      setTextColor(Color.rgb(47, 67, 91))
      typeface = Typeface.DEFAULT_BOLD
      isAllCaps = false
      background = context.rounded(Color.WHITE, 14f, Color.rgb(205, 214, 225))
      setOnClickListener { onDecide(false) }
    }, context.matchWidth(height = 56, top = 12))
    scroll.addView(root)
    return scroll
  }

  private fun Context.label(value: String, size: Float, color: Int, bold: Boolean) = TextView(this).apply {
    text = value
    textSize = size
    setTextColor(color)
    gravity = Gravity.CENTER_HORIZONTAL
    if (bold) typeface = Typeface.DEFAULT_BOLD
  }

  private fun TextView.withTop(context: Context, top: Int) = apply { layoutParams = context.matchWidth(top = top) }

  private fun Context.matchWidth(height: Int = LinearLayout.LayoutParams.WRAP_CONTENT, top: Int = 0) =
    LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, if (height > 0) dp(height) else height).apply {
      topMargin = dp(top)
    }

  private fun Context.rounded(fill: Int, radius: Float, stroke: Int? = null) = GradientDrawable().apply {
    setColor(fill)
    cornerRadius = dp(radius.toInt()).toFloat()
    if (stroke != null) setStroke(dp(1), stroke)
  }

  private fun Context.dp(value: Int) = (value * resources.displayMetrics.density).toInt()
}

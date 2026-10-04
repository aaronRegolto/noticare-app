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
  // Matches the Safe badge in the History screen.
  val safe = Color.rgb(8, 118, 83)

  fun build(context: Context, threat: PendingThreat, onDecide: (block: Boolean) -> Unit): ScrollView {
    val copy = WarningCopy.forContext(context)
    val dangerous = threat.result.level == ThreatLevel.DANGEROUS
    // Only reachable for a view-only re-scan of a message the user already blocked, which can now
    // come back Safe (for example after a rule update). Safe always shows 0 and no points.
    val isSafe = threat.result.level == ThreatLevel.SAFE
    val accent = when {
      dangerous -> danger
      isSafe -> safe
      else -> caution
    }
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
      text = if (isSafe) "✓" else "!"
      textSize = 38f
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
      typeface = Typeface.DEFAULT_BOLD
      background = context.rounded(accent, 40f)
    }, LinearLayout.LayoutParams(context.dp(80), context.dp(80)))
    val reviewOnly = threat.reviewOnly
    val title = when {
      reviewOnly -> copy.titleAlreadyBlocked
      dangerous -> copy.titleDangerous
      else -> copy.titleSuspicious
    }
    val subtitle = when {
      reviewOnly && isSafe -> copy.subtitleReviewSafe
      reviewOnly -> copy.subtitleReview
      dangerous -> copy.subtitleDangerous
      else -> copy.subtitleSuspicious
    }
    root.addView(context.label(title, 27f, Color.rgb(25, 38, 57), true).withTop(context, 22))
    root.addView(context.label(subtitle, 16f, Color.rgb(82, 99, 122), false).withTop(context, 10))

    val risk = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(context.dp(18), context.dp(16), context.dp(18), context.dp(16))
      background = context.rounded(
        when {
          dangerous -> Color.rgb(255, 236, 235)
          isSafe -> Color.rgb(229, 246, 238)
          else -> Color.rgb(255, 246, 225)
        },
        18f,
      )
      val badge = when {
        dangerous -> copy.badgeHighRisk
        isSafe -> copy.badgeSafe
        else -> copy.badgeCaution
      }
      addView(context.label("$badge · ${threat.result.score}/100", 14f, accent, true))
      addView(
        context.label(
          if (isSafe) copy.adviceSafe else copy.adviceRisky,
          15f,
          if (isSafe) Color.rgb(38, 59, 84) else Color.rgb(101, 35, 32),
          false,
        ).withTop(context, 6),
      )
    }
    root.addView(risk, context.matchWidth(top = 24))

    root.addView(context.label(copy.howScoreCalculated, 18f, Color.rgb(25, 38, 57), true).withTop(context, 26))

    // Safe shows no points at all: its score is always 0.
    val scoredReasons = if (isSafe) emptyList() else threat.result.reasons
    if (isSafe) {
      root.addView(context.label(copy.noSignificantSigns, 14f, Color.rgb(91, 108, 130), false).withTop(context, 10))
    }
    // Every sign is listed (not just the first few) so the points always add up to the score.
    scoredReasons.forEach { reason ->
      val card = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(context.dp(16), context.dp(14), context.dp(16), context.dp(14))
        background = context.rounded(Color.WHITE, 14f, Color.rgb(225, 230, 238))
        val header = LinearLayout(context).apply {
          orientation = LinearLayout.HORIZONTAL
          gravity = Gravity.CENTER_VERTICAL
          addView(
            context.label(copy.reasonLabel(reason), 15f, Color.rgb(38, 59, 84), true).apply { gravity = Gravity.START },
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f),
          )
          addView(context.label("+${reason.weight}", 15f, accent, true).apply { gravity = Gravity.END })
        }
        addView(header)
        addView(context.label(copy.reasonDescription(reason), 14f, Color.rgb(91, 108, 130), false).apply { gravity = Gravity.START }.withTop(context, 4))
      }
      root.addView(card, context.matchWidth(top = 10))
    }

    val rawTotal = scoredReasons.sumOf { it.weight }
    if (scoredReasons.isNotEmpty()) {
      val weights = scoredReasons.map { it.weight }
      val sum = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(context.dp(16), context.dp(12), context.dp(16), 0)
        addView(
          context.label(
            if (weights.size > 1) "${copy.total} (${weights.joinToString(" + ")})" else copy.total,
            14f,
            Color.rgb(82, 99, 122),
            true,
          ).apply { gravity = Gravity.START },
          LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f),
        )
        addView(context.label("$rawTotal", 15f, Color.rgb(25, 38, 57), true).apply { gravity = Gravity.END })
      }
      root.addView(sum, context.matchWidth(top = 6))
    }
    val total = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(context.dp(16), context.dp(12), context.dp(16), context.dp(12))
      addView(
        context.label(copy.riskScore, 15f, Color.rgb(25, 38, 57), true).apply { gravity = Gravity.START },
        LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f),
      )
      addView(context.label("${threat.result.score}/100", 17f, accent, true).apply { gravity = Gravity.END })
    }
    root.addView(total, context.matchWidth(top = 6))
    if (rawTotal > 100) {
      root.addView(context.label(copy.cappedNote(rawTotal), 12f, Color.rgb(92, 107, 127), false))
    }
    root.addView(
      context.label(
        copy.legend,
        13f,
        Color.rgb(92, 107, 127),
        false,
      ).withTop(context, 4),
    )

    val domains = threat.result.urls.mapNotNull { it.normalizedDomain }.distinct().take(3)
    if (domains.isNotEmpty() && !isSafe) {
      root.addView(context.label(copy.suspiciousDomains(domains), 14f, accent, true).withTop(context, 16))
    }
    if (reviewOnly) {
      root.addView(context.label(copy.reviewOnlyNote, 13f, Color.rgb(92, 107, 127), false).withTop(context, 22))
      root.addView(Button(context).apply {
        text = copy.close
        textSize = 16f
        setTextColor(Color.WHITE)
        typeface = Typeface.DEFAULT_BOLD
        isAllCaps = false
        background = context.rounded(accent, 14f)
        setOnClickListener { onDecide(false) }
      }, context.matchWidth(height = 56, top = 24))
      scroll.addView(root)
      return scroll
    }
    root.addView(context.label(copy.actionsExplained, 13f, Color.rgb(92, 107, 127), false).withTop(context, 22))

    root.addView(Button(context).apply {
      text = copy.blockAndReport
      textSize = 16f
      setTextColor(Color.WHITE)
      typeface = Typeface.DEFAULT_BOLD
      isAllCaps = false
      background = context.rounded(accent, 14f)
      setOnClickListener { onDecide(true) }
    }, context.matchWidth(height = 56, top = 24))
    root.addView(Button(context).apply {
      text = copy.ignoreAndKeepVisible
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

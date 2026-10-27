package __NOTICARE_PACKAGE__.bridge

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.text.SpannableString
import android.text.Spanned
import android.text.style.StyleSpan
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * Shows the result of NotiCare's local URL check before forwarding a link. Native, like
 * [ThreatWarningActivity], so it appears instantly without starting React Native. Runs in its own
 * task: closing it returns to the app the link was tapped in.
 */
class LinkWarningActivity : Activity() {
    private val urlChecker: UrlChecker = RuleBasedUrlChecker()
    private var url: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        show(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        show(intent)
    }

    private fun show(intent: Intent) {
        url = intent.getStringExtra(EXTRA_URL).orEmpty()
        // Checked again here rather than trusting a passed-in verdict, so this screen always
        // matches the rules that will apply if the user opens the link.
        val result = urlChecker.check(url)
        if (url.isBlank()) {
            finishAndRemoveTask()
            return
        }
        val safe = result.verdict == UrlVerdict.SAFE
        val dangerous = result.verdict == UrlVerdict.DANGEROUS
        val accent = when {
            safe -> SAFE
            dangerous -> DANGER
            else -> CAUTION
        }
        setContentView(build(LinkWarningCopy.forContext(this), result, safe, dangerous, accent))
        // After setContentView: the window has no decor view (and no insets controller) before it.
        useDarkSystemBarIcons()
    }

    /** The screen is light, so the status and navigation bar icons must be dark to stay readable. */
    @Suppress("DEPRECATION")
    private fun useDarkSystemBarIcons() {
        window.statusBarColor = BACKGROUND
        window.navigationBarColor = BACKGROUND
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            window.insetsController?.setSystemBarsAppearance(light, light)
        } else {
            var flags = window.decorView.systemUiVisibility or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) flags = flags or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            window.decorView.systemUiVisibility = flags
        }
    }

    override fun onBackPressed() {
        finishAndRemoveTask()
    }

    private fun confirmOpen(copy: LinkWarningCopy.Copy) {
        AlertDialog.Builder(this)
            .setTitle(copy.confirmTitle)
            .setMessage(copy.confirmBody)
            .setNegativeButton(copy.confirmCancel, null)
            .setPositiveButton(copy.openAnyway) { _, _ ->
                forwardAnyway()
            }
            .show()
    }

    private fun forwardAnyway() {
        if (LinkForwarder.openPreferredBrowser(this, url)) finishAndRemoveTask()
    }

    private fun openPreferredBrowser() {
        if (LinkForwarder.openPreferredBrowser(this, url)) finishAndRemoveTask()
    }

    private fun build(
        copy: LinkWarningCopy.Copy,
        result: UrlCheckResult,
        safe: Boolean,
        dangerous: Boolean,
        accent: Int,
    ): ScrollView {
        val scroll = ScrollView(this).apply {
            setBackgroundColor(BACKGROUND)
            isFillViewport = true
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(28), dp(24), dp(24))
        }

        root.addView(TextView(this).apply {
            text = if (safe) "✓" else "!"
            textSize = 38f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            typeface = Typeface.DEFAULT_BOLD
            background = rounded(accent, 40f)
        }, LinearLayout.LayoutParams(dp(80), dp(80)))
        val badge = when {
            safe -> copy.badgeSafe
            dangerous -> copy.badgeDangerous
            else -> copy.badgeSuspicious
        }
        val title = when {
            safe -> copy.titleSafe
            dangerous -> copy.titleDangerous
            else -> copy.titleSuspicious
        }
        val intro = if (safe) copy.safeIntro else copy.intro
        root.addView(label(badge, 13f, accent, true), matchWidth(top = 20))
        root.addView(label(title, 27f, INK, true), matchWidth(top = 6))
        root.addView(label(intro, 15f, MUTED, false), matchWidth(top = 8))

        val site = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(14), dp(18), dp(16))
            background = rounded(Color.WHITE, 16f, accent)
            addView(label(copy.website, 12f, MUTED, true).apply { gravity = Gravity.START })
            addView(TextView(this@LinkWarningActivity).apply {
                text = highlightedUrl(url)
                textSize = 15f
                setTextColor(INK)
                setLineSpacing(0f, 1.15f)
                setTextIsSelectable(false)
            }, matchWidth(top = 6))
        }
        root.addView(site, matchWidth(top = 22))

        val why = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(14), dp(18), dp(16))
            val backgroundColor = when {
                safe -> Color.rgb(230, 246, 237)
                dangerous -> Color.rgb(255, 236, 235)
                else -> Color.rgb(255, 246, 225)
            }
            background = rounded(backgroundColor, 16f)
            if (!safe) addView(label(copy.why, 14f, accent, true).apply { gravity = Gravity.START })
            addView(
                label(if (safe) copy.safeCaveat else copy.reason(result), 15f, INK, false).apply {
                    gravity = Gravity.START
                },
                matchWidth(top = if (safe) 0 else 6),
            )
        }
        root.addView(why, matchWidth(top = 12))
        if (safe) {
            root.addView(Button(this).apply {
                val targetLabel = BrowserResolver.resolveTarget(
                    this@LinkWarningActivity,
                    BrowserPreferences.preferredBrowserPackage(this@LinkWarningActivity),
                )?.label
                text = targetLabel?.let(copy::openInBrowser) ?: copy.noBrowser
                textSize = 16f
                setTextColor(Color.WHITE)
                typeface = Typeface.DEFAULT_BOLD
                isAllCaps = false
                background = rounded(accent, 14f)
                isEnabled = targetLabel != null
                setOnClickListener { openPreferredBrowser() }
            }, matchWidth(height = 56, top = 28))
        } else {
            root.addView(label(copy.advice, 13f, MUTED, false), matchWidth(top = 16))
            root.addView(Button(this).apply {
                text = copy.goBack
                textSize = 16f
                setTextColor(Color.WHITE)
                typeface = Typeface.DEFAULT_BOLD
                isAllCaps = false
                background = rounded(accent, 14f)
                setOnClickListener { finishAndRemoveTask() }
            }, matchWidth(height = 56, top = 28))
            root.addView(Button(this).apply {
                text = copy.openAnyway
                textSize = 15f
                setTextColor(MUTED)
                isAllCaps = false
                background = rounded(Color.TRANSPARENT, 14f)
                setOnClickListener { confirmOpen(copy) }
            }, matchWidth(height = 52, top = 8))
        }

        scroll.addView(root)
        keepClearOfSystemBars(scroll)
        return scroll
    }

    /**
     * Android 15+ draws every app edge to edge, under the status and navigation bars. Pad the
     * screen by the bars' size so the title and buttons are never hidden behind them, on gesture
     * and three-button navigation alike.
     */
    @Suppress("DEPRECATION")
    private fun keepClearOfSystemBars(view: View) {
        view.setOnApplyWindowInsetsListener { target, insets ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                target.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            } else {
                target.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            }
            insets
        }
    }

    /** The full link, capped in length, with its host in bold so the real destination stands out. */
    private fun highlightedUrl(raw: String): CharSequence {
        val shown = if (raw.length > MAX_URL_CHARS) raw.take(MAX_URL_CHARS) + "…" else raw
        val host = UrlNormalizer.normalize(raw).host ?: return shown
        val start = shown.lowercase().indexOf(host)
        if (start < 0) return shown
        return SpannableString(shown).apply {
            setSpan(StyleSpan(Typeface.BOLD), start, start + host.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
    }

    private fun label(value: String, size: Float, color: Int, bold: Boolean) = TextView(this).apply {
        text = value
        textSize = size
        setTextColor(color)
        gravity = Gravity.CENTER_HORIZONTAL
        if (bold) typeface = Typeface.DEFAULT_BOLD
    }

    private fun matchWidth(height: Int = LinearLayout.LayoutParams.WRAP_CONTENT, top: Int = 0) =
        LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, if (height > 0) dp(height) else height).apply {
            topMargin = dp(top)
        }

    private fun rounded(fill: Int, radius: Float, stroke: Int? = null) = GradientDrawable().apply {
        setColor(fill)
        cornerRadius = dp(radius.toInt()).toFloat()
        if (stroke != null) setStroke(dp(2), stroke)
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

    companion object {
        const val EXTRA_URL = "url"
        private const val MAX_URL_CHARS = 300
        // Same colors as the SMS warning (ThreatWarningView).
        private val DANGER = Color.rgb(190, 45, 42)
        private val CAUTION = Color.rgb(178, 103, 0)
        private val SAFE = Color.rgb(35, 132, 76)
        private val INK = Color.rgb(25, 38, 57)
        private val MUTED = Color.rgb(82, 99, 122)
        private val BACKGROUND = Color.rgb(248, 249, 252)

        fun intent(context: Context, url: String) = Intent(context, LinkWarningActivity::class.java).apply {
            putExtra(EXTRA_URL, url)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }
}

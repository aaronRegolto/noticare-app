package __NOTICARE_PACKAGE__.bridge

import android.app.KeyguardManager
import android.content.Context
import android.graphics.PixelFormat
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowManager
import android.widget.FrameLayout

/**
 * Draws the full-screen warning directly over whatever app is in use (a game, TikTok, Facebook)
 * the moment a threat is detected. A full-screen-intent notification can't do this: Android only
 * shows it full screen while the phone is locked or the screen is off, and as a heads-up banner
 * otherwise. Requires the user-granted "Display over other apps" permission. Overlays can't
 * appear above the lock screen, so a locked or dark phone still goes through
 * [ThreatWarningActivity] via the notification's full-screen intent instead.
 */
object ThreatWarningOverlay {
  private const val TAG = "ThreatWarningOverlay"
  private val mainHandler = Handler(Looper.getMainLooper())
  private val shown = HashMap<String, View>()

  fun canDrawOverlays(context: Context): Boolean = Settings.canDrawOverlays(context)

  /** True when the phone is awake and unlocked, i.e. the user is actively using it. */
  fun isPhoneInUse(context: Context): Boolean {
    val power = context.getSystemService(PowerManager::class.java)
    val keyguard = context.getSystemService(KeyguardManager::class.java)
    return power?.isInteractive == true && keyguard?.isKeyguardLocked != true
  }

  /**
   * Shows the overlay if the permission is granted and the phone is in use. Returns false when it
   * shouldn't be attempted, so the caller can fall back to the full-screen-intent notification.
   * [onFailed] runs if Android still refuses the window after this returned true.
   */
  fun show(context: Context, threat: PendingThreat, onFailed: () -> Unit): Boolean {
    if (!canDrawOverlays(context) || !isPhoneInUse(context)) return false
    val appContext = context.applicationContext
    mainHandler.post {
      if (shown.containsKey(threat.token)) return@post
      val windowManager = appContext.getSystemService(WindowManager::class.java) ?: return@post onFailed()
      val onDecide = { block: Boolean ->
        ThreatDecisionCoordinator.decide(threat.token, block)
        NotiCareNotifications.dismissDangerChoice(appContext, threat.token)
      }
      val container = object : FrameLayout(appContext) {
        override fun dispatchKeyEvent(event: KeyEvent): Boolean {
          // Back is equivalent to Ignore, matching ThreatWarningActivity.
          if (event.keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP) {
            onDecide(false)
            return true
          }
          return super.dispatchKeyEvent(event)
        }
      }
      container.addView(ThreatWarningView.build(appContext, threat, onDecide))
      container.setOnApplyWindowInsetsListener { view, insets ->
        val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
        view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
        insets
      }
      container.setBackgroundColor(ThreatWarningView.danger)
      val params = WindowManager.LayoutParams(
        WindowManager.LayoutParams.MATCH_PARENT,
        WindowManager.LayoutParams.MATCH_PARENT,
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
        PixelFormat.OPAQUE,
      )
      try {
        windowManager.addView(container, params)
        shown[threat.token] = container
      } catch (error: RuntimeException) {
        // WindowManager.BadTokenException or SecurityException if the permission was revoked
        // between the check above and now.
        Log.w(TAG, "Unable to show the warning overlay.", error)
        onFailed()
      }
    }
    return true
  }

  fun dismiss(context: Context, token: String) {
    val appContext = context.applicationContext
    mainHandler.post {
      val view = shown.remove(token) ?: return@post
      runCatching { appContext.getSystemService(WindowManager::class.java)?.removeView(view) }
    }
  }
}

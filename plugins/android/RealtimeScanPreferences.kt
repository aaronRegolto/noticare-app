package __NOTICARE_PACKAGE__.bridge

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import java.io.IOException
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Locale
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first

private val Context.notiCarePreferences by preferencesDataStore(name = "noticare_preferences")

/**
 * Device-local preference only. It is deliberately default-off so a failed or
 * unavailable DataStore can never result in notification content being read.
 */
object RealtimeScanPreferences {
  private val scanningEnabledKey = booleanPreferencesKey("realtime_scanning_enabled")
  private val fullScreenWarningsKey = booleanPreferencesKey("full_screen_phishing_warnings")
  private val historyOwnerScopeKey = stringPreferencesKey("history_owner_scope_v1")
  private val subscriptionTierKey = stringPreferencesKey("subscription_tier_v1")
  private val scanQuotaMonthKey = stringPreferencesKey("scan_quota_month_v1")
  private val scanQuotaCountKey = intPreferencesKey("scan_quota_count_v1")
  private val scanQuotaNoticeMonthKey = stringPreferencesKey("scan_quota_notice_month_v1")

  /** Free tier's monthly cap on automatic (real-time) scans. Manual paste-text scanning is never limited. */
  const val freeMonthlyScanQuota = 10

  private fun currentYearMonth(): String = SimpleDateFormat("yyyy-MM", Locale.US).format(java.util.Date())

  suspend fun isScanningEnabled(context: Context): Boolean = context.notiCarePreferences.data
    .catch { error ->
      if (error is IOException) emit(emptyPreferences()) else throw error
    }
    .first()[scanningEnabledKey] ?: false

  suspend fun setScanningEnabled(context: Context, enabled: Boolean) {
    context.notiCarePreferences.edit { preferences ->
      preferences[scanningEnabledKey] = enabled
    }
  }

  /** Full-screen warnings are opt-in; banners remain the safe platform fallback. */
  suspend fun useFullScreenWarnings(context: Context): Boolean = context.notiCarePreferences.data
    .catch { error ->
      if (error is IOException) emit(emptyPreferences()) else throw error
    }
    .first()[fullScreenWarningsKey] ?: false

  suspend fun setFullScreenWarnings(context: Context, enabled: Boolean) {
    context.notiCarePreferences.edit { preferences ->
      preferences[fullScreenWarningsKey] = enabled
    }
  }

  /**
   * A stable SHA-256 scope used only to partition encrypted History records on
   * a shared device. The raw account identifier is never written to DataStore
   * or the History ciphertext.
   */
  suspend fun historyOwnerScope(context: Context): String? = context.notiCarePreferences.data
    .catch { error ->
      if (error is IOException) emit(emptyPreferences()) else throw error
    }
    .first()[historyOwnerScopeKey]

  /**
   * Clearing the owner also turns real-time scanning off. This prevents a
   * signed-out shared device from storing new raw SMS content without an owner.
   */
  suspend fun setHistoryOwner(context: Context, ownerId: String?) {
    val scope = ownerId
      ?.trim()
      ?.takeIf { it.isNotBlank() && it.length <= 256 }
      ?.let(::ownerScopeFor)
    context.notiCarePreferences.edit { preferences ->
      if (scope == null) {
        preferences.remove(historyOwnerScopeKey)
        preferences[scanningEnabledKey] = false
        // A shared device must never carry a signed-out user's paid tier over
        // to whichever account signs in next, before SubscriptionProvider has
        // had a chance to push the new account's real tier.
        preferences[subscriptionTierKey] = "free"
      } else {
        preferences[historyOwnerScopeKey] = scope
      }
    }
  }

  private fun ownerScopeFor(ownerId: String): String = MessageDigest
    .getInstance("SHA-256")
    .digest("noticare-history-owner-v1:$ownerId".toByteArray(Charsets.UTF_8))
    .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }

  /** Defaults to "free" so an unconfigured/pre-purchase install never behaves as unlimited. */
  suspend fun subscriptionTier(context: Context): String = context.notiCarePreferences.data
    .catch { error ->
      if (error is IOException) emit(emptyPreferences()) else throw error
    }
    .first()[subscriptionTierKey] ?: "free"

  suspend fun setSubscriptionTier(context: Context, tier: String) {
    context.notiCarePreferences.edit { preferences ->
      preferences[subscriptionTierKey] = tier
      // Full-screen warnings are Pro-only and are already re-checked against
      // tier at send time (see SmsNotificationListener), but also clearing the
      // preference here keeps the Settings screen's displayed selection honest
      // instead of showing "Full-screen" selected while it silently no-ops.
      if (tier != "pro") preferences[fullScreenWarningsKey] = false
    }
  }

  /**
   * Consumes one unit of the free tier's monthly automatic-scan quota. Returns
   * true if this scan is allowed to proceed. The counter resets whenever the
   * stored month no longer matches the device's current local calendar month —
   * there is no separate reset job. Paid tiers never call this.
   */
  suspend fun checkAndConsumeFreeScanQuota(context: Context): Boolean {
    val month = currentYearMonth()
    var allowed = false
    context.notiCarePreferences.edit { preferences ->
      val storedMonth = preferences[scanQuotaMonthKey]
      val currentCount = if (storedMonth == month) preferences[scanQuotaCountKey] ?: 0 else 0
      if (currentCount < freeMonthlyScanQuota) {
        preferences[scanQuotaMonthKey] = month
        preferences[scanQuotaCountKey] = currentCount + 1
        allowed = true
      }
    }
    return allowed
  }

  /** True at most once per calendar month, so the quota-exceeded upsell notification never spams. */
  suspend fun shouldShowQuotaExceededNotice(context: Context): Boolean {
    val month = currentYearMonth()
    var shouldShow = false
    context.notiCarePreferences.edit { preferences ->
      if (preferences[scanQuotaNoticeMonthKey] != month) {
        preferences[scanQuotaNoticeMonthKey] = month
        shouldShow = true
      }
    }
    return shouldShow
  }
}

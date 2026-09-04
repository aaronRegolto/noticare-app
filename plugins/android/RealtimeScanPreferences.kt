package __NOTICARE_PACKAGE__.bridge

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import java.io.IOException
import java.security.MessageDigest
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
      } else {
        preferences[historyOwnerScopeKey] = scope
      }
    }
  }

  private fun ownerScopeFor(ownerId: String): String = MessageDigest
    .getInstance("SHA-256")
    .digest("noticare-history-owner-v1:$ownerId".toByteArray(Charsets.UTF_8))
    .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
}

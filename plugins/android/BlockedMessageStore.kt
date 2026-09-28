package __NOTICARE_PACKAGE__.bridge

import android.content.Context
import java.security.MessageDigest
import java.util.Locale

/**
 * Messages the user chose to block from a real-time warning, remembered per signed-in profile so
 * a repeat of the same text is hidden quietly (a banner, no full-screen warning) and isn't scanned,
 * uploaded, or reported a second time. Only a SHA-256 of the normalized text is stored, never the
 * text itself. Normalization matches the server's normalize_phishing_message_text, so "the same
 * message" means the same thing on the phone and in the community ranking.
 */
object BlockedMessageStore {
  private const val prefsName = "noticare_blocked_messages"
  private const val maxEntries = 1000

  fun hash(text: String): String {
    val normalized = text.trim().lowercase(Locale.ROOT).replace(Regex("\\s+"), " ")
    return MessageDigest.getInstance("SHA-256")
      .digest(normalized.toByteArray(Charsets.UTF_8))
      .joinToString(separator = "") { byte -> "%02x".format(Locale.ROOT, byte.toInt() and 0xff) }
  }

  @Synchronized
  fun contains(context: Context, ownerScope: String, messageHash: String): Boolean =
    read(context, ownerScope).contains(messageHash)

  @Synchronized
  fun remember(context: Context, ownerScope: String, messageHash: String) {
    val hashes = read(context, ownerScope).filter { it != messageHash }.toMutableList()
    hashes += messageHash
    // Oldest first; keep the most recent blocks when the list is full.
    val kept = hashes.takeLast(maxEntries)
    prefs(context).edit().putString(key(ownerScope), kept.joinToString(",")).apply()
  }

  private fun read(context: Context, ownerScope: String): List<String> =
    prefs(context).getString(key(ownerScope), null)?.split(',')?.filter { it.length == 64 } ?: emptyList()

  private fun key(ownerScope: String) = "hashes.$ownerScope"

  private fun prefs(context: Context) = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
}

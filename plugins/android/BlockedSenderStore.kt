package __NOTICARE_PACKAGE__.bridge

import android.content.Context
import java.security.MessageDigest
import java.util.Locale

object BlockedSenderStore {
  private const val prefsName = "noticare_blocked_senders"
  private const val maxEntries = 1000

  fun normalize(sender: String): String =
    sender.trim().lowercase(Locale.ROOT).replace(Regex("\\s+"), " ")

  fun hash(sender: String, sourcePackage: String? = null): String {
    val scoped = sourcePackage?.let { "$it\n${normalize(sender)}" } ?: normalize(sender)
    return MessageDigest.getInstance("SHA-256")
      .digest(scoped.toByteArray(Charsets.UTF_8))
      .joinToString("") { byte -> "%02x".format(Locale.ROOT, byte.toInt() and 0xff) }
  }

  @Synchronized
  fun contains(context: Context, ownerScope: String, sender: String, sourcePackage: String): Boolean {
    val scopedHash = hash(sender, sourcePackage)
    val senderHash = hash(sender)
    return read(context, ownerScope).any { it == scopedHash || it == senderHash }
  }

  @Synchronized
  fun block(context: Context, ownerScope: String, sender: String, sourcePackage: String) {
    val hashes = read(context, ownerScope).filter { it != hash(sender, sourcePackage) }.toMutableList()
    hashes += hash(sender, sourcePackage)
    hashes += hash(sender)
    prefs(context).edit().putString(key(ownerScope), hashes.distinct().takeLast(maxEntries).joinToString(",")).apply()
    val labels = labels(context, ownerScope).toMutableMap()
    labels[hash(sender, sourcePackage)] = normalize(sender)
    labels[hash(sender)] = normalize(sender)
    prefs(context).edit().putString(labelKey(ownerScope), labels.entries.joinToString(";") { "${it.key}=${it.value.replace(";", " ").replace("=", " ")}" }).apply()
  }

  @Synchronized
  fun unblock(context: Context, ownerScope: String, senderHash: String) {
    val remaining = read(context, ownerScope).filter { it != senderHash }
    prefs(context).edit().putString(key(ownerScope), remaining.joinToString(",")).apply()
    val labels = labels(context, ownerScope).toMutableMap()
    labels.remove(senderHash)
    prefs(context).edit().putString(labelKey(ownerScope), labels.entries.joinToString(";") { "${it.key}=${it.value.replace(";", " ").replace("=", " ")}" }).apply()
  }

  @Synchronized
  fun list(context: Context, ownerScope: String): List<String> =
    read(context, ownerScope).filter { it.length == 64 }.distinct()
      .mapNotNull { senderHash -> labels(context, ownerScope)[senderHash]?.let { "$senderHash|$it" } }

  private fun read(context: Context, ownerScope: String): List<String> =
    prefs(context).getString(key(ownerScope), null)?.split(',')?.filter { it.isNotBlank() } ?: emptyList()

  private fun key(ownerScope: String) = "sender-hashes.$ownerScope"
  private fun labelKey(ownerScope: String) = "sender-labels.$ownerScope"
  private fun labels(context: Context, ownerScope: String): Map<String, String> =
    prefs(context).getString(labelKey(ownerScope), null)?.split(';')?.mapNotNull { entry ->
      val parts = entry.split('=', limit = 2)
      if (parts.size == 2) parts[0] to parts[1] else null
    }?.toMap() ?: emptyMap()
  private fun prefs(context: Context) = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
}

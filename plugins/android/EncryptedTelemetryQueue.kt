package __NOTICARE_PACKAGE__.bridge

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.io.File
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import org.json.JSONArray
import org.json.JSONObject

/**
 * Offline queue containing sanitized aggregate metadata only. It intentionally
 * has no SMS text, sender, notification title, raw URL, account, or token.
 */
object EncryptedTelemetryQueue {
  private const val keyAlias = "NotiCareTelemetryQueueKey.v1"
  private const val fileName = "noticare-telemetry-queue.v1"
  private const val transformation = "AES/GCM/NoPadding"
  private const val ivLength = 12
  private const val maxEvents = 500
  private const val maxClaimBatch = 50
  private const val initialBackoffMs = 30_000L
  private const val maxBackoffMs = 24 * 60 * 60 * 1000L

  data class Event(
    val id: String,
    val source: String,
    val level: String,
    val scoreBucket: Int,
    val blocked: Boolean,
    val indicatorCodes: List<String>,
    val urlCount: Int,
    val ruleVersion: String,
    val occurredAt: Long,
    val attemptCount: Int,
    val nextAttemptAt: Long,
  )

  @Synchronized
  fun enqueue(context: Context, result: ThreatResult, blocked: Boolean, occurredAt: Long) {
    runCatching {
      val events = read(context).toMutableList()
      events += Event(
        id = UUID.randomUUID().toString(),
        source = "realtime",
        level = result.level.wireValue,
        scoreBucket = normalizeTelemetryScoreBucket(result.level.wireValue, scoreBucket(result.score)),
        blocked = blocked,
        indicatorCodes = result.reasons.map(ThreatReason::code).distinct().sorted(),
        urlCount = result.urls.size,
        ruleVersion = result.ruleVersion,
        occurredAt = occurredAt,
        attemptCount = 0,
        nextAttemptAt = 0L,
      )
      if (events.size > maxEvents) {
        events.sortBy { it.occurredAt }
        while (events.size > maxEvents) events.removeAt(0)
      }
      write(context, events)
    }
  }

  /**
   * Claiming advances the retry clock before the bridge returns events. If the
   * JS process dies mid-upload, the same client UUID can safely be retried.
   */
  @Synchronized
  fun claimPending(context: Context, now: Long = System.currentTimeMillis()): List<Event> {
    val events = read(context).toMutableList()
    val due = events.filter { it.nextAttemptAt <= now }
      .sortedBy { it.occurredAt }
      .take(maxClaimBatch)
    if (due.isEmpty()) return emptyList()

    val dueIds = due.map(Event::id).toSet()
    val updated = events.map { event ->
      if (event.id !in dueIds) event
      else event.copy(
        attemptCount = event.attemptCount + 1,
        nextAttemptAt = now + backoffForAttempt(event.attemptCount + 1),
      )
    }
    write(context, updated)
    return due
  }

  @Synchronized
  fun acknowledge(context: Context, ids: Set<String>): Int {
    if (ids.isEmpty()) return 0
    val events = read(context).toMutableList()
    val before = events.size
    events.removeAll { it.id in ids }
    if (events.size != before) write(context, events)
    return before - events.size
  }

  /** 0 through 10; suitable for the Supabase smallint score-bucket field. */
  private fun scoreBucket(score: Int): Int = score.coerceIn(0, 100) / 10

  private fun backoffForAttempt(attempt: Int): Long {
    val multiplier = 1L shl (attempt - 1).coerceAtMost(10)
    return (initialBackoffMs * multiplier).coerceAtMost(maxBackoffMs)
  }

  private fun file(context: Context) = File(context.filesDir, fileName)

  private fun read(context: Context): List<Event> {
    val target = file(context)
    if (!target.exists()) return emptyList()
    val encoded = target.readText(Charsets.UTF_8)
    if (encoded.isBlank()) return emptyList()
    val records = JSONObject(decrypt(encoded)).optJSONArray("events") ?: JSONArray()
    return buildList {
      for (index in 0 until records.length()) eventFromJson(records.optJSONObject(index))?.let(::add)
    }
  }

  private fun write(context: Context, events: List<Event>) {
    val root = JSONObject().apply {
      put("version", 1)
      put("events", JSONArray().apply { events.forEach { put(eventToJson(it)) } })
    }
    val target = file(context)
    val temporary = File(context.filesDir, "$fileName.tmp")
    temporary.writeText(encrypt(root.toString()), Charsets.UTF_8)
    if (!temporary.renameTo(target)) {
      temporary.delete()
      throw IllegalStateException("Unable to update encrypted telemetry queue")
    }
  }

  private fun secretKey(): SecretKey {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (keyStore.getKey(keyAlias, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
      init(
        KeyGenParameterSpec.Builder(
          keyAlias,
          KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
          .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
          .setRandomizedEncryptionRequired(true)
          .build(),
      )
      generateKey()
    }
  }

  private fun encrypt(plainText: String): String {
    val cipher = Cipher.getInstance(transformation).apply { init(Cipher.ENCRYPT_MODE, secretKey()) }
    val ciphertext = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))
    val output = ByteArray(1 + cipher.iv.size + ciphertext.size)
    output[0] = cipher.iv.size.toByte()
    System.arraycopy(cipher.iv, 0, output, 1, cipher.iv.size)
    System.arraycopy(ciphertext, 0, output, 1 + cipher.iv.size, ciphertext.size)
    return Base64.encodeToString(output, Base64.NO_WRAP)
  }

  private fun decrypt(encoded: String): String {
    val input = Base64.decode(encoded, Base64.NO_WRAP)
    require(input.isNotEmpty()) { "Encrypted telemetry queue is empty" }
    val actualIvLength = input[0].toInt() and 0xff
    require(actualIvLength == ivLength && input.size > actualIvLength + 1) { "Encrypted telemetry queue has invalid format" }
    val iv = input.copyOfRange(1, 1 + actualIvLength)
    val ciphertext = input.copyOfRange(1 + actualIvLength, input.size)
    return Cipher.getInstance(transformation).run {
      init(Cipher.DECRYPT_MODE, secretKey(), javax.crypto.spec.GCMParameterSpec(128, iv))
      doFinal(ciphertext).toString(Charsets.UTF_8)
    }
  }

  private fun eventToJson(event: Event) = JSONObject().apply {
    put("id", event.id)
    put("source", event.source)
    put("level", event.level)
    put("scoreBucket", event.scoreBucket)
    put("blocked", event.blocked)
    put("indicatorCodes", JSONArray(event.indicatorCodes))
    put("urlCount", event.urlCount)
    put("ruleVersion", event.ruleVersion)
    put("occurredAt", event.occurredAt)
    put("attemptCount", event.attemptCount)
    put("nextAttemptAt", event.nextAttemptAt)
  }

  private fun eventFromJson(json: JSONObject?): Event? {
    json ?: return null
    val id = json.optString("id").takeIf { it.isNotBlank() } ?: return null
    val level = json.optString("level").takeIf { it in setOf("safe", "suspicious", "dangerous") } ?: return null
    val codes = buildList {
      val raw = json.optJSONArray("indicatorCodes") ?: return@buildList
      for (index in 0 until raw.length()) raw.optString(index).takeIf { it.isNotBlank() }?.let(::add)
    }
    return Event(
      id = id,
      source = "realtime",
      level = level,
      // Safe events queued by older builds can carry bucket 1–2; Safe always uploads as 0.
      scoreBucket = normalizeTelemetryScoreBucket(level, json.optInt("scoreBucket")),
      blocked = json.optBoolean("blocked"),
      indicatorCodes = codes,
      urlCount = json.optInt("urlCount").coerceAtLeast(0),
      ruleVersion = json.optString("ruleVersion"),
      occurredAt = json.optLong("occurredAt"),
      attemptCount = json.optInt("attemptCount").coerceAtLeast(0),
      nextAttemptAt = json.optLong("nextAttemptAt").coerceAtLeast(0),
    )
  }
}

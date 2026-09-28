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
 * Offline queue for "Block & Report" taps on a real-time Dangerous notification.
 * Unlike EncryptedTelemetryQueue, this intentionally does carry the message
 * text and sender: it exists only because the user explicitly chose to warn
 * other NotiCare users about this exact message. It stays encrypted at rest
 * and is only ever read by the JS bridge to upload it via the signed-in
 * user's own authenticated Supabase session.
 */
object EncryptedCommunityReportQueue {
  private const val keyAlias = "NotiCareCommunityReportQueueKey.v1"
  private const val fileName = "noticare-community-report-queue.v1"
  private const val transformation = "AES/GCM/NoPadding"
  private const val ivLength = 12
  private const val maxReports = 100
  private const val maxClaimBatch = 20
  private const val initialBackoffMs = 30_000L
  private const val maxBackoffMs = 24 * 60 * 60 * 1000L

  data class Report(
    val id: String,
    val messageText: String,
    val sampleSender: String?,
    val indicatorCodes: List<String>,
    val ruleVersion: String,
    /** The detector's 0-100 risk score for this message; null for reports queued before it was stored. */
    val riskScore: Int?,
    val createdAt: Long,
    val attemptCount: Int,
    val nextAttemptAt: Long,
  )

  @Synchronized
  fun enqueue(
    context: Context,
    messageText: String,
    sampleSender: String?,
    indicatorCodes: List<String>,
    ruleVersion: String,
    riskScore: Int,
  ) {
    runCatching {
      val reports = read(context).toMutableList()
      reports += Report(
        id = UUID.randomUUID().toString(),
        messageText = messageText.take(4000),
        sampleSender = sampleSender?.take(120),
        indicatorCodes = indicatorCodes.distinct().take(32),
        ruleVersion = ruleVersion,
        riskScore = riskScore.coerceIn(0, 100),
        createdAt = System.currentTimeMillis(),
        attemptCount = 0,
        nextAttemptAt = 0L,
      )
      if (reports.size > maxReports) {
        reports.sortBy { it.createdAt }
        while (reports.size > maxReports) reports.removeAt(0)
      }
      write(context, reports)
    }
  }

  @Synchronized
  fun claimPending(context: Context, now: Long = System.currentTimeMillis()): List<Report> {
    val reports = read(context).toMutableList()
    val due = reports.filter { it.nextAttemptAt <= now }
      .sortedBy { it.createdAt }
      .take(maxClaimBatch)
    if (due.isEmpty()) return emptyList()

    val dueIds = due.map(Report::id).toSet()
    val updated = reports.map { report ->
      if (report.id !in dueIds) report
      else report.copy(
        attemptCount = report.attemptCount + 1,
        nextAttemptAt = now + backoffForAttempt(report.attemptCount + 1),
      )
    }
    write(context, updated)
    return due
  }

  @Synchronized
  fun acknowledge(context: Context, ids: Set<String>): Int {
    if (ids.isEmpty()) return 0
    val reports = read(context).toMutableList()
    val before = reports.size
    reports.removeAll { it.id in ids }
    if (reports.size != before) write(context, reports)
    return before - reports.size
  }

  private fun backoffForAttempt(attempt: Int): Long {
    val multiplier = 1L shl (attempt - 1).coerceAtMost(10)
    return (initialBackoffMs * multiplier).coerceAtMost(maxBackoffMs)
  }

  private fun file(context: Context) = File(context.filesDir, fileName)

  private fun read(context: Context): List<Report> {
    val target = file(context)
    if (!target.exists()) return emptyList()
    val encoded = target.readText(Charsets.UTF_8)
    if (encoded.isBlank()) return emptyList()
    val records = JSONObject(decrypt(encoded)).optJSONArray("reports") ?: JSONArray()
    return buildList {
      for (index in 0 until records.length()) reportFromJson(records.optJSONObject(index))?.let(::add)
    }
  }

  private fun write(context: Context, reports: List<Report>) {
    val root = JSONObject().apply {
      put("version", 1)
      put("reports", JSONArray().apply { reports.forEach { put(reportToJson(it)) } })
    }
    val target = file(context)
    val temporary = File(context.filesDir, "$fileName.tmp")
    temporary.writeText(encrypt(root.toString()), Charsets.UTF_8)
    if (!temporary.renameTo(target)) {
      temporary.delete()
      throw IllegalStateException("Unable to update encrypted community report queue")
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
    require(input.isNotEmpty()) { "Encrypted community report queue is empty" }
    val actualIvLength = input[0].toInt() and 0xff
    require(actualIvLength == ivLength && input.size > actualIvLength + 1) { "Encrypted community report queue has invalid format" }
    val iv = input.copyOfRange(1, 1 + actualIvLength)
    val ciphertext = input.copyOfRange(1 + actualIvLength, input.size)
    return Cipher.getInstance(transformation).run {
      init(Cipher.DECRYPT_MODE, secretKey(), javax.crypto.spec.GCMParameterSpec(128, iv))
      doFinal(ciphertext).toString(Charsets.UTF_8)
    }
  }

  private fun reportToJson(report: Report) = JSONObject().apply {
    put("id", report.id)
    put("messageText", report.messageText)
    put("sampleSender", report.sampleSender)
    put("indicatorCodes", JSONArray(report.indicatorCodes))
    put("ruleVersion", report.ruleVersion)
    report.riskScore?.let { put("riskScore", it) }
    put("createdAt", report.createdAt)
    put("attemptCount", report.attemptCount)
    put("nextAttemptAt", report.nextAttemptAt)
  }

  private fun reportFromJson(json: JSONObject?): Report? {
    json ?: return null
    val id = json.optString("id").takeIf { it.isNotBlank() } ?: return null
    val messageText = json.optString("messageText").takeIf { it.isNotBlank() } ?: return null
    val codes = buildList {
      val raw = json.optJSONArray("indicatorCodes") ?: return@buildList
      for (index in 0 until raw.length()) raw.optString(index).takeIf { it.isNotBlank() }?.let(::add)
    }
    return Report(
      id = id,
      messageText = messageText,
      sampleSender = json.optString("sampleSender").takeIf { it.isNotBlank() },
      indicatorCodes = codes,
      ruleVersion = json.optString("ruleVersion"),
      riskScore = if (json.has("riskScore")) json.optInt("riskScore").coerceIn(0, 100) else null,
      createdAt = json.optLong("createdAt"),
      attemptCount = json.optInt("attemptCount").coerceAtLeast(0),
      nextAttemptAt = json.optLong("nextAttemptAt").coerceAtLeast(0),
    )
  }
}

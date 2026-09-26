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
 * The file contains one AES-GCM ciphertext, not a plaintext database. The AES
 * key is generated in Android Keystore and never crosses the native boundary.
 */
object EncryptedHistoryStore {
  private const val keyAlias = "NotiCareBlockedHistoryKey.v1"
  private const val fileName = "noticare-blocked-history.v1"
  private const val lifetimeFileName = "noticare-blocked-history-lifetime.v1"
  private const val transformation = "AES/GCM/NoPadding"
  private const val ivLength = 12

  /**
   * The whole record set is one encrypted JSON blob (see readRecords/writeRecords): every read
   * decrypts and parses it, and every write re-serializes and re-encrypts it in full. That cost
   * grows with total record count, so an account that keeps NotiCare active for a long time and
   * catches many Dangerous messages would otherwise make every scan, list load, and read/delete
   * tap progressively slower. Capping detail records per account bounds that cost independent of
   * how long the app has been protecting the device. `lifetimeBlockedCount` tracks the true
   * all-time total separately (in its own tiny file) so the Dashboard's "Total blocked" stat
   * keeps counting up correctly even once older detail records have been pruned.
   */
  private const val maxRetainedRecordsPerScope = 500

  /** Free tier's smaller cap; Pro uses [maxRetainedRecordsPerScope]. */
  private const val maxRetainedRecordsPerScopeFree = 20

  sealed class SaveResult {
    data class Saved(val id: String) : SaveResult()
    data class Unavailable(val diagnostic: String) : SaveResult()
  }

  @Synchronized
  fun saveScanned(
    context: Context,
    ownerScope: String,
    sender: String?,
    receivedAt: Long,
    score: Int,
    message: String,
    reasons: List<ThreatReason>,
    urls: List<ExtractedUrl>,
    sourcePackage: String,
    ruleVersion: String,
    level: ThreatLevel,
    retentionLimit: Int = maxRetainedRecordsPerScope,
  ): SaveResult {
    if (message.isBlank()) return SaveResult.Unavailable("content_unavailable")

    return runCatching {
      val record = BlockedHistoryRecord(
        id = UUID.randomUUID().toString(),
        ownerScope = ownerScope,
        sender = sender?.takeIf { it.isNotBlank() },
        receivedAt = receivedAt,
        score = score,
        message = message,
        redactedPreview = redactedPreview(),
        reasons = reasons,
        urls = urls,
        sourcePackage = sourcePackage,
        ruleVersion = ruleVersion,
        level = level,
        blocked = false,
      )
      val merged = readRecords(context).toMutableList().apply { add(record) }
      writeRecords(context, pruneOldestBeyondCap(merged, ownerScope, retentionLimit))
      incrementLifetimeBlocked(context, ownerScope)
      SaveResult.Saved(record.id)
    }.getOrElse { error ->
      ScanRuntime.markStorageUnavailable()
      // Do not persist a fallback plaintext copy when Keystore or storage fails.
      SaveResult.Unavailable(error.javaClass.simpleName)
    }
  }

  @Synchronized
  fun list(context: Context, ownerScope: String): List<BlockedHistoryRecord> = readRecords(context)
    .filter { it.ownerScope == ownerScope }
    .sortedByDescending { it.receivedAt }

  @Synchronized
  fun find(context: Context, id: String, ownerScope: String): BlockedHistoryRecord? = readRecords(context)
    .firstOrNull { it.id == id && it.ownerScope == ownerScope }

  /** Updates the captured item rather than creating a second copy after Block. */
  @Synchronized
  fun markBlocked(context: Context, id: String, ownerScope: String): Boolean {
    val records = readRecords(context)
    if (records.none { it.id == id && it.ownerScope == ownerScope }) return false
    writeRecords(context, records.map {
      if (it.id == id && it.ownerScope == ownerScope) it.copy(blocked = true) else it
    })
    return true
  }

  @Synchronized
  fun markRead(context: Context, id: String, ownerScope: String): Boolean {
    val records = readRecords(context)
    val record = records.firstOrNull { it.id == id && it.ownerScope == ownerScope } ?: return false
    if (!record.isRead) writeRecords(context, records.map {
      if (it.id == id && it.ownerScope == ownerScope) it.copy(isRead = true) else it
    })
    return true
  }

  @Synchronized
  fun delete(context: Context, id: String, ownerScope: String): Boolean {
    val records = readRecords(context).toMutableList()
    val deleted = records.removeAll { it.id == id && it.ownerScope == ownerScope }
    if (deleted) writeRecords(context, records)
    return deleted
  }

  @Synchronized
  fun clear(context: Context, ownerScope: String): Int {
    val records = readRecords(context)
    val retained = records.filterNot { it.ownerScope == ownerScope }
    val removed = records.size - retained.size
    if (removed == 0) return 0
    if (retained.isEmpty()) {
      val target = storageFile(context)
      if (target.exists() && !target.delete()) {
        // An encrypted file that cannot be removed is safer than replacing it
        // with plaintext or partially writing an empty record set.
        throw IllegalStateException("Unable to clear encrypted NotiCare history")
      }
    } else {
      writeRecords(context, retained)
    }
    return removed
  }

  /** How many detail records an account keeps before the oldest are pruned. Shown in Settings so pruning is never a silent surprise. */
  fun retentionLimitPerAccount(tier: String): Int =
    if (tier == "free") maxRetainedRecordsPerScopeFree else maxRetainedRecordsPerScope

  /**
   * The true all-time blocked count for this account, independent of how many detail records are
   * currently retained. Falls back to counting existing records for accounts that saved history
   * before this counter existed, so an upgrade never appears to reset someone's total to zero.
   */
  @Synchronized
  fun lifetimeBlockedCount(context: Context, ownerScope: String): Int =
    readLifetimeCounts(context)[ownerScope] ?: list(context, ownerScope).size

  @Synchronized
  private fun incrementLifetimeBlocked(context: Context, ownerScope: String) {
    val counts = readLifetimeCounts(context).toMutableMap()
    val current = counts[ownerScope] ?: list(context, ownerScope).size
    counts[ownerScope] = current + 1
    writeLifetimeCounts(context, counts)
  }

  /** Keeps only the newest [retentionLimit] records for the scope that just wrote a new one (or downgraded); every other account's records are untouched. */
  private fun pruneOldestBeyondCap(
    records: List<BlockedHistoryRecord>,
    ownerScope: String,
    retentionLimit: Int,
  ): List<BlockedHistoryRecord> {
    val scoped = records.filter { it.ownerScope == ownerScope }
    if (scoped.size <= retentionLimit) return records
    val keepIds = scoped.sortedByDescending { it.receivedAt }.take(retentionLimit).map { it.id }.toSet()
    return records.filter { it.ownerScope != ownerScope || it.id in keepIds }
  }

  private fun lifetimeFile(context: Context) = File(context.filesDir, lifetimeFileName)

  private fun readLifetimeCounts(context: Context): Map<String, Int> {
    val file = lifetimeFile(context)
    if (!file.exists()) return emptyMap()
    val encoded = file.readText(Charsets.UTF_8)
    if (encoded.isBlank()) return emptyMap()
    val json = JSONObject(decrypt(encoded))
    return buildMap {
      json.keys().forEach { scope -> put(scope, json.optInt(scope, 0)) }
    }
  }

  private fun writeLifetimeCounts(context: Context, counts: Map<String, Int>) {
    val json = JSONObject().apply {
      counts.forEach { (scope, count) -> put(scope, count) }
    }
    val target = lifetimeFile(context)
    val temporary = File(context.filesDir, "$lifetimeFileName.tmp")
    temporary.writeText(encrypt(json.toString()), Charsets.UTF_8)
    if (!temporary.renameTo(target)) {
      temporary.delete()
      throw IllegalStateException("Unable to atomically replace encrypted NotiCare lifetime counters")
    }
  }

  @Synchronized
  fun storageAvailable(context: Context): Boolean = runCatching {
    secretKey()
    storageFile(context)
    true
  }.getOrElse {
    ScanRuntime.markStorageUnavailable()
    false
  }

  private fun storageFile(context: Context) = File(context.filesDir, fileName)

  private fun readRecords(context: Context): List<BlockedHistoryRecord> {
    val encryptedFile = storageFile(context)
    if (!encryptedFile.exists()) return emptyList()

    val encoded = encryptedFile.readText(Charsets.UTF_8)
    if (encoded.isBlank()) return emptyList()
    val root = JSONObject(decrypt(encoded))
    val records = root.optJSONArray("records") ?: JSONArray()
    return buildList {
      for (index in 0 until records.length()) {
        recordFromJson(records.optJSONObject(index))?.let(::add)
      }
    }
  }

  private fun writeRecords(context: Context, records: List<BlockedHistoryRecord>) {
    val root = JSONObject().apply {
      put("version", 1)
      put("records", JSONArray().apply {
        records.forEach { put(recordToJson(it)) }
      })
    }
    val target = storageFile(context)
    val temporary = File(context.filesDir, "$fileName.tmp")
    temporary.writeText(encrypt(root.toString()), Charsets.UTF_8)
    if (!temporary.renameTo(target)) {
      temporary.delete()
      throw IllegalStateException("Unable to atomically replace encrypted NotiCare history")
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
    val cipher = Cipher.getInstance(transformation).apply {
      init(Cipher.ENCRYPT_MODE, secretKey())
    }
    val ciphertext = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))
    val output = ByteArray(1 + cipher.iv.size + ciphertext.size)
    output[0] = cipher.iv.size.toByte()
    System.arraycopy(cipher.iv, 0, output, 1, cipher.iv.size)
    System.arraycopy(ciphertext, 0, output, 1 + cipher.iv.size, ciphertext.size)
    return Base64.encodeToString(output, Base64.NO_WRAP)
  }

  private fun decrypt(encoded: String): String {
    val input = Base64.decode(encoded, Base64.NO_WRAP)
    require(input.isNotEmpty()) { "Encrypted history is empty" }
    val actualIvLength = input[0].toInt() and 0xff
    require(actualIvLength == ivLength && input.size > actualIvLength + 1) { "Encrypted history has invalid format" }
    val iv = input.copyOfRange(1, 1 + actualIvLength)
    val ciphertext = input.copyOfRange(1 + actualIvLength, input.size)
    val cipher = Cipher.getInstance(transformation).apply {
      init(Cipher.DECRYPT_MODE, secretKey(), javax.crypto.spec.GCMParameterSpec(128, iv))
    }
    return cipher.doFinal(ciphertext).toString(Charsets.UTF_8)
  }

  private fun recordToJson(record: BlockedHistoryRecord) = JSONObject().apply {
    put("id", record.id)
    put("ownerScope", record.ownerScope)
    put("sender", record.sender)
    put("receivedAt", record.receivedAt)
    put("score", record.score)
    put("level", record.level.wireValue)
    put("blocked", record.blocked)
    put("isRead", record.isRead)
    put("message", record.message)
    put("redactedPreview", record.redactedPreview)
    put("sourcePackage", record.sourcePackage)
    put("ruleVersion", record.ruleVersion)
    put("reasons", JSONArray().apply {
      record.reasons.forEach { reason ->
        put(JSONObject().apply {
          put("code", reason.code)
          put("label", reason.label)
          put("description", reason.description)
          put("weight", reason.weight)
        })
      }
    })
    put("urls", JSONArray().apply {
      record.urls.forEach { url ->
        put(JSONObject().apply {
          put("display", url.display)
          put("normalizedDomain", url.normalizedDomain)
          put("indicators", JSONArray(url.indicators))
        })
      }
    })
  }

  private fun recordFromJson(json: JSONObject?): BlockedHistoryRecord? {
    json ?: return null
    val id = json.optString("id").takeIf { it.isNotBlank() } ?: return null
    val message = json.optString("message").takeIf { it.isNotBlank() } ?: return null
    return BlockedHistoryRecord(
      id = id,
      // Legacy records without a scope remain encrypted but are intentionally
      // invisible to every account on a shared device.
      ownerScope = json.optString("ownerScope").takeIf { it.isNotBlank() },
      sender = json.optString("sender").takeIf { it.isNotBlank() },
      receivedAt = json.optLong("receivedAt"),
      score = json.optInt("score").coerceIn(0, 100),
      level = ThreatLevel.entries.firstOrNull { it.wireValue == json.optString("level") } ?: ThreatLevel.DANGEROUS,
      blocked = json.optBoolean("blocked", true),
      isRead = json.optBoolean("isRead", false),
      message = message,
      redactedPreview = json.optString("redactedPreview").takeIf { it.isNotBlank() } ?: redactedPreview(),
      reasons = reasonsFromJson(json.optJSONArray("reasons")),
      urls = urlsFromJson(json.optJSONArray("urls")),
      sourcePackage = json.optString("sourcePackage"),
      ruleVersion = json.optString("ruleVersion", SmishingEvaluator.RULE_VERSION),
    )
  }

  private fun reasonsFromJson(array: JSONArray?): List<ThreatReason> = buildList {
    if (array == null) return@buildList
    for (index in 0 until array.length()) {
      val item = array.optJSONObject(index) ?: continue
      val code = item.optString("code")
      if (code.isBlank()) continue
      add(
        ThreatReason(
          code = code,
          label = item.optString("label"),
          description = item.optString("description"),
          weight = item.optInt("weight"),
        ),
      )
    }
  }

  private fun urlsFromJson(array: JSONArray?): List<ExtractedUrl> = buildList {
    if (array == null) return@buildList
    for (index in 0 until array.length()) {
      val item = array.optJSONObject(index) ?: continue
      val display = item.optString("display")
      if (display.isBlank()) continue
      val indicators = buildList {
        val rawIndicators = item.optJSONArray("indicators") ?: return@buildList
        for (indicatorIndex in 0 until rawIndicators.length()) {
          rawIndicators.optString(indicatorIndex).takeIf { it.isNotBlank() }?.let(::add)
        }
      }
      add(
        ExtractedUrl(
          display = display,
          normalizedDomain = item.optString("normalizedDomain").takeIf { it.isNotBlank() },
          indicators = indicators,
        ),
      )
    }
  }

  fun maskedSender(sender: String?): String = when {
    sender.isNullOrBlank() -> "Unknown sender"
    sender.length <= 2 -> "•••"
    else -> "•••${sender.takeLast(2)}"
  }

  /**
   * This is intentionally not an excerpt. It contains no message words, URLs,
   * phone numbers, OTPs, or sender/title material; the full encrypted body is
   * available only through an explicit getHistoryRecord(id) request.
   */
  fun redactedPreview(): String = "Content redacted. Open to view the protected SMS."

}

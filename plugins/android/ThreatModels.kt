package __NOTICARE_PACKAGE__.bridge

data class ThreatReason(
  val code: String,
  val label: String,
  val description: String,
  val weight: Int,
)

data class ExtractedUrl(
  val display: String,
  val normalizedDomain: String?,
  val indicators: List<String>,
)

enum class ThreatLevel(val wireValue: String) {
  SAFE("safe"),
  SUSPICIOUS("suspicious"),
  DANGEROUS("dangerous"),
}

internal fun ThreatLevel.shouldRetainInHistory(): Boolean = this != ThreatLevel.SAFE

data class ThreatResult(
  val level: ThreatLevel,
  val score: Int,
  val reasons: List<ThreatReason>,
  val urls: List<ExtractedUrl>,
  val ruleVersion: String,
)

/**
 * Safe always shows 0. Runs once on the final result, after V3RiskEvaluator.combine (which needs
 * the raw Safe score and weights). The level is unchanged; a Safe result keeps its reason codes
 * (telemetry uses them for rule tuning) but every weight becomes 0, so the points still add up to
 * the score. Non-Safe results are returned unchanged, and applying it twice changes nothing.
 */
fun finalizeThreatResult(result: ThreatResult): ThreatResult =
  if (result.level != ThreatLevel.SAFE) result
  else result.copy(score = 0, reasons = result.reasons.map { it.copy(weight = 0) })

/** Older builds stored Safe records with a 1–29 score and weighted reasons; they read back as Safe 0. */
fun normalizeHistoryRecord(record: BlockedHistoryRecord): BlockedHistoryRecord =
  if (record.level != ThreatLevel.SAFE) record
  else record.copy(score = 0, reasons = record.reasons.map { it.copy(weight = 0) })

/** 0 through 10. Safe is always bucket 0, including events older builds queued with buckets 1–2. */
fun normalizeTelemetryScoreBucket(level: String, scoreBucket: Int): Int =
  if (level == ThreatLevel.SAFE.wireValue) 0 else scoreBucket.coerceIn(0, 10)

data class BlockedHistoryRecord(
  val id: String,
  /** Pseudonymous SHA-256 scope, never a raw account/user identifier. */
  val ownerScope: String?,
  val sender: String?,
  val receivedAt: Long,
  val score: Int,
  val message: String,
  /** Safe card text; this is never an SMS-derived excerpt. */
  val redactedPreview: String,
  val reasons: List<ThreatReason>,
  val urls: List<ExtractedUrl>,
  val sourcePackage: String,
  val ruleVersion: String,
  // Defaults preserve existing dangerous, blocked records from older installs.
  val level: ThreatLevel = ThreatLevel.DANGEROUS,
  val blocked: Boolean = true,
  val isRead: Boolean = false,
)

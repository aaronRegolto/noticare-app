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

data class ThreatResult(
  val level: ThreatLevel,
  val score: Int,
  val reasons: List<ThreatReason>,
  val urls: List<ExtractedUrl>,
  val ruleVersion: String,
)

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
)

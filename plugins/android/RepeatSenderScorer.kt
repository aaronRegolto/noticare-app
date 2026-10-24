package __NOTICARE_PACKAGE__.bridge

import java.util.Locale

object RepeatSenderScorer {
  private const val lookbackMillis = 30L * 24 * 60 * 60 * 1000
  private const val initialRepeatScore = 30
  private const val increasePerRepeat = 15
  private const val dangerousThreshold = 70

  fun escalate(
    result: ThreatResult,
    sourceId: String,
    sender: String?,
    sourcePackage: String,
    history: List<BlockedHistoryRecord>,
    now: Long,
  ): ThreatResult {
    if (sourceId != "sms") return result
    val normalizedSender = sender?.trim()?.lowercase(Locale.ROOT)?.takeIf(String::isNotEmpty) ?: return result
    val matchingHistory = history
      .filter {
        it.sourcePackage == sourcePackage &&
          it.sender?.trim()?.lowercase(Locale.ROOT) == normalizedSender &&
          it.receivedAt in (now - lookbackMillis)..now
      }
      .sortedBy(BlockedHistoryRecord::receivedAt)
    val firstEvidenceIndex = matchingHistory.indexOfFirst {
      MessageCategories.hasIndependentSpamEvidence(it.reasons)
    }
    if (firstEvidenceIndex < 0) return result

    val repeatCount = matchingHistory.size - firstEvidenceIndex - 1
    val repeatScore = (initialRepeatScore + repeatCount * increasePerRepeat).coerceAtMost(100)
    val score = maxOf(result.score, repeatScore)
    if (score <= result.score) return result

    val reason = ThreatReason(
      code = "repeat-sender-escalation",
      label = "Repeated suspicious SMS sender",
      description = "This sender has continued sending SMS messages after a prior spam or phishing detection in your Messages app.",
      weight = score - result.score,
    )
    return result.copy(
      level = if (score >= dangerousThreshold) ThreatLevel.DANGEROUS else ThreatLevel.SUSPICIOUS,
      score = score,
      reasons = result.reasons + reason,
    )
  }
}

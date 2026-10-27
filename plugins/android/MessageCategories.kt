package __NOTICARE_PACKAGE__.bridge

object MessageCategories {
  private val spamCodes = setOf(
    "v3-model-risk",
    "repeat-sender-escalation",
    "prize-or-reward-bait",
    "refund-bait",
    "parcel-delivery-bait",
    "unpaid-bill-pressure",
    "urgency-pressure",
    "link-or-reply-pressure",
    "government-aid-impersonation",
    "money-transfer-request",
    "advance-fee-request",
  )

  private val threatCodes = setOf("direct-threat", "cyber-threat")

  private val phishingCodes = setOf(
    "credential-request",
    "account-warning",
    "access-loss-threat",
    "money-transfer-request",
    "advance-fee-request",
    "credential-link-combination",
    "account-link-combination",
    "bait-link-combination",
    "link-pressure-combination",
    "credential-urgency-combination",
    "account-urgency-combination",
    "brand-with-unrelated-url",
    "url-with-sensitive-request",
    "url-ip-address",
    "url-shortener",
    "url-punycode",
    "url-unicode-confusable",
    "url-at-sign",
    "url-excessive-subdomains",
    "url-nonstandard-port",
    "url-misleading-path",
    "url-redirect-parameter",
    "url-obfuscated",
  )

  private val independentSpamCodes = setOf(
    "v3-model-risk",
    "prize-or-reward-bait",
    "refund-bait",
    "government-aid-impersonation",
    "money-transfer-request",
    "advance-fee-request",
  )

  fun fromReasons(reasons: List<ThreatReason>): List<String> {
    val codes = reasons.map(ThreatReason::code).toSet()
    return buildList {
      if (codes.any(spamCodes::contains)) add("spam")
      if (codes.any(threatCodes::contains)) add("threats")
      if (codes.any(phishingCodes::contains)) add("phishing")
    }
  }

  fun hasSpamEvidence(reasons: List<ThreatReason>): Boolean =
    reasons.any { it.code in spamCodes || it.code in phishingCodes || it.code in threatCodes }

  fun hasIndependentSpamEvidence(reasons: List<ThreatReason>): Boolean =
    reasons.any {
      it.code != "repeat-sender-escalation" &&
        (it.code in independentSpamCodes || it.code in phishingCodes)
    }
}

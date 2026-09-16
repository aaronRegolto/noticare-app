package __NOTICARE_PACKAGE__.bridge

import java.net.IDN
import java.net.URLDecoder
import java.text.Normalizer
import java.util.Locale
import kotlin.math.min

/**
 * Kotlin mirror of src/features/detection/rules.ts (bundle 2026.09.10).
 * Both implementations are deterministic, offline, and make no network request.
 */
object SmishingEvaluator {
  const val RULE_VERSION = "2026.09.10"
  private const val scoreCap = 100
  private const val suspiciousThreshold = 30
  private const val dangerousThreshold = 70
  private const val maxInputCharacters = 12_000

  private data class Rule(
    val code: String,
    val label: String,
    val description: String,
    val weight: Int,
  )

  private data class TextRule(
    val rule: Rule,
    val patterns: List<Regex>,
    val signals: List<String>,
    val ignoreWhenPrecededBySafetyAdvice: Boolean = false,
  )

  private data class Brand(
    val names: List<String>,
    val officialDomains: List<String>,
  )

  private data class NormalizedText(
    val normalized: String,
    val comparable: String,
    val hadZeroWidthCharacters: Boolean,
    val hadUnexpectedControlCharacters: Boolean,
    val hadCharacterSubstitutions: Boolean,
  )

  private data class Candidate(
    val display: String,
    val canonical: String,
    val obfuscated: Boolean,
    val start: Int,
    val end: Int,
  )

  private data class UrlEvidence(
    val extracted: ExtractedUrl,
    val host: String?,
    val path: String,
    val query: String,
  )

  private data class ParsedUrl(
    val host: String,
    val path: String,
    val query: String,
    val port: Int?,
  )

  private val regexOptions = setOf(RegexOption.IGNORE_CASE)
  // ECMAScript's `u`-mode word boundary is based on the ASCII `\w` set. JVM
  // Pattern's `\b` is Unicode-aware, so translate copied TypeScript regexes
  // before compiling them to preserve the same matching boundary.
  private const val asciiWordBoundary = "(?:(?<=[A-Za-z0-9_])(?![A-Za-z0-9_])|(?<![A-Za-z0-9_])(?=[A-Za-z0-9_]))"
  private fun fromTypeScriptPattern(pattern: String): Regex =
    Regex(pattern.replace("\\b", asciiWordBoundary), regexOptions)
  private fun insensitive(pattern: String) = fromTypeScriptPattern(pattern)

  private val credentialRequest = Rule(
    "credential-request",
    "Request for a secret code or account information",
    "The message asks you to provide an OTP, password, PIN, or account details.",
    30,
  )
  private val accountWarning = Rule(
    "account-warning",
    "Account access warning",
    "The message claims that an account is suspended, locked, or needs verification.",
    23,
  )
  private val urgencyPressure = Rule(
    "urgency-pressure",
    "Urgent pressure",
    "The message pressures you to act immediately or within a short deadline.",
    12,
  )
  private val linkOrReplyPressure = Rule(
    "link-or-reply-pressure",
    "Pressure to open a link or reply",
    "The message tells you to click, tap, open a link, or reply to continue.",
    12,
  )
  private val prizeOrRewardBait = Rule(
    "prize-or-reward-bait",
    "Prize or reward claim",
    "The message uses a prize, reward, or free-cash offer to attract action.",
    18,
  )
  private val refundBait = Rule(
    "refund-bait",
    "Refund or cash-back claim",
    "The message promises a refund, reimbursement, or cash back that requires action.",
    18,
  )
  private val parcelDeliveryBait = Rule(
    "parcel-delivery-bait",
    "Parcel delivery problem",
    "The message reports a failed, held, or unpaid parcel delivery.",
    17,
  )
  private val unpaidBillPressure = Rule(
    "unpaid-bill-pressure",
    "Unpaid bill pressure",
    "The message threatens a consequence for an alleged unpaid bill.",
    15,
  )
  private val governmentAidImpersonation = Rule(
    "government-aid-impersonation",
    "Government-aid claim",
    "The message offers government aid or cash assistance in a way often used for scams.",
    15,
  )
  private val accessLossThreat = Rule(
    "access-loss-threat",
    "Threat of lost access or service",
    "The message threatens to remove access or disconnect a service.",
    17,
  )
  private val obfuscatedText = Rule(
    "obfuscated-text",
    "Obfuscated text",
    "The message contains hidden characters or look-alike character substitutions.",
    10,
  )

  private val textRules = listOf(
    TextRule(
      credentialRequest,
      listOf(
        insensitive("""\b(?:send|provide|give|submit|enter|confirm|input|reply with|text back|type|share|forward|update)\s+(?:(?:your|the)\s+)?(?:(?:six[-\s]digit|6[-\s]digit|four[-\s]digit|4[-\s]digit|e[-\s]?wallet|wallet|banking|bank|card|account)\s+){0,2}(?:otp|passcode|password|m?pin|cvv|credentials|username\s+and\s+password|card\s+number\s+and\s+cvv)\b"""),
        insensitive("""\b(?:paki[-\s]?(?:reply|send)|isumite|ibigay|ipadala|ilagay|i[-\s]?(?:send|type|share|reply))\s+(?:(?:ang|yung|iyong|inyong|mo)\s+){0,3}(?:otp|passcode|password|m?pin|cvv|bank\s+details)\b"""),
        insensitive("""\b(?:send|provide|give|submit|enter|confirm|input|reply with|text back|type)\s+(?:your\s+)?(?:one[-\s]?time(?:\s+password)?|otp|passcode|password|pin|account(?:\s+details)?|bank(?:ing)?\s+details)\b"""),
        insensitive("""\b(?:share|forward)\s+(?:your\s+)?(?:one[-\s]?time(?:\s+password)?|otp|passcode|password|pin)\b"""),
        insensitive("""\b(?:ibigay|ipadala|i[-\s]?send|isend|ilagay|i[-\s]?type|itype|i[-\s]?share|ishare|ibahagi|i[-\s]?reply|ireply)\s+(?:(?:ang|yung|iyong|mo)\s+){0,2}(?:one[-\s]?time(?:\s+password)?|otp|passcode|password|pin|detalye(?:\s+ng\s+account)?)\b"""),
      ),
      listOf("credential-request"),
      true,
    ),
    TextRule(
      accountWarning,
      listOf(
        insensitive("""\b(?:your\s+)?account\s+(?:has\s+been\s+|is\s+|will be\s+)?(?:suspended|locked|restricted|disabled|limited|on hold|closed)\b"""),
        insensitive("""\b(?:verify|re[-\s]?verify|update)\s+(?:your\s+)?account\b"""),
        insensitive("""\b(?:i[-\s]?verify|iverify|beripikahin|i[-\s]?update|iupdate)\s+(?:ang\s+)?(?:iyong\s+|mong\s+)?account\b"""),
        insensitive("""\b(?:mawawala|mawawalan)\s+(?:(?:ka\s+ng|ang)\s+)?access\b"""),
      ),
      listOf("account-warning"),
    ),
    TextRule(
      urgencyPressure,
      listOf(
        insensitive("""\b(?:verify|act|respond|reply|click|pay|claim)\s+(?:now|today|immediately|asap)\b"""),
        insensitive("""\b(?:verify|re[-\s]?verify|update)\s+(?:your\s+)?account\s+(?:now|today|immediately|asap)\b"""),
        insensitive("""\b(?:limited time|final warning|last chance|within\s+\d+\s+(?:hours?|minutes?))\b"""),
        insensitive("""\b(?:ngayon\s+na|kaagad|agad|huling\s+paalala|huling\s+babala|limitado\s+ang\s+oras)\b"""),
      ),
      listOf("urgency-pressure"),
    ),
    TextRule(
      linkOrReplyPressure,
      listOf(
        insensitive("""\b(?:click|tap|open|visit|follow)\s+(?:(?:the|this|our)\s+)?(?:link|here|below)\b"""),
        insensitive("""\b(?:pindutin|i[-\s]?click|iclick|buksan|bisitahin|visit)\s+(?:ang\s+)?(?:link|link\s+na\s+ito|dito)\b"""),
        insensitive("""\b(?:reply|text)\s+(?:yes|now|immediately)\b"""),
        insensitive("""\b(?:mag[-\s]?reply|magreply|sumagot)\s+(?:ngayon|agad|kaagad)\b"""),
      ),
      listOf("link-or-reply-pressure"),
    ),
    TextRule(
      prizeOrRewardBait,
      listOf(
        insensitive("""\b(?:you(?:'| a)?ve\s+won|winner|claim\s+(?:your\s+)?(?:prize|reward)|free\s+(?:cash|load|gift)|lucky\s+winner)\b"""),
        insensitive("""\b(?:nanalo\s+ka|i[-\s]?claim|iclaim)\s+(?:ang\s+)?(?:premyo|reward|prize)\b"""),
        insensitive("""\b(?:libreng\s+(?:load|cash|pera)|swerte\s+mong\s+nanalo)\b"""),
      ),
      listOf("prize-or-reward-bait"),
    ),
    TextRule(
      refundBait,
      listOf(
        insensitive("""\b(?:refund|reimbursement|cashback|cash back)\s+(?:is\s+)?(?:ready|available|pending|waiting)\b"""),
        insensitive("""\b(?:claim|process|release)\s+(?:your\s+)?(?:refund|cashback|cash back)\b"""),
        insensitive("""\b(?:i[-\s]?claim|iclaim|kunin)\s+(?:ang\s+)?(?:refund|cashback|balik\s+pera)\b"""),
      ),
      listOf("refund-bait"),
    ),
    TextRule(
      parcelDeliveryBait,
      listOf(
        insensitive("""\b(?:parcel|package|delivery)\s+(?:delivery\s+)?(?:has\s+)?(?:failed|held|pending|stopped|requires\s+payment)\b"""),
        insensitive("""\b(?:delivery\s+attempt|parcel\s+delivery)\s+(?:failed|unsuccessful|missed)\b"""),
        insensitive("""\b(?:hindi\s+(?:na\s+)?(?:na)?deliver|na[-\s]?hold\s+ang\s+(?:iyong\s+)?(?:parcel|package)|may\s+bayad\s+ang\s+(?:iyong\s+)?parcel)\b"""),
      ),
      listOf("parcel-delivery-bait"),
    ),
    TextRule(
      unpaidBillPressure,
      listOf(
        insensitive("""\b(?:unpaid|overdue|outstanding)\s+(?:bill|balance|payment)\b"""),
        insensitive("""\b(?:pay|settle)\s+(?:your\s+)?(?:bill|balance)\s+(?:now|today|immediately)\b"""),
        insensitive("""\b(?:hindi\s+bayad|may\s+utang|bayaran)\s+(?:ang\s+)?(?:bill|balanse|balance)\b"""),
      ),
      listOf("unpaid-bill-pressure"),
    ),
    TextRule(
      governmentAidImpersonation,
      listOf(
        insensitive("""\b(?:dswd|sss|pag[-\s]?ibig|philhealth|government)\s+(?:aid|ayuda|cash\s+assistance|benefit)\b"""),
        insensitive("""\b(?:ayuda|cash\s+assistance)\s+(?:is\s+)?(?:ready|available|pending)\b"""),
      ),
      listOf("government-aid-impersonation"),
    ),
    TextRule(
      accessLossThreat,
      listOf(
        insensitive("""\b(?:lose|loss\s+of|avoid)\s+(?:your\s+)?(?:access|account|service)\b"""),
        insensitive("""\b(?:service|account)\s+(?:will\s+be\s+)?(?:disconnected|terminated|deactivated)\b"""),
        insensitive("""\b(?:mawawala|ma[-\s]?de[-\s]?deactivate|made-deactivate|mapuputol)\s+(?:ang\s+)?(?:access|account|serbisyo)\b"""),
      ),
      listOf("access-loss-threat"),
    ),
  )

  private val urlRules = listOf(
    Rule("url-ip-address", "IP-address link", "The link uses a numeric IP address instead of a normal domain name.", 35),
    Rule("url-shortener", "Shortened link", "A URL shortener hides the destination domain.", 30),
    Rule("url-punycode", "Punycode domain", "The link uses an internationalized domain encoding that can hide look-alike names.", 32),
    Rule("url-unicode-confusable", "Unicode look-alike domain", "The visible domain uses non-ASCII characters that can resemble another brand.", 32),
    Rule("url-at-sign", "Misleading @ link syntax", "The link contains @ syntax that can make a different destination look trustworthy.", 32),
    Rule("url-excessive-subdomains", "Excessive subdomains", "The link has several nested subdomains that can hide its real destination.", 13),
    Rule("url-nonstandard-port", "Nonstandard link port", "The link uses an uncommon web port.", 16),
    Rule("url-misleading-path", "Sensitive-action link path", "The link path references login, verification, payment, parcel, or prize actions.", 10),
    Rule("url-redirect-parameter", "Redirect parameter", "The link contains a redirect-style parameter that may hide its final destination.", 14),
    Rule("url-obfuscated", "Obfuscated link", "The link was written with altered protocol, spacing, or dot characters.", 32),
  )
  private val urlRulesByCode = urlRules.associateBy(Rule::code)
  private val urlContextRule = Rule("url-with-sensitive-request", "Sensitive request paired with a link", "A sensitive account, payment, prize, or delivery request appears with a link.", 10)
  private val brandUnrelatedUrlRule = Rule("brand-with-unrelated-url", "Brand name paired with an unrelated link", "A financial or government brand is mentioned, but the link is not on a recognized brand domain.", 18)
  private val combinationRules = listOf(
    Pair(Rule("credential-link-combination", "Secret-code request with a link", "A request for a secret code or account information is paired with a link.", 22), listOf("credential-request", "url")),
    Pair(Rule("account-link-combination", "Account warning with a link", "An account warning is paired with a link.", 15), listOf("account-warning", "url")),
    Pair(Rule("link-pressure-combination", "Pressure to act on a link", "The message explicitly pressures you to use a link.", 10), listOf("link-or-reply-pressure", "url")),
    Pair(Rule("bait-link-combination", "Scam bait with a link", "A prize, refund, parcel, bill, or aid claim is paired with a link.", 15), listOf("bait", "url")),
    Pair(Rule("credential-urgency-combination", "Secret-code request under pressure", "The message asks for sensitive information while applying urgency.", 13), listOf("credential-request", "urgency-pressure")),
    Pair(Rule("account-urgency-combination", "Urgent account warning", "The message pairs an account warning with an urgent deadline.", 10), listOf("account-warning", "urgency-pressure")),
  )
  private val brands = listOf(
    Brand(listOf("gcash"), listOf("gcash.com")),
    Brand(listOf("maya"), listOf("maya.ph")),
    Brand(listOf("bdo"), listOf("bdo.com.ph")),
    Brand(listOf("bpi"), listOf("bpi.com.ph")),
    Brand(listOf("landbank"), listOf("landbank.com")),
    Brand(listOf("metrobank"), listOf("metrobank.com.ph")),
    Brand(listOf("unionbank"), listOf("unionbankph.com")),
    Brand(listOf("pag-ibig", "pagibig"), listOf("pagibigfund.gov.ph")),
    Brand(listOf("dswd"), listOf("dswd.gov.ph")),
  )
  private val shortenerDomains = setOf(
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "shorturl.at", "rb.gy", "tiny.one", "rebrand.ly", "lnkd.in",
  )

  private val directUrlPattern = fromTypeScriptPattern("""(?:https?://|hxxps?://|www\.)[^\s<>"'`]+|(?:(?:\d{1,3}\.){3}\d{1,3}|(?:[A-Za-z0-9\u00C0-\uFFFF-]+\.)+(?:xn--[A-Za-z0-9-]{2,59}|[A-Za-z\u00C0-\uFFFF]{2,63}))(?::\d{2,5})?(?:/[^\s<>"'`]*)?""")
  private val spacedProtocolPattern = fromTypeScriptPattern("""\b(?:h(?:tt|xx)ps?)\s*:\s*/\s*/\s*(?:[A-Za-z0-9-]+\s*(?:\.|\[\.\]|\(\.\))\s*)+(?:[A-Za-z]{2,63})(?:\s*/\s*[^\s<>"'`]*)?""")
  private val spacedDomainPattern = fromTypeScriptPattern("""\b(?:[A-Za-z0-9-]+\s*(?:\[\.\]|\(\.\)|\s+\.\s+)\s*)+(?:[A-Za-z]{2,63})\b""")
  private val trailingPunctuation = Regex("""[\],.!?;:'">}]+$""")
  private val misleadingPathPattern = insensitive("""/(?:[^/?#]+/)*(?:login|log-in|verify|verification|secure|security|payment|pay|prize|reward|parcel|delivery|account|wallet)(?:[/?#]|$)""")
  private val redirectParameterPattern = insensitive("""(?:^|[?&])(?:url|redirect|target|next|continue|dest|destination|return)=""")
  private val safetyAdvicePattern = insensitive("""(?:do\s+not|don't|never|huwag(?:\s+mong)?|wag(?:\s+mong)?)\s*$""")
  private val zeroWidthPattern = Regex("""[\u200B-\u200F\u2060\u2066-\u2069\uFEFF]""")
  private val unexpectedControlPattern = Regex("""[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]""")
  // The exact ECMAScript `\s` set used by normalize.ts. FEFF is covered by
  // zeroWidthPattern above, so it is intentionally not repeated here.
  private val javascriptWhitespacePattern = Regex("""[\u0009-\u000D\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+""")
  private val substitutionTokenPattern = Regex("""[A-Za-z0-9@$!.-]{3,}""")
  private val substitutions = mapOf('@' to 'a', '$' to 's', '0' to 'o', '1' to 'i', '3' to 'e', '4' to 'a', '5' to 's', '7' to 't', '!' to 'i')
  private val baitSignals = setOf("prize-or-reward-bait", "refund-bait", "parcel-delivery-bait", "unpaid-bill-pressure", "government-aid-impersonation")
  private val urlContextSignals = setOf("credential-request", "account-warning", "prize-or-reward-bait", "refund-bait", "parcel-delivery-bait", "unpaid-bill-pressure", "government-aid-impersonation")

  fun evaluate(message: String): ThreatResult {
    val normalized = normalizeInternal(message)
    val reasons = mutableListOf<ThreatReason>()
    val reasonCodes = mutableSetOf<String>()
    val signals = mutableSetOf<String>()

    fun add(rule: Rule) {
      if (!reasonCodes.add(rule.code)) return
      reasons += ThreatReason(rule.code, rule.label, rule.description, rule.weight)
    }

    val matchingTextRules = textRules.mapNotNull { rule ->
      firstMatchIndex(rule, normalized.comparable)?.let { index -> Pair(rule, index) }
    }.sortedBy { it.second }
    for ((rule, _) in matchingTextRules) {
      add(rule.rule)
      signals += rule.signals
    }

    if (normalized.hadZeroWidthCharacters || normalized.hadUnexpectedControlCharacters || normalized.hadCharacterSubstitutions) {
      add(obfuscatedText)
      signals += "obfuscated-text"
    }

    val urls = extractUrls(normalized.normalized)
    for (url in urls) {
      for (indicator in url.extracted.indicators) urlRulesByCode[indicator]?.let(::add)
    }
    if (urls.isNotEmpty()) signals += "url"

    if (urls.isNotEmpty() && signals.any { it in urlContextSignals }) {
      add(urlContextRule)
      signals += "url-sensitive-context"
    }
    if (hasBrandWithUnrelatedUrl(normalized.comparable, urls.map(UrlEvidence::host))) {
      add(brandUnrelatedUrlRule)
      signals += "brand-unrelated-url"
    }
    if (signals.any { it in baitSignals }) signals += "bait"
    for ((rule, requirements) in combinationRules) {
      if (requirements.all { it in signals }) add(rule)
    }

    val score = min(scoreCap, reasons.sumOf(ThreatReason::weight))
    val level = when {
      score >= dangerousThreshold -> ThreatLevel.DANGEROUS
      score >= suspiciousThreshold -> ThreatLevel.SUSPICIOUS
      else -> ThreatLevel.SAFE
    }
    return ThreatResult(level, score, reasons, urls.map(UrlEvidence::extracted), RULE_VERSION)
  }

  /** Used only for deduplication; it never leaves the device. */
  fun normalize(text: String): String = normalizeInternal(text).comparable

  private fun firstMatchIndex(rule: TextRule, text: String): Int? {
    for (pattern in rule.patterns) {
      for (match in pattern.findAll(text)) {
        if (!rule.ignoreWhenPrecededBySafetyAdvice || !hasSafetyAdviceBefore(text, match.range.first)) {
          return match.range.first
        }
      }
    }
    return null
  }

  private fun hasSafetyAdviceBefore(text: String, matchIndex: Int): Boolean {
    val prefix = text.substring((matchIndex - 36).coerceAtLeast(0), matchIndex)
    return safetyAdvicePattern.containsMatchIn(prefix)
  }

  private fun normalizeInternal(message: String): NormalizedText {
    val input = message.take(maxInputCharacters)
    val unicode = Normalizer.normalize(input, Normalizer.Form.NFKC)
    val hadZeroWidth = zeroWidthPattern.containsMatchIn(unicode)
    val hadUnexpectedControl = unexpectedControlPattern.containsMatchIn(unicode)
    val normalized = unicode
      .replace(zeroWidthPattern, "")
      .replace(unexpectedControlPattern, " ")
      .replace(javascriptWhitespacePattern, " ")
      .replace(Regex("([!?,.;])\\1{2,}"), "$1$1")
      .trim(' ')
      .lowercase(Locale.ROOT)
    val comparable = normalizeCharacterSubstitutions(normalized)
    return NormalizedText(normalized, comparable, hadZeroWidth, hadUnexpectedControl, comparable != normalized)
  }

  private fun normalizeCharacterSubstitutions(value: String): String = substitutionTokenPattern.replace(value) { match ->
    val token = match.value
    if ('.' in token || '-' in token || token.none(Char::isLetter) || token.none { it.isDigit() || it == '@' || it == '$' || it == '!' }) {
      token
    } else {
      val converted = token.map { character -> substitutions[character] ?: character }.joinToString("")
      if (converted.count(Char::isLetter) >= 2) converted else token
    }
  }

  private fun extractUrls(text: String): List<UrlEvidence> {
    val candidates = mutableListOf<Candidate>()
    candidates += collectDirectCandidates(text)
    candidates += collectSpacedCandidates(text, spacedProtocolPattern)
    candidates += collectSpacedCandidates(text, spacedDomainPattern)
    candidates.sortWith(compareBy<Candidate> { it.start }.thenByDescending { it.end - it.start })

    val seen = mutableSetOf<String>()
    val acceptedRanges = mutableListOf<IntRange>()
    val urls = mutableListOf<UrlEvidence>()
    for (candidate in candidates) {
      if (acceptedRanges.any { candidate.start in it }) continue
      val evidence = parseCandidate(candidate) ?: continue
      val identity = "${evidence.host.orEmpty()}|${evidence.path}|${evidence.query}".lowercase(Locale.ROOT)
      if (!seen.add(identity)) continue
      acceptedRanges += candidate.start until candidate.end
      urls += evidence
      if (urls.size == 12) break
    }
    return urls
  }

  private fun collectDirectCandidates(text: String): List<Candidate> = buildList {
    for (match in directUrlPattern.findAll(text)) {
      val start = match.range.first
      val preceding = text.getOrNull(start - 1)
      if (preceding == '@' || (preceding != null && isAsciiUrlPrecedingCharacter(preceding))) continue
      val display = trimUrlPunctuation(match.value)
      if (display.isBlank()) continue
      add(Candidate(display, display.replace(Regex("""^hxxp""", regexOptions), "http"), display.startsWith("hxxp", true), start, match.range.last + 1))
    }
  }

  private fun collectSpacedCandidates(text: String, pattern: Regex): List<Candidate> = buildList {
    for (match in pattern.findAll(text)) {
      val display = trimUrlPunctuation(match.value)
      if (display.isBlank()) continue
      val canonical = display
        .replace(Regex("""hxxp""", regexOptions), "http")
        .replace("[.]", ".")
        .replace("(.)", ".")
        .replace(javascriptWhitespacePattern, "")
      if (!looksLikeDomainOrIp(canonical)) continue
      add(Candidate(display, canonical, true, match.range.first, match.range.last + 1))
    }
  }

  private fun trimUrlPunctuation(value: String): String = value.replace(trailingPunctuation, "")

  private fun parseCandidate(candidate: Candidate): UrlEvidence? {
    val parsed = parseWhatwgLikeHttpUrl(candidate.canonical) ?: return null
    val host = parsed.host

    val indicators = mutableListOf<String>()
    val visibleHost = readVisibleHost(candidate.canonical)
    if (isIpv4Address(host)) indicators += "url-ip-address"
    if (isShortener(host)) indicators += "url-shortener"
    if (host.contains("xn--")) indicators += "url-punycode"
    if (visibleHost.any { it.code > 127 }) indicators += "url-unicode-confusable"
    if ('@' in candidate.canonical) indicators += "url-at-sign"
    if (!isIpv4Address(host) && host.split('.').size >= 5) indicators += "url-excessive-subdomains"
    if (parsed.port != null && parsed.port != 80 && parsed.port != 443) indicators += "url-nonstandard-port"
    if (misleadingPathPattern.containsMatchIn(parsed.path)) indicators += "url-misleading-path"
    if (redirectParameterPattern.containsMatchIn(parsed.query)) indicators += "url-redirect-parameter"
    if (candidate.obfuscated) indicators += "url-obfuscated"
    return UrlEvidence(ExtractedUrl(candidate.display, host, indicators), host, parsed.path, parsed.query)
  }

  /**
   * A bounded, offline subset of WHATWG's special-http URL parsing. Android's
   * `java.net.URI` has materially different behavior for percent-encoded host
   * labels, HTTP backslashes, IPv4 shorthand, and invalid ports, so it cannot
   * be used directly for a TypeScript `new URL()` parity evaluator.
   */
  private fun parseWhatwgLikeHttpUrl(canonical: String): ParsedUrl? {
    val withProtocol = if (
      canonical.startsWith("http://", true) || canonical.startsWith("https://", true)
    ) canonical else "http://$canonical"
    // HTTP(S) is a WHATWG special scheme: a backslash is interpreted as a
    // path separator instead of making the candidate fail URI parsing.
    val value = withProtocol.replace('\\', '/')
    val schemeEnd = value.indexOf("://")
    if (schemeEnd <= 0) return null
    val scheme = value.substring(0, schemeEnd).lowercase(Locale.ROOT)
    if (scheme != "http" && scheme != "https") return null

    val authorityStart = schemeEnd + 3
    val delimiter = value.indexOfAny(charArrayOf('/', '?', '#'), authorityStart)
    val authorityEnd = if (delimiter == -1) value.length else delimiter
    val authority = value.substring(authorityStart, authorityEnd)
    val hostAndPort = authority.substringAfterLast('@')
    val (rawHost, port) = splitHostAndPort(hostAndPort) ?: return null
    val decodedHost = decodePercentEncodedHost(rawHost) ?: return null
    if (decodedHost.isBlank() || decodedHost.any { character ->
        character == '/' || character == '\\' || character == '?' || character == '#' ||
          character == '@' || character == ':' || character.isWhitespace()
      }) return null

    val asciiHost = runCatching { IDN.toASCII(decodedHost) }.getOrNull() ?: return null
    val host = normalizeWhatwgIpv4Host(asciiHost.lowercase(Locale.ROOT).trimEnd('.'))
    if (!isValidHost(host)) return null

    val remainder = value.substring(authorityEnd)
    val beforeFragment = remainder.substringBefore('#')
    val queryStart = beforeFragment.indexOf('?')
    val rawPath = if (queryStart == -1) beforeFragment else beforeFragment.substring(0, queryStart)
    val path = rawPath.ifBlank { "/" }
    val query = if (queryStart == -1) "" else "?${beforeFragment.substring(queryStart + 1)}"
    return ParsedUrl(host, path, query, port)
  }

  private fun splitHostAndPort(authority: String): Pair<String, Int?>? {
    if (authority.isBlank() || authority.startsWith('[')) return null
    val lastColon = authority.lastIndexOf(':')
    if (lastColon == -1) return authority to null
    // Candidate extraction does not support IPv6. Reject multiple colons rather
    // than accidentally treating a malformed host as a domain plus a port.
    if (authority.indexOf(':') != lastColon) return null

    val rawHost = authority.substring(0, lastColon)
    val rawPort = authority.substring(lastColon + 1)
    if (rawHost.isBlank()) return null
    if (rawPort.isBlank()) return rawHost to null
    if (!rawPort.all(Char::isDigit)) return null
    val port = rawPort.toIntOrNull() ?: return null
    if (port !in 0..65535) return null
    return rawHost to port
  }

  private fun decodePercentEncodedHost(value: String): String? = runCatching {
    // URLDecoder treats '+' as a form-space, while URL hosts do not. Encoding
    // literal plus characters first keeps this limited parser URL-like.
    URLDecoder.decode(value.replace("+", "%2B"), Charsets.UTF_8.name())
  }.getOrNull()

  private fun normalizeWhatwgIpv4Host(host: String): String {
    val pieces = host.split('.')
    if (pieces.size !in 1..4 || pieces.any { it.isBlank() || !it.all(Char::isDigit) }) return host
    val numbers = pieces.map { it.toLongOrNull() ?: return host }
    val value = when (numbers.size) {
      1 -> numbers[0].takeIf { it <= 0xffff_ffffL }
      2 -> if (numbers[0] <= 255 && numbers[1] <= 0x00ff_ffffL) numbers[0] * 0x01_000000L + numbers[1] else null
      3 -> if (numbers[0] <= 255 && numbers[1] <= 255 && numbers[2] <= 0xffffL) {
        numbers[0] * 0x01_000000L + numbers[1] * 0x01_0000L + numbers[2]
      } else null
      4 -> if (numbers.all { it <= 255 }) {
        numbers[0] * 0x01_000000L + numbers[1] * 0x01_0000L + numbers[2] * 0x0100L + numbers[3]
      } else null
      else -> null
    } ?: return host

    return listOf(
      (value shr 24) and 0xff,
      (value shr 16) and 0xff,
      (value shr 8) and 0xff,
      value and 0xff,
    ).joinToString(".")
  }

  private fun readVisibleHost(candidate: String): String {
    val withoutProtocol = candidate.replace('\\', '/').replace(Regex("""^(?:https?://)""", regexOptions), "")
    return withoutProtocol.split(Regex("""[/?#:]"""), limit = 2).firstOrNull().orEmpty().substringAfterLast('@')
  }

  private fun isAsciiUrlPrecedingCharacter(character: Char): Boolean =
    character in 'a'..'z' || character in 'A'..'Z' || character in '0'..'9' ||
      character == '_' || character == '.' || character == '-'

  private fun looksLikeDomainOrIp(value: String): Boolean {
    val withoutProtocol = value.replace(Regex("""^(?:https?://)""", regexOptions), "")
    val host = withoutProtocol.split(Regex("""[/?#:]"""), limit = 2).firstOrNull().orEmpty()
    return isIpv4Address(host) || Regex("""(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,63}""", regexOptions).matches(host)
  }

  private fun isValidHost(host: String): Boolean {
    if (isIpv4Address(host)) return true
    if (Regex("""^\d+(?:\.\d+){3}$""").matches(host)) return false
    return '.' in host && !host.startsWith('.') && !host.endsWith('.')
  }

  private fun isIpv4Address(host: String): Boolean {
    val pieces = host.split('.')
    return pieces.size == 4 && pieces.all { piece -> piece.length in 1..3 && piece.all(Char::isDigit) && piece.toIntOrNull() in 0..255 }
  }

  private fun isShortener(host: String): Boolean = shortenerDomains.any { domain -> host == domain || host.endsWith(".$domain") }

  private fun hasBrandWithUnrelatedUrl(text: String, domains: List<String?>): Boolean {
    val usableDomains = domains.filterNotNull()
    if (usableDomains.isEmpty()) return false
    return brands.any { brand ->
      val mentioned = brand.names.any { name ->
        Regex("""(?:^|[^a-z0-9])${Regex.escape(name)}(?:$|[^a-z0-9])""", regexOptions).containsMatchIn(text)
      }
      mentioned && usableDomains.any { domain -> brand.officialDomains.none { official -> domain == official || domain.endsWith(".$official") } }
    }
  }
}

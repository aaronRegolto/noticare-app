package __NOTICARE_PACKAGE__.bridge

import java.security.MessageDigest
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * This table is generated from src/features/detection/__tests__/corpus.ts.
 * The corpus is synthetic and contains no production message content.
 */
class SmishingEvaluatorParityTest {
  private data class Case(val id: String, val message: String, val expected: ThreatLevel)
  private data class EdgeCase(
    val id: String,
    val message: String,
    val level: ThreatLevel,
    val score: Int,
    val codes: List<String>,
    val urlCount: Int,
    val firstDomain: String? = null,
  )

  private fun syntheticCases(): List<Case> = listOf(
      Case("legitimate-otp-no-request", "Your OTP is 482913. Do not share it with anyone.", ThreatLevel.SAFE),
      Case("legitimate-otp-safety-advice", "For your security, never share your OTP or PIN with anyone.", ThreatLevel.SAFE),
      Case("legitimate-bank-card-notice", "BDO: Your card purchase of PHP 450.00 was approved. No action is needed.", ThreatLevel.SAFE),
      Case("legitimate-bank-maintenance", "BPI mobile banking will undergo maintenance this Sunday from 1 AM to 4 AM.", ThreatLevel.SAFE),
      Case("legitimate-wallet-receipt", "GCash: You sent PHP 120.00 to Ana. View the receipt in the GCash app.", ThreatLevel.SAFE),
      Case("normal-tagalog-conversation", "Nasa bahay na ako. Kita tayo bukas pagkatapos ng klase.", ThreatLevel.SAFE),
      Case("normal-english-conversation", "Thanks for the update. I will bring the documents tomorrow morning.", ThreatLevel.SAFE),
      Case("legitimate-promotion", "Weekend coffee promo: get 20% off until Friday at participating stores.", ThreatLevel.SAFE),
      Case("legitimate-parcel-update", "Your parcel is out for delivery and is expected to arrive tomorrow.", ThreatLevel.SAFE),
      Case("legitimate-multiline-schedule", "School reminder:\nParent meeting on Friday, 3 PM.\nPlease bring your ID.", ThreatLevel.SAFE),
      Case("legitimate-appointment", "Your clinic appointment is confirmed for August 12 at 10:30 AM.", ThreatLevel.SAFE),
      Case("legitimate-utility-notice", "Meralco: Scheduled maintenance may affect service from 11 PM to 2 AM.", ThreatLevel.SAFE),
      Case("legitimate-statement", "Your e-statement is ready in the BDO app. This is an informational notice.", ThreatLevel.SAFE),
      Case("legitimate-official-domain", "Visit https://www.gcash.com/help for official help articles.", ThreatLevel.SAFE),
      Case("legitimate-ordinary-link", "Here is the meeting agenda: https://example.com/agenda", ThreatLevel.SAFE),
      Case("benign-click-language", "Click here to read your neighborhood bulletin.", ThreatLevel.SAFE),
      Case("benign-limited-promo", "Limited time menu: mango drinks are available this week.", ThreatLevel.SAFE),
      Case("legitimate-tagalog-otp", "Ang iyong OTP ay 739201. Huwag itong ibigay kaninuman.", ThreatLevel.SAFE),
      Case("normal-group-message", "Magdala kayo ng tubig para sa outreach. See you at 8 AM!", ThreatLevel.SAFE),
      Case("normal-work-request", "Please send the project report by today so I can review it before the meeting.", ThreatLevel.SAFE),
      Case("prize-with-urgency-no-url", "You are a lucky winner. Claim now to receive your reward.", ThreatLevel.SUSPICIOUS),
      Case("account-warning-reply", "Your account is suspended. Reply YES now to restore access.", ThreatLevel.SUSPICIOUS),
      Case("shortener-alone", "More details: https://tinyurl.com/example", ThreatLevel.SUSPICIOUS),
      Case("ip-link-alone", "More details: http://192.0.2.44/info", ThreatLevel.SUSPICIOUS),
      Case("punycode-link-alone", "Details: https://xn--e1afmkfd.xn--p1ai/info", ThreatLevel.SUSPICIOUS),
      Case("spaced-obfuscated-link-alone", "Details: hxxps : // example [.] com", ThreatLevel.SUSPICIOUS),
      Case("parcel-reply-pressure", "Parcel delivery failed. Reply now to arrange redelivery.", ThreatLevel.SUSPICIOUS),
      Case("refund-click-pressure", "Your refund is ready. Click here to process it.", ThreatLevel.SUSPICIOUS),
      Case("government-aid-reply-pressure", "DSWD ayuda is available. Reply now to continue your application.", ThreatLevel.SUSPICIOUS),
      Case("tagalog-access-warning", "Mawawala ang access sa account mo. Verify now.", ThreatLevel.SUSPICIOUS),
      Case("unpaid-bill-pressure", "Your unpaid bill must be paid now to avoid service disconnect.", ThreatLevel.SUSPICIOUS),
      Case("credential-request-no-link", "Send your OTP now so we can continue processing.", ThreatLevel.SUSPICIOUS),
      Case("prize-link-pressure-no-url", "You are a winner. Visit our link to claim the prize.", ThreatLevel.SUSPICIOUS),
      Case("maya-urgent-account-warning", "Maya: Verify your account immediately to avoid interruption.", ThreatLevel.SUSPICIOUS),
      Case("account-respond-today", "Your account is locked. Respond today to restore access.", ThreatLevel.SUSPICIOUS),
      Case("port-and-login-ambiguous", "Click here for account details: http://example.com:8080/login", ThreatLevel.SUSPICIOUS),
      Case("gcash-shortener-account-phishing", "GCash Alert: Your account is suspended. Verify now at https://bit.ly/gcash-secure", ThreatLevel.DANGEROUS),
      Case("ip-otp-phishing", "BDO: Send your OTP now at http://192.0.2.44/verify", ThreatLevel.DANGEROUS),
      Case("tagalog-obfuscated-maya-link", "Maya: I-verify ang account mo ngayon sa hxxps://maya-verify[.]example/secure", ThreatLevel.DANGEROUS),
      Case("taglish-prize-shortener", "Nanalo ka! Claim your reward now: tinyurl.com/free-load", ThreatLevel.DANGEROUS),
      Case("at-sign-bpi-phishing", "Important: verify your account at https://bpi.com.ph@evil.example/login now", ThreatLevel.DANGEROUS),
      Case("punycode-credential-phishing", "Enter your password now: https://xn--e1afmkfd.xn--p1ai/login", ThreatLevel.DANGEROUS),
      Case("ip-parcel-phishing", "Your parcel delivery failed. Click the link now: http://203.0.113.10/pay", ThreatLevel.DANGEROUS),
      Case("no-link-credential-social-engineering", "Your account is locked. Send your OTP now or lose access.", ThreatLevel.DANGEROUS),
      Case("dswd-aid-shortener", "DSWD ayuda is available. Click the link now: bit.ly/aid", ThreatLevel.DANGEROUS),
      Case("bpi-port-redirect-phishing", "Your BPI account is suspended. Log in at secure.bpi-check.example.com:8080/login?redirect=https%3A%2F%2Fbpi.com.ph", ThreatLevel.DANGEROUS),
      Case("zero-width-and-spaced-url", "V​erify your account immediately: hxxp : // evil [.] example / secure", ThreatLevel.DANGEROUS),
      Case("prize-credential-shortener", "You are a lucky winner. Provide your banking details at https://shorturl.at/claim", ThreatLevel.DANGEROUS),
      Case("ip-port-sensitive-path", "Payment failed. Pay now at http://185.199.111.153:8080/secure", ThreatLevel.DANGEROUS),
      Case("gcash-credential-link", "GCash: We detected activity. Follow this link http://g-cash.example.com/verify to confirm your OTP.", ThreatLevel.DANGEROUS),
      Case("multiline-final-warning", "Final warning:\nYour account will be closed.\nClick the link: https://tinyurl.com/restore", ThreatLevel.DANGEROUS),
      Case("unicode-confusable-domain", "BPI urgent: Verify your account at https://раypal.example/login", ThreatLevel.DANGEROUS),
      Case("redirect-account-phishing", "Account suspended. Click the link https://example.com/verify?redirect=https%3A%2F%2Fevil.example", ThreatLevel.DANGEROUS),
      Case("excessive-subdomains", "Account suspended. Visit https://secure.verify.account.example.co.uk/login", ThreatLevel.DANGEROUS),
      Case("account-nonstandard-port", "Your account is locked. Verify at http://example.com:8443/secure", ThreatLevel.DANGEROUS),
      Case("taglish-obfuscated-shortener", "I-verify account now: hxxps://tinyurl.com/secure", ThreatLevel.DANGEROUS),
      Case("tagalog-ip-credential-request", "Ibigay ang OTP mo ngayon sa http://192.0.2.99/verify", ThreatLevel.DANGEROUS),
      Case("parcel-payment-port", "Package held. Pay immediately at https://secure.delivery.example.com:8080/payment", ThreatLevel.DANGEROUS),
      Case("leet-obfuscated-credential-phishing", "V3rify your acc0unt and s3nd your 0TP now at https://bit.ly/check", ThreatLevel.DANGEROUS),
      Case("url-surrounded-by-punctuation", "Your account is suspended (https://bit.ly/restore). Verify now!", ThreatLevel.DANGEROUS)
  )

  @Test
  fun sharedSyntheticCorpusMatchesExpectedClassification() {
    val cases = syntheticCases()
    assertEquals("The shared parity corpus must retain at least 50 cases.", true, cases.size >= 50)
    cases.forEach { case ->
      val result = SmishingEvaluator.evaluate(case.message)
      assertEquals("${case.id}: score=${result.score}, reasons=${result.reasons.map { it.code }}", case.expected, result.level)
    }
  }

  /**
   * Canonical TypeScript output digest for all 60 corpus cases. It includes the
   * level, capped score, URL count, and ordered reason codes, so a Kotlin change
   * cannot silently retain only the broad safe/suspicious/dangerous classes.
   */
  @Test
  fun sharedSyntheticCorpusMatchesTypeScriptScoresReasonsAndUrlCounts() {
    val canonical = syntheticCases().joinToString("\n") { case ->
      val result = SmishingEvaluator.evaluate(case.message)
      listOf(
        case.id,
        result.level.wireValue,
        result.score.toString(),
        result.urls.size.toString(),
        result.reasons.joinToString(",") { it.code },
      ).joinToString("|")
    }
    val actualDigest = MessageDigest.getInstance("SHA-256")
      .digest(canonical.toByteArray(Charsets.UTF_8))
      .joinToString("") { "%02x".format(it.toInt() and 0xff) }

    assertEquals(
      "Kotlin evaluator output differs from the TypeScript rule-bundle corpus.",
      "acdb9d3673e5a3383596af42c1b888110d494de3b8f33a62ed2a45b11e40327b",
      actualDigest,
    )
  }

  /** Regression cases for ECMAScript/JVM regex and WHATWG/URI edge differences. */
  @Test
  fun matchesTypeScriptUnicodeAndUrlEdgeCases() {
    val cases = listOf(
      EdgeCase(
        "unicode-whitespace",
        "Verify\u1680your account now",
        ThreatLevel.SUSPICIOUS,
        45,
        listOf("account-warning", "urgency-pressure", "account-urgency-combination"),
        0,
      ),
      EdgeCase(
        "unicode-preceding-word-boundary",
        "éverify your account now",
        ThreatLevel.SUSPICIOUS,
        45,
        listOf("account-warning", "urgency-pressure", "account-urgency-combination"),
        0,
      ),
      EdgeCase("unicode-preceding-url", "éhttps://bit.ly/x", ThreatLevel.SUSPICIOUS, 30, listOf("url-shortener"), 1, "bit.ly"),
      EdgeCase("ipv4-shorthand", "http://127.1/", ThreatLevel.SUSPICIOUS, 35, listOf("url-ip-address"), 1, "127.0.0.1"),
      EdgeCase("percent-encoded-host", "https://%62it.ly/x", ThreatLevel.SUSPICIOUS, 30, listOf("url-shortener"), 1, "bit.ly"),
      EdgeCase("http-backslash", "https://bit.ly\\evil", ThreatLevel.SUSPICIOUS, 30, listOf("url-shortener"), 1, "bit.ly"),
      EdgeCase("invalid-port-fallback", "http://example.com:99999/login", ThreatLevel.SUSPICIOUS, 32, listOf("url-obfuscated"), 1, "example.com"),
    )

    cases.forEach { case ->
      val result = SmishingEvaluator.evaluate(case.message)
      assertEquals("${case.id}: level", case.level, result.level)
      assertEquals("${case.id}: score", case.score, result.score)
      assertEquals("${case.id}: reason codes", case.codes, result.reasons.map { it.code })
      assertEquals("${case.id}: URL count", case.urlCount, result.urls.size)
      assertEquals("${case.id}: first normalized domain", case.firstDomain, result.urls.firstOrNull()?.normalizedDomain)
    }
  }

  @Test
  fun reportsTheSameVersionAsTheTypeScriptRuleBundle() {
    assertEquals("2026.08.1", SmishingEvaluator.RULE_VERSION)
  }
}

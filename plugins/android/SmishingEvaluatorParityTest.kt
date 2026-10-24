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
      Case("bdo-account-hold-path-link", "BANCO DE ORO: PLEASE BE ADVISED THAT YOUR ACCOUNT IS TEMPORARILY ON HOLD, DUE TO SECURITY PURPOSES. Kindly Visit: shortenis/MyBDO", ThreatLevel.SUSPICIOUS),
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
   *
   * As with the previous digest, "unicode-confusable-domain" includes url-punycode
   * (Kotlin's IDN.toASCII turns the look-alike host into xn--). The TypeScript
   * evaluator run under Jest leaves that host as Unicode and omits it, so a
   * Jest-generated digest must add url-punycode to that one case.
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
      "fda115325e5e9207128ec925d57795a0f2419725c8dc5294b138f29aa486c299",
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
    assertEquals("2026.10.24", SmishingEvaluator.RULE_VERSION)
  }

  /** Mirrors the rule set 2026.09.29 regressions in src/features/detection/__tests__/evaluator.test.ts. */
  @Test
  fun philippineScamFamiliesWarnAndLookalikesStaySafe() {
    listOf(
      "Hi Ma, nasira phone ko at ito ang bago kong number. Kailangan ko ng PHP 15,000 ngayon; send mo sa GCash na ito.",
      "Hello Ma, new number ko ito. Nawala phone ko. Pasend naman ng PHP 3,000 sa GCash ko ngayon, emergency lang.",
      "Boss, changed bank account po. Please send today's company payment to the attached personal account immediately.",
      "Sir, this is your manager. I need you to buy 5 gift cards for a client now. Send me the codes.",
      "Your parcel could not be delivered. Pay the PHP 17 redelivery charge at https://post-delivery.example/track.",
      "LBC: May kulang na delivery fee na PHP 25. Magbayad ngayon sa https://lbc-fee.example para hindi ibalik ang parcel.",
      "CONGRATS! You won PHP 75,000 from GCash anniversary promo. Pay the PHP 250 processing fee to claim: https://gcash-promo.example",
      "Congratulations! Your number won P50,000. To claim, send your full name, bank account number and PIN within 24 hours.",
      "May trabaho ka na! Earn PHP 5,000 daily by liking products. Deposit PHP 300 to activate your task account.",
      "Online loan approved kahit hindi ka nag-apply. I-click ang https://instant-loan.example at magbayad ng insurance fee.",
      "BPI: Unusual login detected on your account. Confirm it was you by sending your password and OTP immediately.",
      "HR recruitment: You are hired without an interview. Submit your ID and online banking password to receive your salary.",
      "Your account passed initial verification. To finish, send a photo of your card showing the number and security code.",
      "PhilHealth refund: May ibabalik na PHP 6,400 sa iyo. I-verify ang ATM card sa https://philhealth-refund.example.",
      "Na-suspend ang GCash wallet mo. I-verify ngayon sa http://gcash-ph.xyz para hindi ma-lock ang account.",
      "Meralco disconnection notice: Putol ang kuryente mo mamayang 6 PM unless you pay at https://meralco-bill.example.",
      "May maling padala akong PHP 2,000 sa iyo. Ibalik gamit ang refund link na https://wallet-return.example.",
      "URGENT: Your Maya account is locked. Send your OTP code now to verify your identity or your account will be permanently closed within 1 hour.",
    ).forEach { message ->
      val result = SmishingEvaluator.evaluate(message)
      assertEquals("$message: score=${result.score}, reasons=${result.reasons.map { it.code }}", true, result.level != ThreatLevel.SAFE)
    }
    listOf(
      "Ma, ito na bago kong number. Save mo ha, kita tayo mamaya sa bahay.",
      "Pa, pwede mo ba akong padalhan ng pera pang-tuition? Salamat po.",
      "Pls send me your bank account number so I can pay you back for lunch.",
      "Hi! Your Shopee order #2839 has been shipped. Track it in the Shopee app.",
      "Globe: Enjoy FREE 1GB data when you register to GoSURF50 today! Dial *143#.",
      "Meralco: Your bill of PHP 2,345.60 is due on Oct 5. Pay via the Meralco app or payment centers.",
      "Your Home Credit loan payment of PHP 1,500 is due tomorrow. Pay at any partner outlet.",
      "Won P500 sa raffle ng barangay! Libre ko kayo mamaya haha",
      "Smart: Your SIM registration is complete. Thank you!",
      "Please pay the registration fee at the school cashier before Friday.",
      "Meeting at 3pm tomorrow, bring the 2nd draft and 100gb flash drive.",
      "Never share your OTP or MPIN with anyone. GCash will never ask for it.",
      "All sounds good. Fingers . Makes it difficult to type",
    ).forEach { message ->
      val result = SmishingEvaluator.evaluate(message)
      assertEquals("$message: reasons=${result.reasons.map { it.code }}", emptyList<String>(), result.reasons.map { it.code })
    }
  }
  @Test
  fun credentialWordingAndSafetyAdvice() {
    listOf("Reply with your six-digit OTP to cancel the transfer.","Enter your e-wallet password to release the refund.","Confirm your username and password.","Update your card number and CVV.","Paki-reply ang OTP para ma-release ang pera.","Isumite ang inyong MPIN.").forEach { message ->
      assertEquals(message, ThreatLevel.SUSPICIOUS, SmishingEvaluator.evaluate(message).level)
    }
    listOf("hello love","Never reply with your six-digit OTP.","Do not enter your e-wallet password.","Never confirm your username and password.","Huwag paki-reply ang OTP.","Huwag isumite ang inyong MPIN.","Your six-digit OTP is 123456. Never share it.","Payment received. Thank you.").forEach { message ->
      assertEquals(message, ThreatLevel.SAFE, SmishingEvaluator.evaluate(message).level)
    }
  }

  @Test
  fun abusiveLanguageAndThreatIndicators() {
    listOf("You are a damn idiot.", "Putang ina, gago ka.").forEach { message ->
      val result = SmishingEvaluator.evaluate(message)
      assertEquals(message, ThreatLevel.SUSPICIOUS, result.level)
      assertEquals(true, result.reasons.any { it.code == "abusive-language" })
    }
    listOf(
      "I will hurt you if you come here." to "direct-threat",
      "Papatayin kita." to "direct-threat",
      "I will hack your account." to "cyber-threat",
      "Magbayad ka or ipapakalat ko ang private photos mo." to "cyber-threat",
    ).forEach { (message, code) ->
      val result = SmishingEvaluator.evaluate(message)
      assertEquals(message, ThreatLevel.DANGEROUS, result.level)
      assertEquals(true, result.reasons.any { it.code == code })
    }
  }
}

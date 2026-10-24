package __NOTICARE_PACKAGE__.bridge

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class V3RiskEvaluatorTest {
  @Test
  fun ordinaryMessagesStaySafeEvenWhenModelOutputIsHigh() {
    val ordinaryMessages = listOf(
      "hello love", "Hello love!", "Hi", "Good morning", "I love you", "Kumain ka na?",
      "Ingat ka", "Nasa bahay na ako. Kita tayo bukas pagkatapos ng klase.",
      "GCash: You received PHP 50000.00 from Ana. No action is needed.",
      "Your OTP is 482913. Do not share it with anyone.",
      "Here is the meeting agenda: https://example.com/agenda",
      "Reacted ❤️ to your message: iloveyouuuu alwayss bebebee",
    )
    for (message in ordinaryMessages) {
      val rules = SmishingEvaluator.evaluate(message)
      assertEquals(message, ThreatLevel.SAFE, rules.level)
      val result = V3RiskEvaluator.combine(rules, 1f, 0.003735364f)
      assertEquals(message, rules, result)
      assertTrue(message, result.reasons.none { it.code == "v3-model-risk" })
      val finalized = finalizeThreatResult(result)
      assertEquals(message, ThreatLevel.SAFE, finalized.level)
      assertEquals(message, 0, finalized.score)
    }
    assertEquals(0, V3RiskEvaluator.combine(SmishingEvaluator.evaluate("hello love"), 1f, 0.003735364f).score)
  }

  @Test
  fun genericPressureCannotCorroborateModelByItself() {
    for (message in listOf("Limited time menu: mango drinks are available this week.", "Click here to read your neighborhood bulletin.")) {
      val rules = SmishingEvaluator.evaluate(message)
      assertEquals(ThreatLevel.SAFE, rules.level)
      assertEquals(rules, V3RiskEvaluator.combine(rules, 1f, 0.003735364f))
    }
  }

  @Test
  fun modelAloneCannotFlagAnOrdinaryMessageOrReaction() {
    for (message in listOf(
      "An ordinary message with no recognized rule.",
      "Reacted ❤️ to your message: iloveyouuuu alwayss bebebee",
    )) {
      val rules = SmishingEvaluator.evaluate(message)
      assertEquals(message, ThreatLevel.SAFE, rules.level)
      assertEquals(message, rules, V3RiskEvaluator.combine(rules, 1f, 0.003735364f))
    }
  }

  @Test
  fun modelMayReinforceSpecificAccountWarningButNeverCreateDangerous() {
    val rules = SmishingEvaluator.evaluate("Your account is suspended.")
    assertEquals(ThreatLevel.SAFE, rules.level)
    val combined = V3RiskEvaluator.combine(rules, 1f, 0.003735364f)
    assertEquals(ThreatLevel.SUSPICIOUS, combined.level)
    assertEquals(30, combined.score)
    assertEquals(rules.reasons.size + 1, combined.reasons.size)
    assertEquals(combined.score, combined.reasons.sumOf { it.weight })
    assertEquals(rules, V3RiskEvaluator.combine(rules, 0f, 0.003735364f))
    for (invalid in listOf(Float.NaN, Float.POSITIVE_INFINITY, -1f, 2f)) {
      assertEquals(rules, V3RiskEvaluator.combine(rules, invalid, 0.003735364f))
    }
  }

  @Test
  fun explicitAccountAndLinkIndicatorsAreNotReplacedByGenericModelSignal() {
    val message =
      "BANCO DE ORO: PLEASE BE ADVISED THAT YOUR ACCOUNT IS TEMPORARILY ON HOLD, DUE TO SECURITY PURPOSES. Kindly Visit: shortenis/MyBDO"
    val rules = SmishingEvaluator.evaluate(message)
    assertEquals(ThreatLevel.SUSPICIOUS, rules.level)
    assertEquals(35, rules.score)
    assertEquals(listOf("account-warning", "link-or-reply-pressure"), rules.reasons.map { it.code })
    assertEquals(rules, V3RiskEvaluator.combine(rules, 1f, 0.003735364f))
  }

  @Test
  fun greetingDoesNotOverrideActualPhishingEvidence() {
    val rules = SmishingEvaluator.evaluate("Hello love, enter your OTP at http://192.0.2.44/verify now.")
    assertEquals(ThreatLevel.DANGEROUS, rules.level)
    assertEquals(rules, V3RiskEvaluator.combine(rules, 0f, 0.003735364f))
  }

  @Test
  fun finalizedSafeShowsZeroButKeepsReasonCodes() {
    for ((message, rawScore) in listOf(
      "Your account is suspended." to 23,
      "Limited time menu: mango drinks are available this week." to 12,
    )) {
      val rules = SmishingEvaluator.evaluate(message)
      assertEquals(message, ThreatLevel.SAFE, rules.level)
      assertEquals(message, rawScore, rules.score)
      val finalized = finalizeThreatResult(rules)
      assertEquals(message, ThreatLevel.SAFE, finalized.level)
      assertEquals(message, 0, finalized.score)
      assertEquals(message, 0, finalized.reasons.sumOf { it.weight })
      assertTrue(message, finalized.reasons.isNotEmpty())
      assertEquals(message, rules.reasons.map { it.copy(weight = 0) }, finalized.reasons)
      assertEquals(message, rules.urls, finalized.urls)
      assertEquals(message, rules.ruleVersion, finalized.ruleVersion)
      assertEquals(message, finalized, finalizeThreatResult(finalized))
    }
  }

  @Test
  fun finalizeRunsAfterCombineSoModelReinforcementIsUnchanged() {
    val rules = SmishingEvaluator.evaluate("Your account is suspended.")
    val combined = V3RiskEvaluator.combine(rules, 1f, 0.003735364f)
    val reinforced = finalizeThreatResult(combined)
    assertEquals(combined, reinforced)
    assertEquals(ThreatLevel.SUSPICIOUS, reinforced.level)
    assertEquals(30, reinforced.score)
    assertEquals(30, reinforced.reasons.sumOf { it.weight })
    assertEquals(reinforced, finalizeThreatResult(reinforced))

    val notReinforced = finalizeThreatResult(V3RiskEvaluator.combine(rules, 0f, 0.003735364f))
    assertEquals(ThreatLevel.SAFE, notReinforced.level)
    assertEquals(0, notReinforced.score)
    assertEquals(0, notReinforced.reasons.sumOf { it.weight })
    assertEquals(rules.reasons.map { it.code }, notReinforced.reasons.map { it.code })
  }

  @Test
  fun finalizeLeavesSuspiciousAndDangerousUnchanged() {
    val dangerous = SmishingEvaluator.evaluate("Hello love, enter your OTP at http://192.0.2.44/verify now.")
    assertEquals(ThreatLevel.DANGEROUS, dangerous.level)
    assertSame(dangerous, finalizeThreatResult(dangerous))
    val suspicious = SmishingEvaluator.evaluate("More details: http://192.0.2.44/info")
    assertEquals(ThreatLevel.SUSPICIOUS, suspicious.level)
    assertSame(suspicious, finalizeThreatResult(suspicious))
    val zero = SmishingEvaluator.evaluate("hello love")
    assertEquals(zero, finalizeThreatResult(zero))
  }

  @Test
  fun legacySafeHistoryRecordsReadBackAsZero() {
    val raw = SmishingEvaluator.evaluate("Your account is suspended.")
    val legacy = BlockedHistoryRecord(
      id = "legacy-safe",
      ownerScope = "scope",
      sender = "+639170000000",
      receivedAt = 1L,
      score = raw.score,
      message = "Your account is suspended.",
      redactedPreview = "Content redacted. Open to view the protected SMS.",
      reasons = raw.reasons,
      urls = raw.urls,
      sourcePackage = "com.google.android.apps.messaging",
      ruleVersion = raw.ruleVersion,
      level = ThreatLevel.SAFE,
      blocked = false,
    )
    assertEquals(23, legacy.score)
    val normalized = normalizeHistoryRecord(legacy)
    assertEquals(legacy.copy(score = 0, reasons = raw.reasons.map { it.copy(weight = 0) }), normalized)
    assertEquals(normalized, normalizeHistoryRecord(normalized))

    // Non-Safe records keep their score (a legacy record without a stored level reads as DANGEROUS).
    for (record in listOf(
      legacy.copy(level = ThreatLevel.SUSPICIOUS, score = 45),
      legacy.copy(level = ThreatLevel.DANGEROUS, score = 85, blocked = true),
    )) {
      assertSame(record, normalizeHistoryRecord(record))
    }
  }

  @Test
  fun queuedSafeTelemetryUploadsBucketZero() {
    for (bucket in listOf(0, 1, 2)) assertEquals(0, normalizeTelemetryScoreBucket("safe", bucket))
    assertEquals(3, normalizeTelemetryScoreBucket("suspicious", 3))
    assertEquals(10, normalizeTelemetryScoreBucket("dangerous", 10))
    assertEquals(10, normalizeTelemetryScoreBucket("dangerous", 42))
    assertEquals(0, normalizeTelemetryScoreBucket("suspicious", -1))
  }

  @Test
  fun encodesUtf8BytesWithOffsetAndZeroPadding() {
    val encoded = V3RiskEvaluator.encode("A₱")
    assertEquals(256, encoded.size)
    assertArrayEquals(intArrayOf(66, 227, 131, 178), encoded.copyOfRange(0, 4))
    assertEquals(0, encoded[4])
    assertEquals(0, encoded.last())
  }

  @Test
  fun truncatesAtExactly256Utf8Bytes() {
    val encoded = V3RiskEvaluator.encode("a".repeat(300))
    assertEquals(256, encoded.size)
    assertEquals(98, encoded.first())
    assertEquals(98, encoded.last())
  }
}

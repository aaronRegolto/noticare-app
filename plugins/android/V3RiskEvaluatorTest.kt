package __NOTICARE_PACKAGE__.bridge

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
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
    )
    for (message in ordinaryMessages) {
      val rules = SmishingEvaluator.evaluate(message)
      assertEquals(message, ThreatLevel.SAFE, rules.level)
      assertEquals(message, rules, V3RiskEvaluator.combine(rules, 1f, 0.003735364f))
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
  fun greetingDoesNotOverrideActualPhishingEvidence() {
    val rules = SmishingEvaluator.evaluate("Hello love, enter your OTP at http://192.0.2.44/verify now.")
    assertEquals(ThreatLevel.DANGEROUS, rules.level)
    assertEquals(rules, V3RiskEvaluator.combine(rules, 0f, 0.003735364f))
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

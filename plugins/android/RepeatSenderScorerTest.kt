package __NOTICARE_PACKAGE__.bridge

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class RepeatSenderScorerTest {
  @Test
  fun escalatesOnlyAfterIndependentSpamEvidenceFromSameSmsSender() {
    val sender = "PT Gaming"
    val spam = history("1", sender, "com.google.android.apps.messaging", 1_000, "v3-model-risk")
    val safe = result()

    val firstRepeat = RepeatSenderScorer.escalate(
      safe, "sms", "pt gaming", spam.sourcePackage, listOf(spam), now = 2_000,
    )
    assertEquals(ThreatLevel.SUSPICIOUS, firstRepeat.level)
    assertEquals(30, firstRepeat.score)
    assertEquals("repeat-sender-escalation", firstRepeat.reasons.last().code)

    val secondRepeat = RepeatSenderScorer.escalate(
      safe,
      "sms",
      sender,
      spam.sourcePackage,
      listOf(spam, history("2", sender, spam.sourcePackage, 1_500, "repeat-sender-escalation")),
      now = 2_000,
    )
    assertEquals(ThreatLevel.SUSPICIOUS, secondRepeat.level)
    assertEquals(45, secondRepeat.score)

    val thirdRepeat = RepeatSenderScorer.escalate(
      safe,
      "sms",
      sender,
      spam.sourcePackage,
      listOf(
        spam,
        history("2", sender, spam.sourcePackage, 1_200, "repeat-sender-escalation"),
        history("3", sender, spam.sourcePackage, 1_500, "repeat-sender-escalation"),
      ),
      now = 2_000,
    )
    assertEquals(ThreatLevel.SUSPICIOUS, thirdRepeat.level)
    assertEquals(60, thirdRepeat.score)

    val dangerousRepeat = RepeatSenderScorer.escalate(
      safe,
      "sms",
      sender,
      spam.sourcePackage,
      listOf(
        spam,
        history("2", sender, spam.sourcePackage, 1_100, "repeat-sender-escalation"),
        history("3", sender, spam.sourcePackage, 1_200, "repeat-sender-escalation"),
        history("4", sender, spam.sourcePackage, 1_500, "repeat-sender-escalation"),
      ),
      now = 2_000,
    )
    assertEquals(ThreatLevel.DANGEROUS, dangerousRepeat.level)
    assertEquals(75, dangerousRepeat.score)
  }

  @Test
  fun benignFrequentMessagesAndDifferentAppsDoNotEscalate() {
    val safe = result()
    val benign = history("1", "PT Gaming", "com.google.android.apps.messaging", 1_000, "urgency-pressure")
    assertSame(safe, RepeatSenderScorer.escalate(
      safe, "sms", benign.sender, benign.sourcePackage, listOf(benign), now = 2_000,
    ))
    assertSame(safe, RepeatSenderScorer.escalate(
      safe, "messenger", benign.sender, NotificationSource.MESSENGER_PACKAGE, listOf(benign), now = 2_000,
    ))
  }

  @Test
  fun messengerDoesNotInheritSmsHistoryEscalation() {
    val smsSpam = history("1", "mommy oni", "com.google.android.apps.messaging", 1_000, "v3-model-risk")
    val safe = result()

    assertSame(
      safe,
      RepeatSenderScorer.escalate(
        safe,
        "messenger",
        "mommy oni",
        NotificationSource.MESSENGER_PACKAGE,
        listOf(smsSpam),
        now = 2_000,
      ),
    )
  }

  private fun result() = ThreatResult(
    level = ThreatLevel.SAFE,
    score = 0,
    reasons = emptyList(),
    urls = emptyList(),
    ruleVersion = "test",
  )

  private fun history(
    id: String,
    sender: String,
    sourcePackage: String,
    receivedAt: Long,
    code: String,
  ) = BlockedHistoryRecord(
    id = id,
    ownerScope = "test",
    sender = sender,
    receivedAt = receivedAt,
    score = 0,
    message = "redacted",
    redactedPreview = "Message hidden",
    reasons = listOf(ThreatReason(code, code, code, 0)),
    urls = emptyList(),
    sourcePackage = sourcePackage,
    ruleVersion = "test",
    level = ThreatLevel.SAFE,
    blocked = false,
  )
}

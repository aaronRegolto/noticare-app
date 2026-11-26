package __NOTICARE_PACKAGE__.bridge

import org.junit.Assert.*
import org.junit.Test

class NotificationInputTest {
  private val phishing = "Enter your OTP at http://192.0.2.44/verify now."

  @Test fun newestGreetingDoesNotInheritAnOlderPhishingMessage() {
    val text = NotificationInput.select(true, "hello love", phishing, phishing, listOf(phishing, "hello love"))
    assertEquals("hello love", text)
    assertEquals(ThreatLevel.SAFE, SmishingEvaluator.evaluate(text!!).level)
  }

  @Test fun newestPhishingMessageDoesNotGetReplacedByAnOlderGreeting() {
    val text = NotificationInput.select(true, phishing, "hello love", "hello love", emptyList())
    assertEquals(phishing, text)
    assertEquals(ThreatLevel.DANGEROUS, SmishingEvaluator.evaluate(text!!).level)
  }

  @Test fun expandedBodyPreservesRiskHiddenBeyondTheShortPreview() {
    val text = NotificationInput.select(false, null, "Hello love. $phishing", "Hello love.", emptyList())
    assertEquals("Hello love. $phishing", text)
    assertEquals(ThreatLevel.DANGEROUS, SmishingEvaluator.evaluate(text!!).level)
  }

  @Test fun missingOrAmbiguousContentIsNotClassifiedAsSafe() {
    assertNull(NotificationInput.select(true, " ", null, "older greeting", emptyList()))
    assertNull(NotificationInput.select(false, null, null, "2 messages", listOf("hello", phishing)))
    assertNull(NotificationInput.select(false, null, "hello\n$phishing", "2 messages", listOf("hello", phishing)))
    assertNull(NotificationInput.select(false, null, null, null, emptyList()))
    assertEquals("hello", NotificationInput.select(false, null, null, "hello", emptyList()))
  }

  @Test fun messengerContextNotificationsAreNotScannedAsMessages() {
    assertNull(NotificationInput.select(true, "Ana reacted ❤️ to your message", null, null, emptyList(), "messenger"))
    assertNull(NotificationInput.select(true, "Ana mentioned you in a group", null, null, emptyList(), "messenger"))
    assertNull(NotificationInput.select(true, "You were mentioned in a group chat", null, null, emptyList(), "messenger"))
    assertNull(NotificationInput.select(true, "Marianne tagged you in the group", null, null, emptyList(), "messenger"))
    assertNull(NotificationInput.select(true, "Rico mentioned Maria in a group chat", null, null, emptyList(), "messenger"))
    assertNull(NotificationInput.select(true, "Someone tagged Alex in the group", null, null, emptyList(), "messenger"))
    assertNull(NotificationInput.select(true, "Juan nag-react sa iyong mensahe", null, null, emptyList(), "messenger"))
    assertNull(NotificationInput.select(true, "Lia commented on your photo", null, null, emptyList(), "messenger"))
    assertNull(NotificationInput.select(true, "Someone tagged you in a story", null, null, emptyList(), "messenger"))
    assertNull(NotificationInput.select(true, "Rico mentioned Cash in the group chat", null, null, emptyList(), "messenger"))
    assertNull(NotificationInput.select(true, "Ana mentioned Pin in a group chat", null, null, emptyList(), "messenger"))
    assertNull(NotificationInput.select(true, "Click here to see the group photo", null, null, emptyList(), "messenger"))
    assertEquals(
      "Ana mentioned you: $phishing",
      NotificationInput.select(true, "Ana mentioned you: $phishing", null, null, emptyList(), "messenger"),
    )
    assertEquals(
      "Your account is suspended. Verify now at https://bit.ly/check",
      NotificationInput.select(
        true,
        "Your account is suspended. Verify now at https://bit.ly/check",
        null,
        null,
        emptyList(),
        "messenger",
      ),
    )
  }

  @Test fun messengerAcceptsRecognizedSpamAndThreatCategories() {
    val spam = "You are a lucky winner. Claim now to receive your reward."
    val threat = "I will hack your account."

    assertTrue("spam" in MessageCategories.fromReasons(SmishingEvaluator.evaluate(spam).reasons))
    assertTrue("threats" in MessageCategories.fromReasons(SmishingEvaluator.evaluate(threat).reasons))
    assertEquals(spam, NotificationInput.select(true, spam, null, null, emptyList(), "messenger"))
    assertEquals(threat, NotificationInput.select(true, threat, null, null, emptyList(), "messenger"))
  }

  @Test fun messengerIgnoresSafeDirectMessages() {
    assertNull(
      NotificationInput.select(
        true,
        "Had fun today. See you tomorrow.",
        null,
        null,
        emptyList(),
        "messenger",
      ),
    )
  }

  @Test fun newContentOnTheSameNotificationStillGetsScanned() {
    assertFalse(NotificationDeduplicator.isDuplicate("test-conversation", "greeting", 1000))
    assertTrue(NotificationDeduplicator.isDuplicate("test-conversation", "greeting", 1001))
    assertFalse(NotificationDeduplicator.isDuplicate("test-conversation", "phishing", 1002))
    assertFalse(NotificationDeduplicator.isDuplicate("different-conversation", "greeting", 1003))
  }
}

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

  @Test fun newContentOnTheSameNotificationStillGetsScanned() {
    assertFalse(NotificationDeduplicator.isDuplicate("test-conversation", "greeting", 1000))
    assertTrue(NotificationDeduplicator.isDuplicate("test-conversation", "greeting", 1001))
    assertFalse(NotificationDeduplicator.isDuplicate("test-conversation", "phishing", 1002))
    assertFalse(NotificationDeduplicator.isDuplicate("different-conversation", "greeting", 1003))
  }
}

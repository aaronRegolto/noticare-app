package __NOTICARE_PACKAGE__.bridge

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class WarningCopyTest {
  private val shortened = ThreatReason("url-shortener", "Shortened link", "A URL shortener hides the destination domain.", 30)

  @Test
  fun englishKeepsTheScannerWording() {
    assertEquals("Shortened link", WarningCopy.English.reasonLabel(shortened))
    assertEquals("A URL shortener hides the destination domain.", WarningCopy.English.reasonDescription(shortened))
    assertEquals("Possible phishing message", WarningCopy.English.titleDangerous)
  }

  @Test
  fun tagalogTranslatesWarningSignsByCode() {
    assertEquals("Pinaikling link", WarningCopy.Tagalog.reasonLabel(shortened))
    assertNotEquals(shortened.description, WarningCopy.Tagalog.reasonDescription(shortened))
    assertEquals("AI check", WarningCopy.Tagalog.reasonLabel(ThreatReason("v3-model-risk", "AI check", "x", 12)))
  }

  @Test
  fun anUnknownCodeFallsBackToTheScannerWording() {
    val future = ThreatReason("future-rule", "Future rule", "Added after this translation.", 10)
    assertEquals("Future rule", WarningCopy.Tagalog.reasonLabel(future))
    assertEquals("Added after this translation.", WarningCopy.Tagalog.reasonDescription(future))
  }

  @Test
  fun scoresAndDomainsStayInTheTranslatedText() {
    assertEquals(true, WarningCopy.Tagalog.dangerBody(85, "Pinaikling link").contains("85/100"))
    assertEquals(true, WarningCopy.Tagalog.suspiciousDomains(listOf("gcash-verify.xyz")).endsWith("gcash-verify.xyz"))
    assertEquals(true, WarningCopy.Tagalog.cappedNote(130).contains("130"))
  }
}

package __NOTICARE_PACKAGE__.bridge

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RuleBasedUrlCheckerTest {
  private val checker = RuleBasedUrlChecker()

  @Test
  fun officialAndOrdinarySitesAreSafe() {
    for (url in listOf("https://www.gcash.com/help", "https://m.maya.ph", "https://www.google.com/search?q=noticare")) {
      assertEquals(url, UrlCheckResult(UrlVerdict.SAFE, UrlReason.NONE), checker.check(url))
    }
  }

  @Test
  fun eachRiskSignHasItsReasonAndDetail() {
    assertEquals(UrlCheckResult(UrlVerdict.DANGEROUS, UrlReason.KNOWN_DANGEROUS), checker.check("https://test-dangerous-site.xyz/login"))
    assertEquals(UrlCheckResult(UrlVerdict.SUSPICIOUS, UrlReason.SHORTENER, "bit.ly"), checker.check("https://bit.ly/abc"))
    assertEquals(UrlCheckResult(UrlVerdict.SUSPICIOUS, UrlReason.RAW_IP, "192.168.1.20"), checker.check("http://192.168.1.20/pay"))
    assertEquals(UrlCheckResult(UrlVerdict.SUSPICIOUS, UrlReason.UNUSUAL_TLD, ".top"), checker.check("https://claim-reward.top"))
    assertEquals(
      UrlCheckResult(UrlVerdict.SUSPICIOUS, UrlReason.LOOKALIKE_BRAND, "BPI"),
      checker.check("https://bpi-secure-login.com/verify"),
    )
    assertEquals(
      UrlCheckResult(UrlVerdict.SUSPICIOUS, UrlReason.HIDDEN_DESTINATION),
      checker.check("https://www.gcash.com@evil.example/login"),
    )
  }

  @Test
  fun warningsReadNaturallyInBothLanguages() {
    val lookalike = UrlCheckResult(UrlVerdict.SUSPICIOUS, UrlReason.LOOKALIKE_BRAND, "GCash")
    assertEquals(
      "This link pretends to be GCash, but it isn't one of GCash's official websites.",
      LinkWarningCopy.English.reason(lookalike),
    )
    assertTrue(LinkWarningCopy.Tagalog.reason(lookalike).contains("GCash"))
    for (reason in UrlReason.values()) {
      val result = UrlCheckResult(UrlVerdict.SUSPICIOUS, reason, "x")
      assertTrue(reason.name, LinkWarningCopy.English.reason(result).isNotBlank())
      assertTrue(reason.name, LinkWarningCopy.Tagalog.reason(result).isNotBlank())
    }
  }

  @Test
  fun browserChooserCopyIsAvailableInBothLanguages() {
    assertEquals("Choose a browser", LinkWarningCopy.English.chooseBrowser)
    assertEquals("Open in Chrome", LinkWarningCopy.English.openInBrowser("Chrome"))
    assertEquals("Pumili ng browser", LinkWarningCopy.Tagalog.chooseBrowser)
    assertEquals("Buksan sa Chrome", LinkWarningCopy.Tagalog.openInBrowser("Chrome"))
    assertTrue(LinkWarningCopy.English.safeCaveat.contains("not a guarantee"))
    assertTrue(LinkWarningCopy.Tagalog.safeCaveat.contains("Hindi ito garantiya"))
  }
}

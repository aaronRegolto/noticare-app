package __NOTICARE_PACKAGE__.bridge

import org.junit.Assert.assertEquals
import org.junit.Test

class MessageCategoriesTest {
  @Test
  fun mapsIndependentKindsAndAllowsMultipleCategories() {
    assertEquals(listOf("threats"), MessageCategories.fromReasons(listOf(reason("direct-threat"))))
    assertEquals(listOf("spam", "phishing"), MessageCategories.fromReasons(
      listOf(reason("v3-model-risk"), reason("url-shortener")),
    ))
    assertEquals(listOf("spam"), MessageCategories.fromReasons(listOf(reason("urgency-pressure"))))
    assertEquals(false, MessageCategories.hasIndependentSpamEvidence(listOf(reason("urgency-pressure"))))
  }

  private fun reason(code: String) = ThreatReason(code, code, code, 0)
}

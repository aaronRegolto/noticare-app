package __NOTICARE_PACKAGE__.bridge

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SharedLinkExtractorTest {
  @Test
  fun acceptsOneHttpLinkAndRemovesSentencePunctuation() {
    assertEquals(
      "https://example.test/path",
      SharedLinkExtractor.extractSingleUrl("Check this link: https://example.test/path."),
    )
  }

  @Test
  fun rejectsMissingOrMultipleLinksRatherThanCheckingOnlyOne() {
    assertNull(SharedLinkExtractor.extractSingleUrl("No link here"))
    assertNull(SharedLinkExtractor.extractSingleUrl("https://one.test and https://two.test"))
    assertNull(SharedLinkExtractor.extractSingleUrl(null))
  }
}

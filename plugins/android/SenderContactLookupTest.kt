package __NOTICARE_PACKAGE__.bridge

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SenderContactLookupTest {
  @Test
  fun detectsPhoneNumbersWithoutTreatingNamesAsNumbers() {
    assertTrue(SenderContactLookup.looksLikePhoneNumber("+63 (917) 123-4567"))
    assertTrue(SenderContactLookup.looksLikePhoneNumber("09171234567"))
    assertFalse(SenderContactLookup.looksLikePhoneNumber("PT Gaming"))
    assertFalse(SenderContactLookup.looksLikePhoneNumber("123"))
  }
}

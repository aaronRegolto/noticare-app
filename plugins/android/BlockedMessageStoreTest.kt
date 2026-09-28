package __NOTICARE_PACKAGE__.bridge

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class BlockedMessageStoreTest {
  @Test
  fun sameWordingMatchesRegardlessOfCaseAndSpacing() {
    assertEquals(
      BlockedMessageStore.hash("Maya: I-verify ang account mo ngayon sa hxxps://maya-verify[.]example/secure"),
      BlockedMessageStore.hash("  maya:  I-VERIFY ang account mo\nngayon sa hxxps://maya-verify[.]example/secure "),
    )
  }

  @Test
  fun differentWordingDoesNotMatch() {
    assertNotEquals(
      BlockedMessageStore.hash("Your account is locked. Send your OTP now."),
      BlockedMessageStore.hash("Your account is locked. Send your PIN now."),
    )
  }

  @Test
  fun matchesTheServerNormalizationHash() {
    // sha256("hello world"), as normalize_phishing_message_text + digest produce for "  Hello   World ".
    assertEquals(
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
      BlockedMessageStore.hash("  Hello   World "),
    )
  }
}

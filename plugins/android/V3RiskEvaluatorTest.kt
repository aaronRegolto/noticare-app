package __NOTICARE_PACKAGE__.bridge

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class V3RiskEvaluatorTest {
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

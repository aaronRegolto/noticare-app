package __NOTICARE_PACKAGE__.bridge

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class UrlRiskEvaluatorTest {
  @Test
  fun encodesDeviceMatchedUrlFeatures() {
    val features = UrlRiskEvaluator.encode(
      "https://www.southbankmosaics.com",
      "www.southbankmosaics.com",
    )

    assertEquals(15, features.size)
    assertEquals(32f, features[0])
    assertEquals(24f, features[1])
    assertEquals(0f, features[2])
    assertEquals(1f, features[3])
    assertEquals(0f, features[4])
    assertEquals(0f, features[5])
    assertEquals(0f, features[6])
    assertEquals(19f, features[7])
    assertEquals(19f / 32f, features[8], 0.00001f)
    assertEquals(0f, features[9])
    assertEquals(0f, features[10])
    assertEquals(0f, features[11])
    assertEquals(0f, features[12])
    assertEquals(0f, features[13])
    assertEquals(1f, features[14])
  }

  @Test
  fun countsPercentEncodingAsDatasetObfuscation() {
    val features = UrlRiskEvaluator.encode(
      "https://example.com/a%20%284%29.html?q=1&x=2",
      "example.com",
    )

    assertEquals(1f, features[4])
    assertEquals(9f, features[5])
    assertEquals(9f / features[0], features[6], 0.00001f)
    assertEquals(2f, features[11])
    assertEquals(1f, features[12])
    assertEquals(1f, features[13])
  }

  @Test
  fun rejectsMissingHost() {
    assertTrue(UrlRiskEvaluator.encode("https:///missing", null).isEmpty())
  }
}

package __NOTICARE_PACKAGE__.bridge

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ThreatModelsTest {
  @Test
  fun onlyNonSafeThreatResultsAreRetained() {
    assertFalse(ThreatLevel.SAFE.shouldRetainInHistory())
    assertTrue(ThreatLevel.SUSPICIOUS.shouldRetainInHistory())
    assertTrue(ThreatLevel.DANGEROUS.shouldRetainInHistory())
  }
}

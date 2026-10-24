package __NOTICARE_PACKAGE__.bridge

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NotificationSourceTest {
  @Test
  fun identifiesSupportedAppsAndRejectsOthers() {
    assertEquals("sms", NotificationSource.idForPackage("com.example.sms", "com.example.sms"))
    assertEquals("messenger", NotificationSource.idForPackage(NotificationSource.MESSENGER_PACKAGE, "com.example.sms"))
    assertNull(NotificationSource.idForPackage("com.example.other", "com.example.sms"))
    assertEquals("messenger", NotificationSource.idForPackage(NotificationSource.MESSENGER_PACKAGE, null))
    assertNull(NotificationSource.idForPackage("com.example.other", null))
  }
}

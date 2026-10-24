package __NOTICARE_PACKAGE__.bridge

internal object NotificationSource {
  const val MESSENGER_PACKAGE = "com.facebook.orca"

  fun idForPackage(packageName: String, defaultSmsPackage: String?): String? = when {
    packageName == defaultSmsPackage && defaultSmsPackage != null -> "sms"
    packageName == MESSENGER_PACKAGE -> "messenger"
    else -> null
  }
}

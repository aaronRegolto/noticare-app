package __NOTICARE_PACKAGE__.bridge

/** Chooses one message body; never joins a conversation summary into a new SMS. */
internal object NotificationInput {
  private val messengerMetadataPattern = Regex(
    """(?i)^.{0,80}?\b(?:react(?:ed|s)?|nag[- ]?react(?:ed|s)?|mentioned|tagged)\b.{0,80}?\b(?:to|your|you|sa|iyo)\b.{0,80}$""",
  )

  fun select(
    hasMessages: Boolean,
    latestMessage: String?,
    bigText: String?,
    text: String?,
    lines: List<String>,
    sourceId: String? = null,
  ): String? {
    fun clean(value: String?) = value?.trim()?.takeIf { it.isNotEmpty() }
    val selected = if (hasMessages) clean(latestMessage) else {
      if (lines.count { it.isNotBlank() } > 1) return null
      clean(bigText) ?: clean(text) ?: lines.singleOrNull()?.let(::clean)
    }
    // Messenger synthesizes reaction and mention notifications that describe a
    // chat event rather than contain a user-authored message. Scanning those
    // as SMS content makes ordinary social activity look like phishing.
    if (sourceId == "messenger" && selected?.let(messengerMetadataPattern::matches) == true) return null
    return selected
  }
}

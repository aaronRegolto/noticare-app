package __NOTICARE_PACKAGE__.bridge

/** Chooses one message body; never joins a conversation summary into a new SMS. */
internal object NotificationInput {
  fun select(
    hasMessages: Boolean,
    latestMessage: String?,
    bigText: String?,
    text: String?,
    lines: List<String>,
  ): String? {
    fun clean(value: String?) = value?.trim()?.takeIf { it.isNotEmpty() }
    // Missing text on the newest structured message must not reuse an older preview.
    if (hasMessages) return clean(latestMessage)
    // Multiple InboxStyle lines are different messages with unknown ordering.
    if (lines.count { it.isNotBlank() } > 1) return null
    clean(bigText)?.let { return it }
    return clean(text) ?: lines.singleOrNull()?.let(::clean)
  }
}

package __NOTICARE_PACKAGE__.bridge

/** Chooses one message body; never joins a conversation summary into a new SMS. */
internal object NotificationInput {
  private val legacySocialEventPattern = Regex(
    """(?:reacted|reaction|reactions|mentioned|mention|tagged|commented|shared|nag-react|nag react|added you to|added you in|you were mentioned|you have been mentioned|you were tagged|you were added|mentioned john|mentioned maria|tagged john|tagged maria)""",
    RegexOption.IGNORE_CASE,
  )
  private val legacySocialContextPattern = Regex(
    """(?:your message|your post|your story|your photo|your video|in a group|in the group|group chat|in a chat|in a comment|in a story|to your|to you|sa iyong|iyo|@|mention|tag|group|chat|story|message|post|photo|video)""",
    RegexOption.IGNORE_CASE,
  )
  private val legacyPhishingSignalPattern = Regex(
    """(?:otp|password|pin|verify|update your account|click here|link|bit\.ly|http|https|urgent|suspended|locked|reward|prize|refund|cash|bonus|unpaid|payment|bank|wallet|account|security code)""",
    RegexOption.IGNORE_CASE,
  )

  private fun isLegacyMentionOnlySocialText(value: String): Boolean =
    legacySocialEventPattern.containsMatchIn(value) &&
      legacySocialContextPattern.containsMatchIn(value) &&
      !legacyPhishingSignalPattern.containsMatchIn(value)

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
    if (sourceId != "messenger" && selected != null && isLegacyMentionOnlySocialText(selected)) return null
    // Messenger group notifications often contain names and ordinary chat-event
    // wording. Use the same detector categories as the warning UI instead of
    // keyword fragments, so only recognized phishing evidence reaches triage.
    if (
      sourceId == "messenger" &&
      selected != null &&
      "phishing" !in MessageCategories.fromReasons(SmishingEvaluator.evaluate(selected).reasons)
    ) return null
    return selected
  }
}

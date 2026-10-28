package __NOTICARE_PACKAGE__.bridge

/** Chooses one message body; never joins a conversation summary into a new SMS. */
internal object NotificationInput {
  private val socialMentionKeywords = listOf(
    "reacted",
    "reaction",
    "reactions",
    "mentioned",
    "mention",
    "tagged",
    "commented",
    "shared",
    "nag-react",
    "nag react",
    "added you to",
    "added you in",
    "you were mentioned",
    "you have been mentioned",
    "you were tagged",
    "you were added",
    "mentioned john",
    "mentioned maria",
    "tagged john",
    "tagged maria",
  )

  private val socialContextKeywords = listOf(
    "your message",
    "your post",
    "your story",
    "your photo",
    "your video",
    "in a group",
    "in the group",
    "group chat",
    "in a chat",
    "in a comment",
    "in a story",
    "to your",
    "to you",
    "sa iyong",
    "iyo",
    "@",
    "mention",
    "tag",
    "group",
    "chat",
    "story",
    "message",
    "post",
    "photo",
    "video",
  )

  private val phishingSignals = listOf(
    "otp",
    "password",
    "pin",
    "verify",
    "update your account",
    "click here",
    "link",
    "bit.ly",
    "http",
    "https",
    "urgent",
    "suspended",
    "locked",
    "reward",
    "prize",
    "refund",
    "cash",
    "bonus",
    "unpaid",
    "payment",
    "bank",
    "wallet",
    "account",
    "security code",
  )

  private fun isMentionOnlySocialText(value: String): Boolean {
    val lower = value.lowercase()
    val hasSocialMention = socialMentionKeywords.any(lower::contains)
    val hasSocialContext = socialContextKeywords.any(lower::contains)
    val isSocialEvent = hasSocialMention || lower.contains("@") || lower.contains("mentioned") || lower.contains("tagged") || lower.contains("reacted") || lower.contains("commented")
    val hasGroupOrSocialContext = hasSocialContext || lower.contains("group") || lower.contains("chat") || lower.contains("story") || lower.contains("message")
    if (!isSocialEvent || !hasGroupOrSocialContext) return false
    val hasPhishingSignal = phishingSignals.any(lower::contains)
    return !hasPhishingSignal
  }

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
    if (selected != null && isMentionOnlySocialText(selected)) return null
    // Messenger synthesizes reaction and mention notifications that describe a
    // chat event rather than a user-authored message. Keep these out of the
    // detector unless the message also contains a real phishing pattern or URL.
    if (sourceId == "messenger" && selected != null && isMentionOnlySocialText(selected)) return null
    return selected
  }
}

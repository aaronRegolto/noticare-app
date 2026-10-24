package __NOTICARE_PACKAGE__.bridge

internal object SharedLinkExtractor {
  private val urlPattern = Regex("""https?://[^\s<>"']+""", RegexOption.IGNORE_CASE)

  fun extractSingleUrl(sharedText: String?): String? {
    val text = sharedText?.take(12_000) ?: return null
    val candidates = urlPattern.findAll(text)
      .map { it.value.trimEnd('.', ',', '!', '?', ';', ':', ')', ']', '}') }
      .filter(String::isNotBlank)
      .distinct()
      .take(2)
      .toList()
    return candidates.singleOrNull()
  }
}

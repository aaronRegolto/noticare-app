package __NOTICARE_PACKAGE__.bridge

/** How risky a checked URL appears to be. */
enum class UrlVerdict {
    SAFE,
    SUSPICIOUS,
    DANGEROUS,
}

/** The result of checking one URL: a verdict plus a human-readable reason. */
data class UrlCheckResult(val verdict: UrlVerdict, val reason: String)

/**
 * Something that can look at a URL and decide how risky it is.
 *
 * This is deliberately just an interface so the current rule-based
 * implementation ([RuleBasedUrlChecker]) can later be swapped for, or
 * combined with, a TensorFlow Lite model and/or an online reputation lookup
 * without [LinkHandlerActivity] needing to change at all.
 */
interface UrlChecker {
    fun check(rawUrl: String): UrlCheckResult
}

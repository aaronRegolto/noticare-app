package __NOTICARE_PACKAGE__.bridge

import java.net.URI

/** A URL broken into the pieces [RuleBasedUrlChecker] needs, after normalization. */
data class NormalizedUrl(
    /** The exact string that was checked, unmodified. Always shown to the user as-is. */
    val original: String,
    /** e.g. "http" or "https". Null if it could not be determined. */
    val scheme: String?,
    /** Lowercased host with a leading "www." removed. Null if the URL could not be parsed. */
    val host: String?,
    /** True if the URL's authority section (before the path) contains an "@". */
    val hasAtInAuthority: Boolean,
)

/**
 * Turns a raw, possibly messy URL string into the normalized pieces the rest of
 * the app reasons about. Never throws: a URL that cannot be parsed just comes
 * back with a null host, which callers treat as "cannot verify this is safe."
 */
object UrlNormalizer {
    fun normalize(rawUrl: String): NormalizedUrl {
        val trimmed = rawUrl.trim()
        // A link opened by another app almost always already has a scheme (that's how
        // Android knew to route it here), but this keeps the normalizer safe to reuse
        // for scheme-less input too, e.g. a URL typed into a future settings screen.
        val withScheme = if (Regex("^[a-zA-Z][a-zA-Z0-9+.-]*://").containsMatchIn(trimmed)) {
            trimmed
        } else {
            "http://$trimmed"
        }

        val host = try {
            URI(withScheme).host?.lowercase()?.removePrefix("www.")
        } catch (_: Exception) {
            null
        }
        val scheme = try {
            URI(withScheme).scheme?.lowercase()
        } catch (_: Exception) {
            null
        }

        return NormalizedUrl(
            original = rawUrl,
            scheme = scheme,
            host = host,
            hasAtInAuthority = authorityContainsAt(withScheme),
        )
    }

    /**
     * Detects the classic "http://real-brand.com@evil.com/" trick: everything before
     * the "@" looks like a trustworthy domain, but browsers treat it as login
     * credentials and actually navigate to whatever comes after the "@".
     */
    private fun authorityContainsAt(url: String): Boolean {
        val afterScheme = url.substringAfter("://", missingDelimiterValue = url)
        val authority = afterScheme.substringBefore('/').substringBefore('?').substringBefore('#')
        return authority.contains('@')
    }
}

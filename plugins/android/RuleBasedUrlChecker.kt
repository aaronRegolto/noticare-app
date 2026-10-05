package __NOTICARE_PACKAGE__.bridge

/**
 * The current [UrlChecker]: a hard-coded blocklist plus a handful of simple,
 * explainable heuristics. No network access and no on-device ML yet — both
 * can be added later as additional [UrlChecker] implementations without
 * touching [LinkHandlerActivity].
 */
class RuleBasedUrlChecker : UrlChecker {

    override fun check(rawUrl: String): UrlCheckResult {
        val normalized = UrlNormalizer.normalize(rawUrl)
        val host = normalized.host ?: return UrlCheckResult(UrlVerdict.SUSPICIOUS, UrlReason.UNREADABLE)

        if (host in DANGEROUS_HOSTS) return UrlCheckResult(UrlVerdict.DANGEROUS, UrlReason.KNOWN_DANGEROUS)
        if (normalized.hasAtInAuthority) return UrlCheckResult(UrlVerdict.SUSPICIOUS, UrlReason.HIDDEN_DESTINATION)
        if (host in URL_SHORTENERS) return UrlCheckResult(UrlVerdict.SUSPICIOUS, UrlReason.SHORTENER, host)
        if (isRawIpAddress(host)) return UrlCheckResult(UrlVerdict.SUSPICIOUS, UrlReason.RAW_IP, host)
        unusualTldSuffix(host)?.let { tld -> return UrlCheckResult(UrlVerdict.SUSPICIOUS, UrlReason.UNUSUAL_TLD, tld) }
        lookalikeBrand(host)?.let { brand ->
            return UrlCheckResult(UrlVerdict.SUSPICIOUS, UrlReason.LOOKALIKE_BRAND, BRAND_NAMES[brand] ?: brand)
        }
        return UrlCheckResult(UrlVerdict.SAFE, UrlReason.NONE)
    }

    private fun isRawIpAddress(host: String): Boolean {
        return IPV4_PATTERN.matches(host) || (host.startsWith("[") && host.endsWith("]"))
    }

    private fun unusualTldSuffix(host: String): String? =
        UNUSUAL_TLDS.firstOrNull { tld -> host.endsWith(tld) }

    /** Returns the brand name being imitated, or null if [host] is safe or is an official domain. */
    private fun lookalikeBrand(host: String): String? {
        for ((brand, officialDomains) in PH_BRAND_OFFICIAL_DOMAINS) {
            val isOfficial = officialDomains.any { official -> host == official || host.endsWith(".$official") }
            if (isOfficial) continue
            if (host.contains(brand)) return brand
        }
        return null
    }

    companion object {
        private val IPV4_PATTERN = Regex("^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$")

        // Fake domains reserved for testing the flow end-to-end (see the app's testing
        // instructions for the matching `adb` commands). None of these resolve to a real site.
        private val DANGEROUS_HOSTS = setOf(
            "test-dangerous-site.xyz",
            "noticare-test-dangerous.com",
            "fake-phishing-test.click",
        )

        private val URL_SHORTENERS = setOf(
            "bit.ly",
            "tinyurl.com",
            "t.co",
            "goo.gl",
            "is.gd",
            "ow.ly",
            "buff.ly",
            "rebrand.ly",
            "cutt.ly",
            "shorturl.at",
        )

        private val UNUSUAL_TLDS = setOf(
            ".xyz",
            ".top",
            ".icu",
            ".tk",
            ".gq",
            ".cf",
            ".ml",
            ".work",
            ".click",
            ".country",
            ".loan",
            ".men",
        )

        // Brand name to substring-match against a host, mapped to that brand's real
        // domains. A host that mentions the brand but doesn't match (or belong to a
        // subdomain of) one of these is flagged as a possible lookalike.
        // How each brand is written in a warning ("GCash", not the matched "gcash").
        private val BRAND_NAMES = mapOf(
            "gcash" to "GCash",
            "maya" to "Maya",
            "bdo" to "BDO",
            "bpi" to "BPI",
            "lazada" to "Lazada",
            "shopee" to "Shopee",
            "lbc" to "LBC",
        )

        private val PH_BRAND_OFFICIAL_DOMAINS = mapOf(
            "gcash" to setOf("gcash.com"),
            "maya" to setOf("maya.ph", "paymaya.com"),
            "bdo" to setOf("bdo.com.ph"),
            "bpi" to setOf("bpi.com.ph", "bpiexpressonline.com"),
            "lazada" to setOf("lazada.com.ph", "lazada.com"),
            "shopee" to setOf("shopee.ph", "shopee.com"),
            "lbc" to setOf("lbcexpress.com"),
        )
    }
}

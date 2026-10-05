package __NOTICARE_PACKAGE__.bridge

import android.content.Context

/**
 * The words of the risky-link warning ([LinkWarningActivity]) in the user's chosen message
 * language, following the same Settings choice as [WarningCopy]: Tagalog when the user chooses
 * Tagalog, English otherwise. Written by hand so the warning is instant and works offline.
 */
object LinkWarningCopy {
  fun forContext(context: Context): Copy = if (WarningCopy.forContext(context) === WarningCopy.Tagalog) Tagalog else English

  open class Copy {
    open val titleDangerous = "Don't open this link"
    open val titleSuspicious = "Be careful with this link"
    open val badgeDangerous = "DANGEROUS LINK"
    open val badgeSuspicious = "SUSPICIOUS LINK"
    open val intro = "NotiCare checked this link before opening it."
    open val website = "Website"
    open val why = "Why NotiCare stopped it"
    open val advice = "Never enter your password, PIN, or OTP on a website you reached from a message."
    open val goBack = "Go back"
    open val openAnyway = "Open anyway"
    open val confirmTitle = "Open this link anyway?"
    open val confirmBody =
      "NotiCare flagged this link as risky. Opening it could expose your accounts or personal information."
    open val confirmCancel = "Cancel"
    open val noBrowser = "No other browser is installed to open this link."
    open fun openFailed(browser: String) = "Could not open this link in $browser."

    open fun reason(result: UrlCheckResult): String {
      val detail = result.detail.orEmpty()
      return when (result.reason) {
        UrlReason.UNREADABLE -> "This link could not be read as a valid web address."
        UrlReason.KNOWN_DANGEROUS -> "This website is on NotiCare's list of known scam sites."
        UrlReason.HIDDEN_DESTINATION -> "This link uses an \"@\" symbol to hide where it really goes."
        UrlReason.SHORTENER -> "This is a shortened link ($detail). Its real destination is hidden until you open it."
        UrlReason.RAW_IP -> "This link goes to a numeric address ($detail) instead of a named website."
        UrlReason.UNUSUAL_TLD ->
          "This link ends in \"$detail\", an ending rarely used by real Philippine websites and often used by scams."
        UrlReason.LOOKALIKE_BRAND -> "This link pretends to be $detail, but it isn't one of $detail's official websites."
        UrlReason.NONE -> "No known risk signs were found."
      }
    }
  }

  object English : Copy()

  object Tagalog : Copy() {
    override val titleDangerous = "Huwag buksan ang link na ito"
    override val titleSuspicious = "Mag-ingat sa link na ito"
    override val badgeDangerous = "MAPANGANIB NA LINK"
    override val badgeSuspicious = "KAHINA-HINALANG LINK"
    override val intro = "Sinuri ng NotiCare ang link na ito bago ito buksan."
    override val website = "Website"
    override val why = "Bakit ito pinigilan ng NotiCare"
    override val advice =
      "Huwag kailanman ilagay ang iyong password, PIN, o OTP sa website na binuksan mo mula sa isang mensahe."
    override val goBack = "Bumalik"
    override val openAnyway = "Buksan pa rin"
    override val confirmTitle = "Buksan pa rin ang link?"
    override val confirmBody =
      "Na-flag ng NotiCare ang link na ito bilang mapanganib. Kapag binuksan mo ito, maaaring manakaw ang iyong account o personal na impormasyon."
    override val confirmCancel = "Kanselahin"
    override val noBrowser = "Walang ibang browser na naka-install para buksan ang link na ito."
    override fun openFailed(browser: String) = "Hindi mabuksan ang link sa $browser."

    override fun reason(result: UrlCheckResult): String {
      val detail = result.detail.orEmpty()
      return when (result.reason) {
        UrlReason.UNREADABLE -> "Hindi mabasa ang link na ito bilang tamang web address."
        UrlReason.KNOWN_DANGEROUS -> "Kasama ang website na ito sa listahan ng NotiCare ng mga kilalang scam site."
        UrlReason.HIDDEN_DESTINATION ->
          "Gumagamit ang link na ito ng simbolong \"@\" para itago kung saan talaga ito pupunta."
        UrlReason.SHORTENER ->
          "Pinaikling link ito ($detail). Nakatago ang totoong pupuntahan nito hangga't hindi mo binubuksan."
        UrlReason.RAW_IP ->
          "Pumupunta ang link na ito sa numerong address ($detail) sa halip na sa isang website na may pangalan."
        UrlReason.UNUSUAL_TLD ->
          "Nagtatapos ang link na ito sa \"$detail\", na bihirang gamitin ng mga totoong website sa Pilipinas at madalas gamitin ng mga scammer."
        UrlReason.LOOKALIKE_BRAND ->
          "Nagpapanggap ang link na ito na $detail, pero hindi ito isa sa mga opisyal na website ng $detail."
        UrlReason.NONE -> "Walang nakitang kilalang babala."
      }
    }
  }
}

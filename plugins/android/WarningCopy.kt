package __NOTICARE_PACKAGE__.bridge

import android.content.Context

/**
 * The words of NotiCare's native warnings (warning screen, notifications, and warning-sign
 * explanations) in the user's chosen message language. Written by hand rather than machine
 * translated, so a safety warning is accurate, instant, and works offline. Tagalog when the user
 * chooses Tagalog; English for Default and English. Reason codes, scores, and stored records are
 * never changed: only the text shown is.
 */
object WarningCopy {
  private const val preferencesName = "noticare_display_language"
  private const val languageKey = "message_language"

  /** Mirrors the app's Settings → Message language ("default", "tl", or "en"). */
  fun setLanguage(context: Context, language: String) {
    context.applicationContext
      .getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
      .edit()
      .putString(languageKey, language)
      .apply()
  }

  // SharedPreferences rather than DataStore: warnings are built synchronously, sometimes on the
  // main thread, and this is one small cached value.
  fun forContext(context: Context): Copy {
    val language = context.applicationContext
      .getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
      .getString(languageKey, "default")
    return if (language == "tl") Tagalog else English
  }

  open class Copy {
    // Warning screen
    open val titleAlreadyBlocked = "Already blocked"
    open val titleDangerous = "Possible phishing message"
    open val titleSuspicious = "Suspicious message"
    open val subtitleReviewSafe =
      "You blocked and reported this message before, so NotiCare hid it again. A fresh check no longer finds significant warning signs."
    open val subtitleReview = "You blocked and reported this message before, so NotiCare hid it again. Here's why it was flagged."
    open val subtitleDangerous = "NotiCare found strong warning signs. Review why before deciding."
    open val subtitleSuspicious = "NotiCare found warning signs that need your attention."
    open val badgeHighRisk = "HIGH RISK"
    open val badgeSafe = "SAFE"
    open val badgeCaution = "CAUTION"
    open val adviceSafe = "Still, never share passwords, PINs, or OTP codes."
    open val adviceRisky = "Do not tap links or share passwords, PINs, or OTP codes."
    open val howScoreCalculated = "How the score was calculated"
    open val highlightedMessage = "Message text that triggered the warning"
    open val noSignificantSigns = "No significant warning signs detected."
    open val total = "Total"
    open val riskScore = "Risk score"
    open fun cappedNote(rawTotal: Int) = "The signs add up to $rawTotal points; the score is capped at 100."
    open val legend = "Safe 0 · Suspicious 1–59 · Dangerous 60–100"
    open fun suspiciousDomains(domains: List<String>) =
      "Suspicious link ${if (domains.size == 1) "domain" else "domains"}: ${domains.joinToString(", ")}"
    open val reviewOnlyNote =
      "Nothing else to do. It isn't reported or counted again, and the original SMS stays in your Messages app."
    open val close = "Close"
    open val actionsExplained =
      "Block & Report hides this notification, saves a protected copy in History, and shares the message text so other NotiCare users can spot it. Ignore leaves the notification visible."
    open val blockAndReport = "Block & Report"
    open val ignoreAndKeepVisible = "Ignore and keep visible"
    open val ignore = "Ignore"

    // Notifications
    open val cautionChannelName = "NotiCare cautions"
    open val cautionChannelDescription = "Warnings about suspicious SMS notifications."
    open val dangerChannelName = "NotiCare danger warnings"
    open val dangerChannelDescription = "High-priority warnings for SMS notifications NotiCare suppressed."
    open val repeatChannelName = "Repeat blocked messages"
    open val repeatChannelDescription = "Lets you know when a message you already blocked arrives again."
    open val cautionTitle = "NotiCare: suspicious SMS"
    open fun cautionBody(score: Int) =
      "A message showed warning signs (risk score $score/100). Do not open links until you verify it."
    open val defaultReasonSummary = "Multiple phishing indicators were detected"
    open fun dangerBody(score: Int, reasonSummary: String) =
      "Risk $score/100: $reasonSummary. Choose Block & Report or Ignore."
    open val blockedAgainTitle = "Blocked message notification"
    open val blockedAgainHidden =
      "Already blocked. You blocked this message before, so NotiCare hid it again. Tap to see why it was flagged."
    open val blockedAgainShown =
      "Already blocked. You blocked this message before, but Android didn't let NotiCare hide it this time. Don't open its links or reply. Tap to see why it was flagged."
    open val historySaved = "The original SMS was not deleted. A protected local copy is available in NotiCare Messages."
    open val historyNotSaved = "The original SMS was not deleted. No protected local message copy was saved."
    open val reportQueued = " Saved to report to other NotiCare users once you're online."
    open fun blockedTitle(dangerous: Boolean) = "NotiCare blocked a ${if (dangerous) "likely smishing" else "suspicious SMS"}"
    open fun blockedBody(dangerous: Boolean, score: Int) =
      "A ${if (dangerous) "likely smishing" else "suspicious SMS"} notification was suppressed (risk score $score/100)."
    open val reportSharedTitle = "Phishing report shared"
    open val reportNew = "Your reported message was new — thanks for helping warn other NotiCare users."
    open fun reportExisting(count: Int) =
      "Your report added to an existing message: $count NotiCare users have now reported it."
    open val quotaTitle = "Free scan limit reached"
    open val quotaBody =
      "You've used this month's 10 free automatic scans. Upgrade to NotiCare Pro for unlimited real-time protection."

    // Warning signs, keyed by their stable code; unknown codes keep the scanner's own text.
    protected open val reasons: Map<String, Pair<String, String>> = emptyMap()

    fun reasonLabel(reason: ThreatReason) = reasons[reason.code]?.first ?: reason.label

    fun reasonDescription(reason: ThreatReason) = reasons[reason.code]?.second ?: reason.description
  }

  object English : Copy()

  object Tagalog : Copy() {
    override val titleAlreadyBlocked = "Na-block mo na ito"
    override val titleDangerous = "Posibleng phishing na mensahe"
    override val titleSuspicious = "Kahina-hinalang mensahe"
    override val subtitleReviewSafe =
      "Na-block at nai-report mo na ang mensaheng ito dati, kaya itinago ulit ito ng NotiCare. Sa bagong pagsusuri, wala nang nakitang malalaking babala."
    override val subtitleReview =
      "Na-block at nai-report mo na ang mensaheng ito dati, kaya itinago ulit ito ng NotiCare. Narito kung bakit ito na-flag."
    override val subtitleDangerous = "May nakitang malalakas na babala ang NotiCare. Tingnan muna ang mga dahilan bago magpasya."
    override val subtitleSuspicious = "May nakitang mga babala ang NotiCare na dapat mong pansinin."
    override val badgeHighRisk = "MATAAS NA PANGANIB"
    override val badgeSafe = "LIGTAS"
    override val badgeCaution = "MAG-INGAT"
    override val adviceSafe = "Gayunpaman, huwag kailanman ibigay ang iyong password, PIN, o OTP code."
    override val adviceRisky = "Huwag pindutin ang mga link o ibigay ang iyong password, PIN, o OTP code."
    override val howScoreCalculated = "Paano nakuha ang score"
    override val highlightedMessage = "Bahagi ng mensaheng nag-trigger ng babala"
    override val noSignificantSigns = "Walang nakitang malalaking babala."
    override val total = "Kabuuan"
    override val riskScore = "Risk score"
    override fun cappedNote(rawTotal: Int) = "Umaabot sa $rawTotal puntos ang mga babala; hanggang 100 lang ang score."
    override val legend = "Ligtas 0 · Kahina-hinala 1–59 · Mapanganib 60–100"
    override fun suspiciousDomains(domains: List<String>) =
      "Kahina-hinalang ${if (domains.size == 1) "domain" else "mga domain"} ng link: ${domains.joinToString(", ")}"
    override val reviewOnlyNote =
      "Wala ka nang kailangang gawin. Hindi na ito ire-report o bibilangin ulit, at nasa Messages app mo pa rin ang orihinal na SMS."
    override val close = "Isara"
    override val actionsExplained =
      "Ang Block & Report ay nagtatago sa notification na ito, nagse-save ng protektadong kopya sa History, at nagbabahagi ng teksto ng mensahe para makilala ito ng ibang gumagamit ng NotiCare. Ang Ignore ay hinahayaang nakikita ang notification."
    override val blockAndReport = "Block & Report"
    override val ignoreAndKeepVisible = "I-ignore at hayaang nakikita"
    override val ignore = "Ignore"

    override val cautionChannelName = "Mga paalala ng NotiCare"
    override val cautionChannelDescription = "Mga babala tungkol sa kahina-hinalang SMS."
    override val dangerChannelName = "Mga babala ng panganib ng NotiCare"
    override val dangerChannelDescription = "Mga mahalagang babala para sa SMS na itinago ng NotiCare."
    override val repeatChannelName = "Mga mensaheng na-block na"
    override val repeatChannelDescription = "Ipinapaalam kapag dumating ulit ang mensaheng na-block mo na."
    override val cautionTitle = "NotiCare: kahina-hinalang SMS"
    override fun cautionBody(score: Int) =
      "May mga babala ang isang mensahe (risk score $score/100). Huwag buksan ang mga link hangga't hindi mo ito nabe-verify."
    override val defaultReasonSummary = "Maraming palatandaan ng phishing ang nakita"
    override fun dangerBody(score: Int, reasonSummary: String) =
      "Panganib $score/100: $reasonSummary. Piliin ang Block & Report o Ignore."
    override val blockedAgainTitle = "Notification ng na-block na mensahe"
    override val blockedAgainHidden =
      "Na-block mo na ito. Na-block mo na ang mensaheng ito dati, kaya itinago ulit ito ng NotiCare. Pindutin para makita kung bakit ito na-flag."
    override val blockedAgainShown =
      "Na-block mo na ito. Na-block mo na ang mensaheng ito dati, pero hindi ito naitago ng NotiCare ngayon dahil sa Android. Huwag buksan ang mga link nito o mag-reply. Pindutin para makita kung bakit ito na-flag."
    override val historySaved =
      "Hindi binura ang orihinal na SMS. May protektadong kopya nito sa NotiCare Messages."
    override val historyNotSaved =
      "Hindi binura ang orihinal na SMS. Walang protektadong kopya ng mensahe ang na-save."
    override val reportQueued = " Naka-save para i-report sa ibang gumagamit ng NotiCare kapag online ka na."
    override fun blockedTitle(dangerous: Boolean) =
      "Na-block ng NotiCare ang ${if (dangerous) "posibleng smishing" else "kahina-hinalang SMS"}"
    override fun blockedBody(dangerous: Boolean, score: Int) =
      "Itinago ang notification ng ${if (dangerous) "posibleng smishing" else "kahina-hinalang SMS"} (risk score $score/100)."
    override val reportSharedTitle = "Naibahagi ang phishing report"
    override val reportNew = "Bago ang mensaheng ni-report mo — salamat sa pagtulong na babalaan ang ibang gumagamit ng NotiCare."
    override fun reportExisting(count: Int) =
      "Nadagdag ang report mo sa isang naunang mensahe: $count gumagamit ng NotiCare na ang nag-report nito."
    override val quotaTitle = "Naubos na ang libreng scan"
    override val quotaBody =
      "Nagamit mo na ang 10 libreng awtomatikong scan ngayong buwan. Mag-upgrade sa NotiCare Pro para sa walang limitasyong real-time na proteksyon."

    override val reasons = mapOf(
      "credential-request" to ("Hinihingi ang lihim na code o impormasyon ng account" to
        "Hinihingi ng mensahe ang iyong OTP, password, PIN, o detalye ng account."),
      "account-warning" to ("Babala tungkol sa account" to
        "Sinasabi ng mensahe na naka-suspend, naka-lock, pansamantalang naka-hold, o kailangang i-verify ang isang account."),
      "urgency-pressure" to ("Pagmamadali" to
        "Pinagmamadali ka ng mensahe na kumilos agad o sa loob ng maikling oras."),
      "link-or-reply-pressure" to ("Pinapapindot ng link o pinapa-reply" to
        "Sinasabi ng mensahe na pindutin o buksan ang isang link, o mag-reply para magpatuloy."),
      "prize-or-reward-bait" to ("Premyo o gantimpala" to
        "Gumagamit ang mensahe ng premyo, gantimpala, o libreng pera para mapakilos ka."),
      "high-value-bonus-offer" to ("Hindi karaniwang malaking bonus" to
        "Nag-aalok ang mensahe ng bonus na hindi bababa sa 100%, isang padron na madalas gamitin sa mga hindi hinihinging promo at alok sa sugal."),
      "bonus-offer-link-combination" to ("Malaking bonus na may link" to
        "May link ang mensahe kasama ng hindi karaniwang malaking bonus; i-verify ang alok bago mag-sign up o magdeposito ng pera."),
      "refund-bait" to ("Refund o cash back" to
        "Nangangako ang mensahe ng refund, reimbursement, o cash back na kailangan mong kunin."),
      "parcel-delivery-bait" to ("Problema sa padala" to
        "Sinasabi ng mensahe na pumalya, naipit, o hindi pa bayad ang isang padala."),
      "unpaid-bill-pressure" to ("Pananakot tungkol sa hindi nabayarang bill" to
        "Nagbabanta ang mensahe ng parusa dahil sa umano'y hindi nabayarang bill."),
      "government-aid-impersonation" to ("Alok na tulong mula sa gobyerno" to
        "Nag-aalok ang mensahe ng ayuda o tulong-pinansyal mula sa gobyerno sa paraang madalas gamitin sa scam."),
      "government-authority-threat" to ("Banta mula sa gobyerno o tagapagpatupad ng batas" to
        "Inaangkin ng mensahe na may awtoridad ang nagpadala at nagbabanta ng pag-aresto, warrant, demanda, o aksyon ng pulisya."),
      "government-benefit-freeze" to ("Banta na i-freeze ang ari-arian o benepisyo" to
        "Nagbabanta ang mensahe na i-freeze o kumpiskahin ang bank account, ari-arian, asset, o benepisyong panlipunan."),
      "government-coercion-combination" to ("Banta ng gobyerno na may parusang pinansyal" to
        "Pinagsasama ng mensahe ang pagbabanta ng awtoridad ng gobyerno o pulisya at banta na i-freeze ang ari-arian o benepisyo."),
      "access-loss-threat" to ("Banta na mawawalan ng access o serbisyo" to
        "Nagbabanta ang mensahe na aalisin ang iyong access o puputulin ang isang serbisyo."),
      "money-transfer-request" to ("Hinihinging magpadala ng pera sa personal na account" to
        "Pinapapadala ka ng pera, gift card, o bayad sa isang personal na account o bagong numero — karaniwang modus ng mga nagpapanggap na kapamilya, boss, o kumpanya."),
      "advance-fee-request" to ("Pinapabayad muna bago makatanggap" to
        "Pinapabayad ka muna ng fee bago mo makuha ang premyo, loan, refund, trabaho, o padala."),
      "direct-threat" to ("Tahasang banta ng pananakit" to
        "Nagbabanta ang mensahe ng pisikal na pananakit o pag-atake nang personal."),
      "cyber-threat" to ("Banta na mang-hack, maglantad, o gumamit ng pribadong impormasyon" to
        "Nagbabanta ang mensahe na pasukin o agawin ang account, ilantad ang pribadong impormasyon, o gamitin ito sa maling paraan."),
      "repeat-sender-escalation" to ("Paulit-ulit na kahina-hinalang nagpadala ng SMS" to
        "Nagpadala ulit ang taong ito ng SMS matapos matukoy dati ang spam o phishing sa Messages app."),
      "obfuscated-text" to ("Nakatago o binagong character" to
        "May nakatagong character o kahawig na letra ang mensahe."),
      "url-ip-address" to ("Link na IP address" to
        "Gumagamit ang link ng numerong IP address sa halip na karaniwang pangalan ng website."),
      "url-shortener" to ("Pinaikling link" to
        "Itinatago ng URL shortener kung saang website talaga papunta ang link."),
      "url-punycode" to ("Punycode na domain" to
        "Gumagamit ang link ng espesyal na encoding na kayang magtago ng kahawig na pangalan."),
      "url-unicode-confusable" to ("Kahawig na domain" to
        "May mga espesyal na character ang domain na puwedeng magmukhang ibang brand."),
      "url-at-sign" to ("Mapanlinlang na @ sa link" to
        "May @ ang link na puwedeng magpamukhang mapagkakatiwalaan ang ibang website."),
      "url-excessive-subdomains" to ("Sobrang daming subdomain" to
        "Maraming patong-patong na subdomain ang link na puwedeng magtago ng tunay nitong pupuntahan."),
      "url-nonstandard-port" to ("Hindi karaniwang port ng link" to
        "Gumagamit ang link ng hindi karaniwang web port."),
      "url-misleading-path" to ("Link para sa sensitibong aksyon" to
        "Tumutukoy ang link sa pag-login, pag-verify, pagbabayad, padala, o premyo."),
      "url-redirect-parameter" to ("Redirect sa link" to
        "May redirect ang link na puwedeng magtago ng huling website na pupuntahan nito."),
      "url-obfuscated" to ("Itinagong link" to
        "Binago ang pagkakasulat ng link, gaya ng protocol, espasyo, o tuldok."),
      "url-with-sensitive-request" to ("Sensitibong hiling na may kasamang link" to
        "May sensitibong hiling, premyo, hindi karaniwang malaking bonus, o problema sa padala na may kasamang link."),
      "brand-with-unrelated-url" to ("Brand na may kasamang ibang link" to
        "Binanggit ang isang bangko, e-wallet, o ahensya ng gobyerno, pero hindi sa opisyal nilang website ang link."),
      "credential-link-combination" to ("Hinihingi ang lihim na code kasama ang link" to
        "Hinihingi ang lihim na code o impormasyon ng account at may kasamang link."),
      "account-link-combination" to ("Babala sa account na may link" to
        "May babala tungkol sa account na may kasamang link."),
      "link-pressure-combination" to ("Pinipilit gamitin ang link" to
        "Tahasang pinipilit ka ng mensahe na gamitin ang isang link."),
      "bait-link-combination" to ("Pain ng scam na may link" to
        "May premyo, refund, padala, bill, o ayuda na may kasamang link."),
      "credential-urgency-combination" to ("Hinihingi ang lihim na code nang minamadali" to
        "Humihingi ang mensahe ng sensitibong impormasyon habang minamadali ka."),
      "account-urgency-combination" to ("Madaliang babala sa account" to
        "May babala tungkol sa account na may kasamang madaliang deadline."),
      "v3-model-risk" to ("AI check" to
        "Nakakita ang on-device classifier ng mga salitang karaniwang kaugnay ng phishing o scam, pero hindi nito natukoy ang isang tiyak na palatandaan. Pattern match ito ng AI, hindi kumpirmasyon."),
    )
  }
}

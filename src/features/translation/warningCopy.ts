import type { ThreatLevel } from '@/src/features/detection';

import type { MessageLanguage } from './messageTranslation';

type Reason = { code: string; label: string; description: string };

/**
 * The words of NotiCare's scan results in the app (Manual Scan's result card, the score breakdown,
 * and an opened message's warning signs): Tagalog when the user chooses Tagalog, English for
 * Default and English. Hand-written, like the native warnings in plugins/android/WarningCopy.kt,
 * whose Tagalog warning-sign text this matches word for word (a test checks it).
 */
export type WarningCopy = {
  levels: Record<ThreatLevel, { title: string; explanation: string; action: string }>;
  riskScoreLine: (score: number) => string;
  reportBadge: (count: number) => string;
  safeScoreExplanation: string;
  suspiciousScoreExplanation: (score: number) => string;
  dangerousScoreExplanation: (score: number) => string;
  checkingReports: string;
  reportedBy: (count: number) => string;
  notReportedYet: string;
  howScoreCalculated: string;
  linksFound: string;
  recommendedAction: string;
  scannedAt: (time: string, ruleVersion: string) => string;
  alreadyMarkedSafe: string;
  alreadyReported: string;
  done: string;
  savedOnDeviceOnly: string;
  reportedAndShared: string;
  markedSafeNotUploaded: string;
  markAsSafe: string;
  savingReport: string;
  report: string;
  reporting: string;
  noMeaningfulSigns: string;
  total: string;
  riskScore: string;
  cappedNote: (rawTotal: number) => string;
  bands: Record<ThreatLevel, string>;
  bandsAccessibility: (level: ThreatLevel) => string;
  pointsAccessibility: (points: number) => string;
  warningSigns: string;
  noSignificantSigns: string;
  reasons: Record<string, readonly [label: string, description: string]>;
};

export const ENGLISH_WARNING_COPY: WarningCopy = {
  levels: {
    safe: {
      title: 'Safe',
      explanation:
        'No significant phishing indicators were found. Stay cautious — NotiCare cannot guarantee every scam is detected.',
      action:
        'If a message asks for money or personal information later, verify it through the organization’s official app or website.',
    },
    suspicious: {
      title: 'Suspicious',
      explanation: 'This message has warning signs but not enough evidence to call it a likely scam.',
      action:
        'Do not tap links or reply with personal information. Verify the sender through an official channel first.',
    },
    dangerous: {
      title: 'Dangerous',
      explanation: 'Several strong phishing indicators were found together. Treat this message as dangerous.',
      action:
        'Do not open links or share passwords, PINs, or OTPs. Contact the organization using its official app, website, or verified number.',
    },
  },
  riskScoreLine: (score) => `${score}/100 risk score`,
  reportBadge: (count) => (count === 1 ? '1 report' : `${count} reports`),
  safeScoreExplanation: 'Safe messages always have a risk score of 0. No strong warning signs were found.',
  suspiciousScoreExplanation: (score) =>
    `Scores from 30 to 69 are Suspicious. ${score}/100 means some warning signs were found, but not enough to call this a confirmed scam.`,
  dangerousScoreExplanation: (score) =>
    `Scores of 70 and above are Dangerous. ${score}/100 means strong phishing signs were found.`,
  checkingReports: 'Checking whether other NotiCare users reported this exact message…',
  reportedBy: (count) =>
    `${count === 1 ? '1 NotiCare user has' : `${count} NotiCare users have`} reported this exact message.`,
  notReportedYet: 'No one has reported this exact message yet. Tap Report to warn other NotiCare users.',
  howScoreCalculated: 'How the score was calculated',
  linksFound: 'Links found',
  recommendedAction: 'Recommended action',
  scannedAt: (time, ruleVersion) => `Scanned ${time} · Rule set ${ruleVersion}`,
  alreadyMarkedSafe: 'You already marked this exact message as safe.',
  alreadyReported: 'You already reported this exact message.',
  done: 'Done',
  savedOnDeviceOnly: 'Saved on this device only — it was not submitted to NotiCare’s servers.',
  reportedAndShared: 'Reported. This exact message text was shared so other NotiCare users can be warned.',
  markedSafeNotUploaded: 'Report sent. Your message text was not uploaded.',
  markAsSafe: 'Mark as safe',
  savingReport: 'Saving report…',
  report: 'Report',
  reporting: 'Reporting…',
  noMeaningfulSigns: 'No meaningful warning signs were found.',
  total: 'Total',
  riskScore: 'Risk score',
  cappedNote: (rawTotal) => `The signs add up to ${rawTotal} points; the score is capped at 100.`,
  bands: { safe: 'Safe', suspicious: 'Suspicious', dangerous: 'Dangerous' },
  bandsAccessibility: (level) =>
    `Score bands: Safe 0, Suspicious 30 to 69, Dangerous 70 to 100. This message is ${level}.`,
  pointsAccessibility: (points) => `${points} points`,
  warningSigns: 'WARNING SIGNS',
  noSignificantSigns: 'No significant warning signs detected.',
  // English keeps each sign's own label and description from the scanner.
  reasons: {},
};

const TAGALOG_LEVELS: Record<ThreatLevel, string> = {
  safe: 'ligtas',
  suspicious: 'kahina-hinala',
  dangerous: 'mapanganib',
};

export const TAGALOG_WARNING_COPY: WarningCopy = {
  levels: {
    safe: {
      title: 'Ligtas',
      explanation:
        'Walang nakitang malalaking palatandaan ng phishing. Mag-ingat pa rin — hindi kayang tiyakin ng NotiCare na mahuhuli ang bawat scam.',
      action:
        'Kung may mensaheng humingi ng pera o personal na impormasyon sa susunod, i-verify ito sa opisyal na app o website ng organisasyon.',
    },
    suspicious: {
      title: 'Kahina-hinala',
      explanation: 'May mga babala ang mensaheng ito pero kulang pa ang ebidensya para tawagin itong scam.',
      action:
        'Huwag pindutin ang mga link o mag-reply ng personal na impormasyon. I-verify muna ang nagpadala sa opisyal na paraan.',
    },
    dangerous: {
      title: 'Mapanganib',
      explanation:
        'Maraming malalakas na palatandaan ng phishing ang sabay-sabay na nakita. Ituring na mapanganib ang mensaheng ito.',
      action:
        'Huwag buksan ang mga link o ibigay ang iyong password, PIN, o OTP. Makipag-ugnayan sa organisasyon gamit ang opisyal nilang app, website, o beripikadong numero.',
    },
  },
  riskScoreLine: (score) => `${score}/100 risk score`,
  reportBadge: (count) => `${count} report`,
  safeScoreExplanation: 'Laging 0 ang risk score ng ligtas na mensahe. Walang nakitang malalakas na babala.',
  suspiciousScoreExplanation: (score) =>
    `Kahina-hinala ang score na 30 hanggang 69. Ang ${score}/100 ay nangangahulugang may nakitang mga babala, pero hindi sapat para tawagin itong tiyak na scam.`,
  dangerousScoreExplanation: (score) =>
    `Mapanganib ang score na 70 pataas. Ang ${score}/100 ay nangangahulugang may nakitang malalakas na palatandaan ng phishing.`,
  checkingReports: 'Tinitingnan kung may ibang gumagamit ng NotiCare na nag-report ng mismong mensaheng ito…',
  reportedBy: (count) => `${count} gumagamit ng NotiCare ang nag-report ng mismong mensaheng ito.`,
  notReportedYet:
    'Wala pang nag-report ng mismong mensaheng ito. Pindutin ang Report para babalaan ang ibang gumagamit ng NotiCare.',
  howScoreCalculated: 'Paano nakuha ang score',
  linksFound: 'Mga link na nakita',
  recommendedAction: 'Inirerekomendang gawin',
  scannedAt: (time, ruleVersion) => `Na-scan ${time} · Rule set ${ruleVersion}`,
  alreadyMarkedSafe: 'Minarkahan mo nang ligtas ang mismong mensaheng ito.',
  alreadyReported: 'Nai-report mo na ang mismong mensaheng ito.',
  done: 'Tapos na',
  savedOnDeviceOnly: 'Sa phone na ito lang naka-save — hindi ito ipinadala sa mga server ng NotiCare.',
  reportedAndShared:
    'Nai-report na. Naibahagi ang mismong teksto ng mensaheng ito para mababalaan ang ibang gumagamit ng NotiCare.',
  markedSafeNotUploaded: 'Naipadala ang report. Hindi in-upload ang teksto ng iyong mensahe.',
  markAsSafe: 'Markahang ligtas',
  savingReport: 'Sine-save ang report…',
  report: 'Report',
  reporting: 'Nire-report…',
  noMeaningfulSigns: 'Walang nakitang mahalagang babala.',
  total: 'Kabuuan',
  riskScore: 'Risk score',
  cappedNote: (rawTotal) => `Umaabot sa ${rawTotal} puntos ang mga babala; hanggang 100 lang ang score.`,
  bands: { safe: 'Ligtas', suspicious: 'Kahina-hinala', dangerous: 'Mapanganib' },
  bandsAccessibility: (level) =>
    `Mga antas ng score: Ligtas 0, Kahina-hinala 30 hanggang 69, Mapanganib 70 hanggang 100. Ang mensaheng ito ay ${TAGALOG_LEVELS[level]}.`,
  pointsAccessibility: (points) => `${points} puntos`,
  warningSigns: 'MGA BABALA',
  noSignificantSigns: 'Walang nakitang malalaking babala.',
  reasons: {
    'credential-request': [
      'Hinihingi ang lihim na code o impormasyon ng account',
      'Hinihingi ng mensahe ang iyong OTP, password, PIN, o detalye ng account.',
    ],
    'account-warning': [
      'Babala tungkol sa account',
      'Sinasabi ng mensahe na naka-suspend, naka-lock, o kailangang i-verify ang isang account.',
    ],
    'urgency-pressure': ['Pagmamadali', 'Pinagmamadali ka ng mensahe na kumilos agad o sa loob ng maikling oras.'],
    'link-or-reply-pressure': [
      'Pinapapindot ng link o pinapa-reply',
      'Sinasabi ng mensahe na pindutin o buksan ang isang link, o mag-reply para magpatuloy.',
    ],
    'prize-or-reward-bait': [
      'Premyo o gantimpala',
      'Gumagamit ang mensahe ng premyo, gantimpala, o libreng pera para mapakilos ka.',
    ],
    'refund-bait': [
      'Refund o cash back',
      'Nangangako ang mensahe ng refund, reimbursement, o cash back na kailangan mong kunin.',
    ],
    'parcel-delivery-bait': [
      'Problema sa padala',
      'Sinasabi ng mensahe na pumalya, naipit, o hindi pa bayad ang isang padala.',
    ],
    'unpaid-bill-pressure': [
      'Pananakot tungkol sa hindi nabayarang bill',
      "Nagbabanta ang mensahe ng parusa dahil sa umano'y hindi nabayarang bill.",
    ],
    'government-aid-impersonation': [
      'Alok na tulong mula sa gobyerno',
      'Nag-aalok ang mensahe ng ayuda o tulong-pinansyal mula sa gobyerno sa paraang madalas gamitin sa scam.',
    ],
    'access-loss-threat': [
      'Banta na mawawalan ng access o serbisyo',
      'Nagbabanta ang mensahe na aalisin ang iyong access o puputulin ang isang serbisyo.',
    ],
    'money-transfer-request': [
      'Hinihinging magpadala ng pera sa personal na account',
      'Pinapapadala ka ng pera, gift card, o bayad sa isang personal na account o bagong numero — karaniwang modus ng mga nagpapanggap na kapamilya, boss, o kumpanya.',
    ],
    'advance-fee-request': [
      'Pinapabayad muna bago makatanggap',
      'Pinapabayad ka muna ng fee bago mo makuha ang premyo, loan, refund, trabaho, o padala.',
    ],
    'abusive-language': [
      'Mura o mapanakit na pananalita',
      'May nakilalang mura sa Ingles o Filipino; maaaring mag-iba ang kahulugan depende sa konteksto.',
    ],
    'direct-threat': [
      'Tahasang banta ng pananakit',
      'Nagbabanta ang mensahe ng pisikal na pananakit o pag-atake nang personal.',
    ],
    'cyber-threat': [
      'Banta na mang-hack, maglantad, o gumamit ng pribadong impormasyon',
      'Nagbabanta ang mensahe na pasukin o agawin ang account, ilantad ang pribadong impormasyon, o gamitin ito sa maling paraan.',
    ],
    'repeat-sender-escalation': [
      'Paulit-ulit na kahina-hinalang nagpadala ng SMS',
      'Nagpadala ulit ang taong ito ng SMS matapos matukoy dati ang spam o phishing sa Messages app.',
    ],
    'obfuscated-text': ['Itinagong teksto', 'May nakatagong character o kahawig na letra ang mensahe.'],
    'url-ip-address': [
      'Link na IP address',
      'Gumagamit ang link ng numerong IP address sa halip na karaniwang pangalan ng website.',
    ],
    'url-shortener': ['Pinaikling link', 'Itinatago ng URL shortener kung saang website talaga papunta ang link.'],
    'url-punycode': [
      'Punycode na domain',
      'Gumagamit ang link ng espesyal na encoding na kayang magtago ng kahawig na pangalan.',
    ],
    'url-unicode-confusable': [
      'Kahawig na domain',
      'May mga espesyal na character ang domain na puwedeng magmukhang ibang brand.',
    ],
    'url-at-sign': [
      'Mapanlinlang na @ sa link',
      'May @ ang link na puwedeng magpamukhang mapagkakatiwalaan ang ibang website.',
    ],
    'url-excessive-subdomains': [
      'Sobrang daming subdomain',
      'Maraming patong-patong na subdomain ang link na puwedeng magtago ng tunay nitong pupuntahan.',
    ],
    'url-nonstandard-port': ['Hindi karaniwang port ng link', 'Gumagamit ang link ng hindi karaniwang web port.'],
    'url-misleading-path': [
      'Link para sa sensitibong aksyon',
      'Tumutukoy ang link sa pag-login, pag-verify, pagbabayad, padala, o premyo.',
    ],
    'url-redirect-parameter': [
      'Redirect sa link',
      'May redirect ang link na puwedeng magtago ng huling website na pupuntahan nito.',
    ],
    'url-obfuscated': ['Itinagong link', 'Binago ang pagkakasulat ng link, gaya ng protocol, espasyo, o tuldok.'],
    'url-with-sensitive-request': [
      'Sensitibong hiling na may kasamang link',
      'May hiling tungkol sa account, bayad, premyo, o padala na may kasamang link.',
    ],
    'brand-with-unrelated-url': [
      'Brand na may kasamang ibang link',
      'Binanggit ang isang bangko, e-wallet, o ahensya ng gobyerno, pero hindi sa opisyal nilang website ang link.',
    ],
    'credential-link-combination': [
      'Hinihingi ang lihim na code kasama ang link',
      'Hinihingi ang lihim na code o impormasyon ng account at may kasamang link.',
    ],
    'account-link-combination': [
      'Babala sa account na may link',
      'May babala tungkol sa account na may kasamang link.',
    ],
    'link-pressure-combination': [
      'Pinipilit gamitin ang link',
      'Tahasang pinipilit ka ng mensahe na gamitin ang isang link.',
    ],
    'bait-link-combination': [
      'Pain ng scam na may link',
      'May premyo, refund, padala, bill, o ayuda na may kasamang link.',
    ],
    'credential-urgency-combination': [
      'Hinihingi ang lihim na code nang minamadali',
      'Humihingi ang mensahe ng sensitibong impormasyon habang minamadali ka.',
    ],
    'account-urgency-combination': [
      'Madaliang babala sa account',
      'May babala tungkol sa account na may kasamang madaliang deadline.',
    ],
    'v3-model-risk': [
      'AI check',
      'Sang-ayon ang built-in na AI ng NotiCare na mukhang scam ang mga babala sa itaas. Nagdadagdag lang ito ng puntos kapag may totoong babala.',
    ],
  },
};

/** Tagalog for Tagalog; English for Default and English. */
export function warningCopyFor(language: MessageLanguage): WarningCopy {
  return language === 'tl' ? TAGALOG_WARNING_COPY : ENGLISH_WARNING_COPY;
}

/** A warning sign's label and description in the copy's language; unknown codes keep the scanner's text. */
export function localizeReason<T extends Reason>(reason: T, copy: WarningCopy): T {
  const translated = copy.reasons[reason.code];
  return translated ? { ...reason, label: translated[0], description: translated[1] } : reason;
}

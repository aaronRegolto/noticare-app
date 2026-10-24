export type MessageCategory = 'spam' | 'threats' | 'phishing';

const spamCodes = new Set([
  'v3-model-risk',
  'repeat-sender-escalation',
  'prize-or-reward-bait',
  'refund-bait',
  'parcel-delivery-bait',
  'unpaid-bill-pressure',
  'urgency-pressure',
  'link-or-reply-pressure',
  'government-aid-impersonation',
  'money-transfer-request',
  'advance-fee-request',
]);

const threatCodes = new Set(['abusive-language', 'direct-threat', 'cyber-threat']);

const phishingCodes = new Set([
  'credential-request',
  'account-warning',
  'access-loss-threat',
  'money-transfer-request',
  'advance-fee-request',
  'credential-link-combination',
  'account-link-combination',
  'bait-link-combination',
  'link-pressure-combination',
  'credential-urgency-combination',
  'account-urgency-combination',
  'brand-with-unrelated-url',
  'url-with-sensitive-request',
  'url-ip-address',
  'url-shortener',
  'url-punycode',
  'url-unicode-confusable',
  'url-at-sign',
  'url-excessive-subdomains',
  'url-nonstandard-port',
  'url-misleading-path',
  'url-redirect-parameter',
  'url-obfuscated',
]);

export function categoriesForCodes(codes: readonly string[]): MessageCategory[] {
  const found = new Set(codes);
  const categories: MessageCategory[] = [];
  if ([...found].some((code) => spamCodes.has(code))) categories.push('spam');
  if ([...found].some((code) => threatCodes.has(code))) categories.push('threats');
  if ([...found].some((code) => phishingCodes.has(code))) categories.push('phishing');
  return categories;
}

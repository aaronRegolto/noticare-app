import { DETECTION_RULE_BUNDLE } from './rules';
import type { UrlEvidence } from './types';

const DIRECT_URL_PATTERN =
  /(?:https?:\/\/|hxxps?:\/\/|www\.)[^\s<>"'`]+|(?:(?:\d{1,3}\.){3}\d{1,3}|(?:[A-Za-z0-9\u00C0-\uFFFF-]+\.)+(?:xn--[A-Za-z0-9-]{2,59}|[A-Za-z\u00C0-\uFFFF]{2,63}))(?::\d{2,5})?(?:\/[^\s<>"'`]*)?/giu;
const SPACED_PROTOCOL_PATTERN =
  /\b(?:h(?:tt|xx)ps?)\s*:\s*\/\s*\/\s*(?:[A-Za-z0-9-]+\s*(?:\.|\[\.\]|\(\.\))\s*)+(?:[A-Za-z]{2,63})(?:\s*\/\s*[^\s<>"'`]*)?/giu;
const SPACED_DOMAIN_PATTERN = /\b(?:[A-Za-z0-9-]+\s*(?:\[\.\]|\(\.\)|\s+\.\s+)\s*)+(?:[A-Za-z]{2,63})\b/giu;
const TRAILING_PUNCTUATION = /[\],.!?;:'">}]+$/u;
const MISLEADING_PATH_PATTERN =
  /\/(?:[^/?#]+\/)*(?:login|log-in|verify|verification|secure|security|payment|pay|prize|reward|parcel|delivery|account|wallet)(?:[/?#]|$)/i;
const REDIRECT_PARAMETER_PATTERN = /(?:^|[?&])(?:url|redirect|target|next|continue|dest|destination|return)=/i;

type Candidate = {
  display: string;
  canonical: string;
  obfuscated: boolean;
  start: number;
  end: number;
};

/**
 * Extracts links locally. It deliberately does not fetch, preview, resolve, or open any
 * candidate; URL() is used purely as an offline string parser.
 */
export function extractUrlEvidence(text: string): UrlEvidence[] {
  const candidates = [
    ...collectDirectCandidates(text),
    ...collectSpacedCandidates(text, SPACED_PROTOCOL_PATTERN),
    ...collectSpacedCandidates(text, SPACED_DOMAIN_PATTERN),
  ].sort((left, right) => left.start - right.start || right.end - right.start - (left.end - left.start));

  const seen = new Set<string>();
  const acceptedRanges: { start: number; end: number }[] = [];
  const urls: UrlEvidence[] = [];
  for (const candidate of candidates) {
    // A spaced-domain expression can also match inside a longer spaced-protocol URL.
    // Prefer the outer candidate so a single visible link is not reported twice.
    if (acceptedRanges.some((range) => candidate.start >= range.start && candidate.start < range.end)) continue;
    const evidence = parseCandidate(candidate);
    if (!evidence) continue;

    const identity = `${evidence.host ?? ''}|${evidence.path}|${evidence.query}`.toLowerCase();
    if (seen.has(identity)) continue;
    seen.add(identity);
    acceptedRanges.push({ start: candidate.start, end: candidate.end });
    urls.push(evidence);
  }

  return urls.slice(0, 12);
}

function collectDirectCandidates(text: string): Candidate[] {
  const candidates: Candidate[] = [];
  for (const match of text.matchAll(DIRECT_URL_PATTERN)) {
    const value = match[0];
    const start = match.index ?? 0;
    const preceding = start > 0 ? text[start - 1] : '';
    // Do not turn the domain portion of an email address into a URL.
    if (preceding === '@' || /[A-Za-z0-9_.-]/.test(preceding)) continue;

    const display = trimUrlPunctuation(value);
    if (!display) continue;
    candidates.push({
      display,
      canonical: display.replace(/^hxxp/i, 'http'),
      obfuscated: /^hxxp/i.test(display),
      start,
      end: start + value.length,
    });
  }
  return candidates;
}

function collectSpacedCandidates(text: string, pattern: RegExp): Candidate[] {
  const candidates: Candidate[] = [];
  for (const match of text.matchAll(pattern)) {
    const display = trimUrlPunctuation(match[0]);
    if (!display) continue;
    const canonical = display
      .replace(/hxxp/gi, 'http')
      .replace(/\[\.\]|\(\.\)/g, '.')
      .replace(/\s+/g, '');
    if (!looksLikeDomainOrIp(canonical)) continue;
    candidates.push({
      display,
      canonical,
      obfuscated: true,
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    });
  }
  return candidates;
}

function trimUrlPunctuation(value: string): string {
  return value.replace(TRAILING_PUNCTUATION, '');
}

function parseCandidate(candidate: Candidate): UrlEvidence | null {
  const valueWithProtocol = /^(?:https?:\/\/)/i.test(candidate.canonical)
    ? candidate.canonical
    : `http://${candidate.canonical}`;

  let parsed: URL;
  try {
    parsed = new URL(valueWithProtocol);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || !isValidHost(host)) return null;

  const indicators = new Set<string>();
  const displayHost = readVisibleHost(candidate.canonical);
  if (isIpv4Address(host)) indicators.add('url-ip-address');
  if (isShortener(host)) indicators.add('url-shortener');
  if (host.includes('xn--')) indicators.add('url-punycode');
  if (/[^\u0000-\u007F]/.test(displayHost)) indicators.add('url-unicode-confusable');
  if (candidate.canonical.includes('@')) indicators.add('url-at-sign');
  if (!isIpv4Address(host) && host.split('.').length >= 5) indicators.add('url-excessive-subdomains');
  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') indicators.add('url-nonstandard-port');
  if (MISLEADING_PATH_PATTERN.test(parsed.pathname)) indicators.add('url-misleading-path');
  if (REDIRECT_PARAMETER_PATTERN.test(parsed.search)) indicators.add('url-redirect-parameter');
  if (candidate.obfuscated) indicators.add('url-obfuscated');

  return {
    display: candidate.display,
    normalizedDomain: host,
    indicators: [...indicators],
    host,
    path: parsed.pathname,
    query: parsed.search,
  };
}

function readVisibleHost(candidate: string): string {
  const withoutProtocol = candidate.replace(/^(?:https?:\/\/)/i, '');
  return (
    withoutProtocol
      .split(/[/?#:]/, 1)[0]
      .split('@')
      .at(-1) ?? ''
  );
}

function looksLikeDomainOrIp(value: string): boolean {
  const withoutProtocol = value.replace(/^(?:https?:\/\/)/i, '');
  const host = withoutProtocol.split(/[/?#:]/, 1)[0];
  return Boolean(host && (isIpv4Address(host) || /(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,63}$/i.test(host)));
}

function isValidHost(host: string): boolean {
  if (isIpv4Address(host)) return true;
  if (/^\d+(?:\.\d+){3}$/.test(host)) return false;
  return host.includes('.') && !host.startsWith('.') && !host.endsWith('.');
}

function isIpv4Address(host: string): boolean {
  const parts = host.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function isShortener(host: string): boolean {
  return DETECTION_RULE_BUNDLE.shortenerDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

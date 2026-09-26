export const PHILIPPINES_COUNTRY_CODE = '+63';

export type PhoneCountry = {
  id: 'ph' | 'us';
  name: string;
  flag: string;
  dialCode: string;
  placeholder: string;
};

export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  { id: 'ph', name: 'Philippines', flag: '🇵🇭', dialCode: '+63', placeholder: '917 123 4567' },
  { id: 'us', name: 'United States', flag: '🇺🇸', dialCode: '+1', placeholder: '201 555 0123' },
];

export function formatPhoneNumber(dialCode: string, localNumber: string) {
  const digits = localNumber.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return `${dialCode}${digits}`;
}

/** E.164 validation. Philippine numbers also receive a local mobile-prefix check. */
export function isValidPhoneNumber(value: string, country: PhoneCountry) {
  if (!/^\+[1-9]\d{7,14}$/.test(value)) return false;
  return country.id !== 'ph' || /^\+639\d{9}$/.test(value);
}

export function formatPhilippinePhoneNumber(input: string) {
  return formatPhoneNumber(PHILIPPINES_COUNTRY_CODE, input);
}

export function isValidPhilippinePhoneNumber(value: string) {
  return /^\+639\d{9}$/.test(value);
}

export function countryFromPhone(value: string): PhoneCountry {
  return PHONE_COUNTRIES.find((country) => value.startsWith(country.dialCode)) ?? PHONE_COUNTRIES[0];
}

export function localPartForCountry(value: string, country: PhoneCountry) {
  return value.startsWith(country.dialCode) ? value.slice(country.dialCode.length) : value.replace(/^\+/, '');
}

// Best-effort mapping of a PH mobile number's 3-digit prefix (the digits right after +639) to the
// network that originally issued it. The Philippines has had mobile number portability since 2021,
// so a ported number can display the wrong network here — this is a hint for display only, never
// used for anything security- or billing-relevant. Smart and TNT share the same underlying PLDT/Smart
// network and their prefix ranges overlap, so they're reported together rather than guessed apart.
const GLOBE_PREFIXES = new Set([
  '817', '904', '905', '906', '915', '916', '917', '926', '927', '935', '936', '937', '945', '953',
  '954', '955', '956', '965', '966', '967', '975', '976', '977', '978', '994', '997',
]);
const SMART_TNT_PREFIXES = new Set([
  '813', '907', '908', '909', '910', '912', '913', '914', '918', '919', '920', '921', '928', '929',
  '930', '931', '932', '933', '938', '939', '940', '946', '947', '948', '949', '950', '951', '961',
  '963', '968', '969', '970', '981', '982', '983', '984', '985', '986', '987', '988', '989', '992',
  '998', '999',
]);
// DITO's allocated prefixes aren't included here — unlike the long-established
// Globe and Smart/TNT ranges above, current DITO prefix data couldn't be
// verified with confidence, so a DITO number simply shows no carrier badge
// rather than risk displaying the wrong one.

/** Returns a best-effort PH network label ("Globe" or "Smart/TNT") for a +639 number, or null. */
export function detectPhilippineCarrier(value: string): string | null {
  const match = /^\+639(\d{2})\d{7}$/.exec(value);
  if (!match) return null;
  const prefix = `9${match[1]}`;
  if (GLOBE_PREFIXES.has(prefix)) return 'Globe';
  if (SMART_TNT_PREFIXES.has(prefix)) return 'Smart/TNT';
  return null;
}

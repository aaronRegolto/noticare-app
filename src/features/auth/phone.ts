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

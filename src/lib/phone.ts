// Phone numbers are the account identity. Without SMS verification, each
// account is a Supabase email+password user whose (never-emailed) address is
// derived from the phone number, and whose password is the person's PIN.

/** "0803 123 4567" + "234" → digits "2348031234567", or null if it doesn't look like a phone number. */
export function normalizePhone(countryCode: string, local: string) {
  let digits = local.replace(/\D/g, "");
  if (digits.startsWith(countryCode) && digits.length > 10) digits = digits.slice(countryCode.length);
  digits = digits.replace(/^0+/, "");
  if (digits.length < 7 || digits.length > 12) return null;
  return `${countryCode}${digits}`;
}

/** Internal login address for a phone number. Nothing is ever sent to it. */
export function phoneLoginEmail(phoneDigits: string) {
  return `p${phoneDigits}@phone.spendbox.app`;
}

export const PIN_LENGTH = 6;

export function isValidPin(pin: string) {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

/** Country codes offered next to phone fields. */
export const COUNTRIES = [
  { code: "234", name: "Nigeria", label: "NG +234" },
  { code: "233", name: "Ghana", label: "GH +233" },
  { code: "254", name: "Kenya", label: "KE +254" },
  { code: "27", name: "South Africa", label: "ZA +27" },
  { code: "256", name: "Uganda", label: "UG +256" },
  { code: "250", name: "Rwanda", label: "RW +250" },
  { code: "237", name: "Cameroon", label: "CM +237" },
  { code: "225", name: "Côte d'Ivoire", label: "CI +225" },
  { code: "44", name: "United Kingdom", label: "UK +44" },
  { code: "1", name: "United States Canada", label: "US +1" },
];

/**
 * A WhatsApp number as international digits ("2347031234567"), however it was
 * typed: "0703 123 4567", "703 123 4567", "+234 703…", "234703…". Numbers
 * starting with "+" keep their own country code. Null if it isn't a number.
 */
export function normalizeWhatsapp(raw: string | null | undefined, defaultCountry: string) {
  const text = (raw ?? "").trim();
  if (!text) return null;
  if (text.startsWith("+")) {
    const digits = text.replace(/\D/g, "");
    const country = COUNTRIES.map((c) => c.code).sort((a, b) => b.length - a.length).find((c) => digits.startsWith(c));
    return country ? normalizePhone(country, digits.slice(country.length)) : digits.length >= 8 && digits.length <= 15 ? digits : null;
  }
  return normalizePhone(defaultCountry, text);
}

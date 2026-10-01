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

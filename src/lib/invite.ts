/**
 * A customer's "Invite more plugs" link is /plug?by=CODE. The code is kept in
 * this cookie while the business looks around and signs up, so the customer
 * can be added to its customers once the business is created.
 */
export const INVITED_BY_COOKIE = "sb_invited_by";

/** Codes look like ref codes: 7 lowercase letters and digits. */
export function cleanInviteCode(code: unknown): string | null {
  return typeof code === "string" && /^[a-z0-9]{4,16}$/i.test(code.trim()) ? code.trim().toLowerCase() : null;
}

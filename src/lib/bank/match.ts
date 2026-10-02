// Works out who sent a payment that arrived in a business's bank account.
// Pure functions (no database), so they are easy to test: see match.test.ts.

// Words in bank narrations that are never part of a person's name.
const NOISE = new Set([
  "NIP", "NIPS", "TRF", "TRSF", "TRANSFER", "TRANS", "TRFR", "FROM", "FRM", "TO", "BY", "VIA", "FOR", "REF", "CR", "CREDIT",
  "DR", "DEBIT", "MOB", "MOBILE", "APP", "WEB", "USSD", "POS", "INWARD", "OUTWARD", "INTERBANK", "INTRA", "INTER",
  "PAYMENT", "PYMT", "PAY", "FT", "FIP", "NEFT", "ONLINE", "INSTANT", "FUNDS", "FUND", "NG", "NGN", "NAIRA", "LAG",
  "LAGOS", "ABJ", "ABUJA", "BANK", "BNK", "MFB", "PLC", "LTD", "LIMITED", "ACCOUNT", "ACCT", "AC", "A/C", "NUBAN",
  "GTB", "GTBANK", "GT", "ZENITH", "ZIB", "ACCESS", "ACC", "UBA", "FBN", "FIRSTBANK", "FIRST", "FCMB", "FIDELITY",
  "FID", "STANBIC", "IBTC", "STERLING", "UNION", "WEMA", "ALAT", "ECOBANK", "ECO", "POLARIS", "KEYSTONE", "HERITAGE",
  "JAIZ", "PROVIDUS", "TITAN", "GLOBUS", "OPAY", "PALMPAY", "MONIEPOINT", "MONIE", "KUDA", "CARBON", "VFD", "PAGA",
  "MONO", "PAYSTACK", "FLUTTERWAVE", "FLW", "SMARTCASH", "MOMO", "AIRTEL", "MTN", "CHAMS", "PAYCOM", "RUBIES",
  "SPARKLE", "UNITY", "SUNTRUST", "OPTIMUS", "PREMIUM", "LOTUS", "TAJ", "COMMERCIAL", "SAVINGS", "CURRENT",
  "NARRATION", "REMARK", "SESSION", "ID", "TXN", "TRX", "TRAN", "TRN", "CHARGES", "FEE", "VAT", "STAMP", "DUTY",
]);

// Titles dropped from names before comparing.
const TITLES = new Set(["MR", "MRS", "MS", "MISS", "DR", "CHIEF", "ENGR", "PROF", "PASTOR", "ALHAJI", "ALHAJA", "HON", "SIR"]);

function words(value: string) {
  return value
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z\s'-]/g, " ")
    .replace(/['-]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

/** Name words without titles or single-letter initials, e.g. "MR ADEBAYO T. TOLU" → ["ADEBAYO","TOLU"]. */
export function nameWords(name: string | null | undefined) {
  if (!name) return [];
  return words(name).filter((w) => w.length > 1 && !TITLES.has(w));
}

/** Same sender, however the bank orders or shortens the name: "TOLU ADEBAYO G" and "Adebayo Tolu" → "ADEBAYO TOLU". */
export function senderKey(name: string | null | undefined) {
  const w = [...new Set(nameWords(name).filter((x) => !NOISE.has(x)))].sort();
  return w.length >= 2 ? w.join(" ") : null;
}

function looksLikeName(segment: string) {
  const w = words(segment);
  if (w.length < 2 || w.length > 6) return false;
  // Digits or noise words inside a segment mean it's a reference, not a name.
  if (/\d/.test(segment)) return false;
  // Allow one word like LTD or BANK ("MAMA PUT LTD"), but not a run of bank jargon.
  const long = w.filter((x) => x.length > 1);
  const real = long.filter((x) => !NOISE.has(x));
  return real.length >= 2 && long.length - real.length <= 1;
}

function cleanName(segment: string) {
  return words(segment)
    .filter((w) => !NOISE.has(w) && !TITLES.has(w))
    .join(" ")
    .trim();
}

export interface ParsedSender {
  name: string | null;
  account: string | null;
}

/**
 * Reads who sent the money from a bank narration. Banks write these very
 * differently, for example:
 *   "NIP/ADEBAYO TOLULOPE G/GTB/Rice and stew"
 *   "TRANSFER FROM ADEBAYO TOLULOPE TO MAMA PUT"
 *   "MOB TRF FRM JOHN DOE 0123456789 REF:1234"
 * Returns null fields when it can't tell.
 */
export function parseNarration(narration: string | null | undefined, ownAccount?: string | null): ParsedSender {
  if (!narration) return { name: null, account: null };
  const text = narration.replace(/\s+/g, " ").trim();
  const own = ownAccount?.replace(/\D/g, "") ?? "";

  // A 10-digit account number that isn't the business's own.
  const accounts = (text.match(/(?<!\d)\d{10}(?!\d)/g) ?? []).filter((n) => n !== own);
  const account = accounts.length === 1 ? accounts[0] : null;

  // 1. "... FROM <name> [TO|/|REF|digits ...]"
  const from = text.match(/\b(?:FROM|FRM)\b[\s:/-]*([A-Za-z][A-Za-z .'-]{2,60}?)(?=\s*(?:\bTO\b|\bVIA\b|\bREF\b|\bFOR\b|[/|:,]|\d|$))/i);
  if (from && looksLikeName(from[1])) {
    const name = cleanName(from[1]);
    if (nameWords(name).length >= 2) return { name, account };
  }

  // 2. The segment (split on / | - :) that looks most like a person's name.
  const segments = text.split(/[/|:]|\s-\s|\s{2,}/).map((s) => s.trim()).filter(Boolean);
  for (const segment of segments) {
    const withoutTo = segment.replace(/\bTO\b.*$/i, "").trim();
    if (looksLikeName(withoutTo)) {
      const name = cleanName(withoutTo);
      if (nameWords(name).length >= 2) return { name, account };
    }
  }
  return { name: null, account };
}

function sameWord(a: string, b: string) {
  if (a === b) return true;
  // Short forms: "TOLU" / "TOLULOPE", "CHUKS" is too different and won't match.
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.startsWith(short);
}

/**
 * Whether a customer's profile name is the same person as the bank's sender
 * name. Order doesn't matter, middle names and initials may be missing, and
 * first names may be shortened. At least two words must match, and one of
 * them exactly.
 */
export function namesMatch(profileName: string | null | undefined, senderName: string | null | undefined) {
  const p = [...new Set(nameWords(profileName))];
  const s = [...new Set(nameWords(senderName))];
  if (p.length < 2 || s.length < 2) return false;
  const [fewer, more] = p.length <= s.length ? [p, s] : [s, p];
  const used = new Set<number>();
  let exact = 0;
  for (const w of fewer) {
    let found = more.findIndex((x, i) => !used.has(i) && x === w);
    if (found >= 0) exact += 1;
    else found = more.findIndex((x, i) => !used.has(i) && sameWord(x, w));
    if (found < 0) return false;
    used.add(found);
  }
  return exact >= 1;
}

// -----------------------------------------------------------------------------

export interface IncomingPayment {
  amount: number;
  paidAt: string;
  senderName: string | null;
  senderKey: string | null;
  senderAccount: string | null;
}

export interface MemberCandidate {
  membershipId: string;
  joinedAt: string;
  fullName: string | null;
  /** Senders already recognised as this customer (anywhere on Spendbox). */
  payers: { senderKey: string | null; senderAccount: string | null; senderName: string | null }[];
  /** Senders the business said are not this member ("wrong customer"). */
  notSenders?: string[];
}

export interface RecordedPurchase {
  id: string;
  membershipId: string;
  amount: number;
  paidAt: string;
}

export type MatchDecision =
  | { kind: "member"; membershipId: string; method: "payer" | "name"; purchaseId?: string }
  | { kind: "recorded"; membershipId: string; purchaseId: string }
  | { kind: "none"; reason: "unknown" | "ambiguous" };

/** Payments can arrive a little before the customer joins (they pay, then sign up at the counter). */
const JOIN_GRACE_MS = 6 * 3_600_000;
/** How far apart a typed-in purchase and the bank's time can be. */
const RECORDED_WINDOW_MS = 2 * 3_600_000;

function isDateOnly(iso: string) {
  return /T00:00:00(\.000)?Z$/.test(iso) || /^\d{4}-\d{2}-\d{2}$/.test(iso);
}

function closeInTime(bankTime: string, recordedTime: string) {
  // Some banks only give the day.
  if (isDateOnly(bankTime)) return bankTime.slice(0, 10) === new Date(recordedTime).toISOString().slice(0, 10);
  return Math.abs(new Date(bankTime).getTime() - new Date(recordedTime).getTime()) <= RECORDED_WINDOW_MS;
}

function uniqueOrNull<T>(items: T[]) {
  return items.length === 1 ? items[0] : null;
}

/**
 * Decides which member (if any) sent a payment.
 *   1. A sender already recognised as one member (same account number, or the same name).
 *   2. A member whose profile name matches the sender's name.
 *   3. A purchase the business typed in for the same amount at about the same time.
 * Anything unclear (two members look the same) is left for the business to pick.
 */
export function decideMatch(
  payment: IncomingPayment,
  members: MemberCandidate[],
  recorded: RecordedPurchase[],
): MatchDecision {
  const paidAt = new Date(payment.paidAt).getTime();
  const eligible = members.filter(
    (m) =>
      new Date(m.joinedAt).getTime() - JOIN_GRACE_MS <= paidAt &&
      !m.notSenders?.some((x) => x === payment.senderKey || x === payment.senderAccount),
  );
  const recordedFor = (membershipId: string) =>
    recorded.filter((r) => r.membershipId === membershipId && Math.abs(r.amount - payment.amount) < 0.005 && closeInTime(payment.paidAt, r.paidAt));

  const settle = (membershipId: string, method: "payer" | "name"): MatchDecision => {
    // If the business also typed this one in, link to it instead of counting it twice.
    const typed = recordedFor(membershipId)[0];
    return typed ? { kind: "member", membershipId, method, purchaseId: typed.id } : { kind: "member", membershipId, method };
  };

  // 1a. Same sending account number (and not a clearly different name).
  if (payment.senderAccount) {
    const byAccount = eligible.filter((m) =>
      m.payers.some(
        (p) =>
          p.senderAccount === payment.senderAccount &&
          (!payment.senderName || !p.senderName || namesMatch(p.senderName, payment.senderName)),
      ),
    );
    if (byAccount.length > 1) return { kind: "none", reason: "ambiguous" };
    if (byAccount.length === 1) return settle(byAccount[0].membershipId, "payer");
  }

  // 1b. Same sender name as before.
  if (payment.senderKey) {
    const byKey = eligible.filter((m) => m.payers.some((p) => p.senderKey === payment.senderKey));
    if (byKey.length > 1) return { kind: "none", reason: "ambiguous" };
    if (byKey.length === 1) return settle(byKey[0].membershipId, "payer");
  }

  // 2. Profile name.
  if (payment.senderName) {
    const byName = eligible.filter((m) => namesMatch(m.fullName, payment.senderName));
    if (byName.length > 1) return { kind: "none", reason: "ambiguous" };
    if (byName.length === 1) return settle(byName[0].membershipId, "name");
  }

  // 3. A purchase the business typed in (same amount, about the same time).
  const allowed = new Set(eligible.map((m) => m.membershipId));
  const typed = recorded.filter(
    (r) => allowed.has(r.membershipId) && Math.abs(r.amount - payment.amount) < 0.005 && closeInTime(payment.paidAt, r.paidAt),
  );
  const only = uniqueOrNull(typed);
  if (only) return { kind: "recorded", membershipId: only.membershipId, purchaseId: only.id };
  return { kind: "none", reason: typed.length > 1 ? "ambiguous" : "unknown" };
}

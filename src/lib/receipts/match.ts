// Works out which of a customer's businesses a receipt was paid to.
// Pure functions (no database), so they are easy to test: see match.test.ts.

export interface CandidateAccount {
  id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
}

export interface Candidate {
  membershipId: string;
  businessId: string;
  businessName: string;
  accounts: CandidateAccount[];
}

export interface ReceiptParties {
  recipient_account_number: string | null;
  recipient_name: string | null;
  recipient_bank: string | null;
  merchant_name: string | null;
}

export interface Match {
  candidate: Candidate;
  /** "account": the receipt's account number matches one of the business's bank accounts (trusted).
   *  "name": only the name matches, so the business should confirm it. */
  method: "account" | "name";
  account: CandidateAccount | null;
  /** True when more than one business looked equally likely. */
  ambiguous: boolean;
}

/**
 * How well a printed (possibly masked) account number matches a real one.
 * Returns the number of digits that agree, or 0 if any visible digit disagrees
 * or fewer than 4 digits are visible.
 *   "6012344821" vs "6012344821" → 10
 *   "******4821" vs "6012344821" → 4
 *   "601****821" vs "6012344821" → 6
 */
export function accountMatchScore(printed: string, actual: string) {
  const pattern = printed.replace(/[^0-9*xX•?#]/g, "").replace(/[*xX•?#]/g, "?");
  const real = actual.replace(/\D/g, "");
  if (!pattern || !real) return 0;

  if (!pattern.includes("?")) {
    return pattern === real && pattern.length >= 6 ? pattern.length : 0;
  }
  const parts = pattern.split(/\?+/);
  const prefix = parts[0];
  const suffix = parts[parts.length - 1];
  if (prefix.length + suffix.length > real.length) return 0;
  if (!real.startsWith(prefix) || !real.endsWith(suffix)) return 0;
  const known = prefix.length + suffix.length;
  return known >= 4 ? known : 0;
}

const NAME_STOP_WORDS = new Set([
  "ltd", "limited", "ent", "enterprise", "enterprises", "ventures", "venture", "global", "nig", "nigeria",
  "services", "service", "and", "the", "co", "company", "plc", "inc", "store", "stores", "shop",
  "business", "intl", "international", "concept", "concepts", "mfb", "bank", "via", "to", "from",
]);

function nameTokens(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !NAME_STOP_WORDS.has(t));
}

/** Share of the shorter name's words found in the other name (0–1). */
export function nameMatchScore(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return 0;
  const left = new Set(nameTokens(a));
  const right = new Set(nameTokens(b));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return shared / Math.min(left.size, right.size);
}

const NAME_THRESHOLD = 0.6;

export function matchReceipt(candidates: Candidate[], receipt: ReceiptParties): Match | null {
  // 1. Account number match: the strongest evidence.
  if (receipt.recipient_account_number) {
    const scored = candidates
      .map((candidate) => {
        let best: { account: CandidateAccount; score: number } | null = null;
        for (const account of candidate.accounts) {
          const score = accountMatchScore(receipt.recipient_account_number!, account.account_number);
          if (score > (best?.score ?? 0)) best = { account, score };
        }
        if (!best) return null;
        // Names and bank break ties between businesses with similar numbers.
        const tieBreak =
          Math.max(
            nameMatchScore(receipt.recipient_name, best.account.account_name),
            nameMatchScore(receipt.recipient_name, candidate.businessName),
          ) + nameMatchScore(receipt.recipient_bank, best.account.bank_name) * 0.5;
        return { candidate, account: best.account, score: best.score, tieBreak };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.score - a.score || b.tieBreak - a.tieBreak);

    if (scored.length) {
      const [top, next] = scored;
      const ambiguous = Boolean(next && next.score === top.score && next.tieBreak === top.tieBreak);
      return { candidate: top.candidate, method: "account", account: top.account, ambiguous };
    }
  }

  // 2. Name match: the receipt names the business or its account holder.
  const names = [receipt.recipient_name, receipt.merchant_name].filter(Boolean) as string[];
  if (!names.length) return null;
  const byName = candidates
    .map((candidate) => {
      let score = 0;
      for (const name of names) {
        score = Math.max(score, nameMatchScore(name, candidate.businessName));
        for (const account of candidate.accounts) score = Math.max(score, nameMatchScore(name, account.account_name));
      }
      return { candidate, score };
    })
    .filter((x) => x.score >= NAME_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  if (!byName.length) return null;
  const ambiguous = byName.length > 1 && byName[1].score === byName[0].score;
  return { candidate: byName[0].candidate, method: "name", account: null, ambiguous };
}

import "server-only";

// Paystack is only used to look up bank names and account names. Spendbox
// never moves money. Needs PAYSTACK_SECRET_KEY (Paystack → Settings → API Keys).

const BASE = process.env.PAYSTACK_BASE_URL ?? "https://api.paystack.co";

export interface PaystackBank {
  name: string;
  code: string;
}

export function paystackConfigured() {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

function headers() {
  return { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` };
}

/** Nigerian banks and fintechs Paystack knows about. Cached for a day. */
export async function listBanks(): Promise<PaystackBank[]> {
  if (!paystackConfigured()) return [];
  try {
    const res = await fetch(`${BASE}/bank?country=nigeria&perPage=200`, {
      headers: headers(),
      next: { revalidate: 86_400 },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: { name: string; code: string; active?: boolean }[] };
    const seen = new Set<string>();
    return (body.data ?? [])
      .filter((b) => b.active !== false && b.code && !seen.has(b.code) && seen.add(b.code))
      .map((b) => ({ name: b.name.trim(), code: b.code }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export type ResolveResult = { ok: true; accountName: string } | { ok: false; error: string };

/** Finds the name on a bank account, e.g. "MAMA TEE KITCHEN". */
export async function resolveAccount(accountNumber: string, bankCode: string): Promise<ResolveResult> {
  if (!paystackConfigured()) return { ok: false, error: "Account lookup isn't set up." };
  if (!/^\d{10}$/.test(accountNumber)) return { ok: false, error: "Account numbers have 10 digits." };
  try {
    const url = `${BASE}/bank/resolve?account_number=${accountNumber}&bank_code=${encodeURIComponent(bankCode)}`;
    const res = await fetch(url, { headers: headers(), cache: "no-store" });
    const body = (await res.json().catch(() => null)) as { status?: boolean; data?: { account_name?: string } } | null;
    const name = body?.data?.account_name?.trim();
    if (res.ok && body?.status && name) return { ok: true, accountName: name };
    return { ok: false, error: "We couldn't find that account. Check the number and the bank." };
  } catch {
    return { ok: false, error: "We couldn't reach Paystack. Please try again." };
  }
}

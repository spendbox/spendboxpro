import "server-only";

// Paystack looks up bank and account names, and takes businesses' monthly
// Spendbox payments. Spendbox never touches money between customers and
// businesses. Needs PAYSTACK_SECRET_KEY (Paystack → Settings → API Keys).

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

/** Starts a card/transfer payment on Paystack's page. Returns the page to send the payer to. */
export async function initTransaction(input: { email: string; amountKobo: number; reference: string; callbackUrl: string; metadata: Record<string, unknown> }) {
  const res = await fetch(`${BASE}/transaction/initialize`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo,
      currency: "NGN",
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: { authorization_url?: string } } | null;
  if (!res.ok || !body?.data?.authorization_url) throw new Error(body?.message ?? `Paystack returned ${res.status}`);
  return body.data.authorization_url;
}

/** Asks Paystack whether a payment went through. Amount is in naira. */
export async function verifyTransaction(reference: string) {
  const res = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`, { headers: headers(), cache: "no-store" });
  const body = (await res.json().catch(() => null)) as { data?: { status?: string; amount?: number; currency?: string; reference?: string } } | null;
  const d = body?.data;
  if (!res.ok || !d) return null;
  return { paid: d.status === "success", amount: Number(d.amount ?? 0) / 100, currency: d.currency ?? "NGN", reference: d.reference ?? reference };
}

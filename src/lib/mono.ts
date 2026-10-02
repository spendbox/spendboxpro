import "server-only";

// Mono (mono.co): read-only access to a business's bank account, so payments
// that come in can be counted without receipts. Sandbox and live work the same
// way; the keys decide which one you're using (test_… keys = sandbox).

function baseUrl() {
  return (process.env.MONO_BASE_URL ?? "https://api.withmono.com").replace(/\/$/, "");
}

export function monoConfigured() {
  return Boolean(process.env.MONO_SECRET_KEY && process.env.NEXT_PUBLIC_MONO_PUBLIC_KEY);
}

export function monoPublicKey() {
  return process.env.NEXT_PUBLIC_MONO_PUBLIC_KEY ?? null;
}

export class MonoError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.MONO_SECRET_KEY;
  if (!key) throw new MonoError("Mono isn't set up yet (MONO_SECRET_KEY is missing).", 500);
  const url = path.startsWith("http") ? path : `${baseUrl()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { accept: "application/json", "content-type": "application/json", "mono-sec-key": key, ...init.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  if (!res.ok) throw new MonoError(body?.message ?? `Mono returned ${res.status}`, res.status);
  return body as T;
}

/** Swaps the one-time code from the Connect widget for a lasting account id. */
export async function exchangeToken(code: string) {
  const body = await call<{ data?: { id?: string }; id?: string }>("/v2/accounts/auth", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  const id = body.data?.id ?? body.id;
  if (!id) throw new MonoError("Mono didn't return an account.", 502);
  return id;
}

export interface MonoAccount {
  name: string | null;
  accountNumber: string | null;
  institution: string | null;
  currency: string;
  /** In naira (Mono sends kobo). Null if Mono didn't say. */
  balance: number | null;
  /** AVAILABLE when Mono has the account's history ready. */
  dataStatus: string | null;
}

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function accountDetails(accountId: string): Promise<MonoAccount> {
  const body = await call<{ data?: Raw }>(`/v2/accounts/${encodeURIComponent(accountId)}`);
  const data = (body.data ?? {}) as Raw;
  const account = ((data.account as Raw | undefined) ?? data) as Raw;
  const meta = (data.meta ?? {}) as Raw;
  const institution = account.institution as Raw | string | undefined;
  const kobo = account.balance === null || account.balance === undefined ? NaN : Number(account.balance);
  return {
    name: str(account.name),
    accountNumber: str(account.account_number ?? account.accountNumber),
    institution: typeof institution === "string" ? institution : str(institution?.name),
    currency: str(account.currency) ?? "NGN",
    balance: Number.isFinite(kobo) ? Math.round(kobo) / 100 : null,
    dataStatus: str(meta.data_status),
  };
}

export interface MonoCredit {
  id: string;
  /** In naira (Mono sends kobo). */
  amount: number;
  currency: string;
  date: string;
  narration: string | null;
}

function ddmmyyyy(d: Date) {
  return `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`;
}

/**
 * Money that came into the account, newest first. With dates, only between
 * them (inclusive); without, everything Mono has (up to maxPages pages).
 */
export async function listCredits(accountId: string, from: Date | null, to: Date | null, maxPages = 10): Promise<MonoCredit[]> {
  const params = new URLSearchParams({ type: "credit", paginate: "true" });
  if (from) params.set("start", ddmmyyyy(from));
  if (to) params.set("end", ddmmyyyy(to));
  let next: string | null = `/v2/accounts/${encodeURIComponent(accountId)}/transactions?${params}`;
  const out: MonoCredit[] = [];
  for (let page = 0; next && page < maxPages; page++) {
    const body: { data?: Raw[] | { transactions?: Raw[] }; meta?: Raw; paging?: Raw } = await call(next);
    const rows = Array.isArray(body.data) ? body.data : (body.data?.transactions ?? []);
    for (const t of rows) {
      const type = str(t.type)?.toLowerCase();
      const kobo = Number(t.amount);
      const id = str(t.id) ?? str(t._id);
      const date = str(t.date);
      if (type !== "credit" || !id || !date || !Number.isFinite(kobo) || kobo <= 0) continue;
      out.push({ id, amount: Math.round(kobo) / 100, currency: str(t.currency) ?? "NGN", date, narration: str(t.narration) });
    }
    const paging = (body.meta ?? body.paging ?? {}) as Raw;
    next = str(paging.next);
  }
  return out;
}

/** Stops Mono sharing this account's data with Spendbox. */
export async function unlinkAccount(accountId: string) {
  await call(`/v2/accounts/${encodeURIComponent(accountId)}/unlink`, { method: "POST" });
}

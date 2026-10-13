"use client";

// Paystack's pop-up (https://paystack.com/docs/developer-tools/inlinejs): the payment opens over the
// game, so nobody leaves the site to pay. The server starts the payment and hands over its access
// code; the money is only given once the server has checked the payment with Paystack itself.

type PopupHandlers = { onSuccess?: (t: { reference?: string }) => void; onCancel?: () => void; onError?: (e: unknown) => void };
type PaystackPopType = new () => { resumeTransaction: (accessCode: string, handlers?: PopupHandlers) => void };

let loading: Promise<PaystackPopType | null> | null = null;

function loadPaystack(): Promise<PaystackPopType | null> {
  const w = window as unknown as { PaystackPop?: PaystackPopType };
  if (w.PaystackPop) return Promise.resolve(w.PaystackPop);
  loading ??= new Promise((done) => {
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v2/inline.js";
    s.async = true;
    s.onload = () => done((window as unknown as { PaystackPop?: PaystackPopType }).PaystackPop ?? null);
    s.onerror = () => {
      loading = null;
      done(null);
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Pay in a pop-up over the page. Resolves "paid" (Paystack says it went through: now confirm it on
 * the server), "closed" (they closed it), or "unavailable" (the pop-up couldn't load: use the page).
 */
export async function payInPopup(accessCode: string): Promise<"paid" | "closed" | "unavailable"> {
  const Pop = await loadPaystack();
  if (!Pop) return "unavailable";
  return new Promise((done) => {
    try {
      new Pop().resumeTransaction(accessCode, {
        onSuccess: () => done("paid"),
        onCancel: () => done("closed"),
        onError: () => done("unavailable"),
      });
    } catch {
      done("unavailable");
    }
  });
}

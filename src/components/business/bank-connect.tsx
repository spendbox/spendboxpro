"use client";

import { Landmark, LockKeyhole, Plus, RefreshCw, Trash } from "lucide-react";
import { useState, useTransition } from "react";
import { connectBank, disconnectBank, syncNow, type BankResult } from "@/app/dashboard/[bizId]/bank-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { formatWhen } from "@/lib/format";

export interface BankConnectionView {
  id: string;
  institution: string | null;
  account_name: string | null;
  account_number: string | null;
  status: "active" | "reauth" | "error";
  last_error: string | null;
  last_synced_at: string | null;
  /** How many payments Mono sent at the last check. */
  last_fetch_count: number | null;
  data_status: string | null;
}

const STATUS = {
  active: { tone: "green", label: "Connected" },
  reauth: { tone: "amber", label: "Reconnect needed" },
  error: { tone: "red", label: "Couldn't check" },
} as const;

type MonoOutcome = { code: string } | { closed: true; error?: string };

/**
 * Opens Mono's secure window where the business logs in to its bank
 * (read-only). Resolves with the one-time code, or when the window closes.
 */
async function openMono(publicKey: string, customer: { name: string; email: string }, onOpen: () => void): Promise<MonoOutcome> {
  const { default: Connect } = await import("@mono.co/connect.js");
  return new Promise<MonoOutcome>((resolve) => {
    let settled = false;
    let lastError: string | undefined;
    const finish = (outcome: MonoOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };
    // If Mono's window never loads (blocked or offline), don't leave the button spinning.
    const timer = setTimeout(() => {
      widget.close();
      finish({ closed: true, error: "Mono's window didn't open. Check your internet connection and try again." });
    }, 25_000);
    const widget = new Connect({
      key: publicKey,
      scope: "auth",
      data: { customer },
      onLoad: () => {
        clearTimeout(timer);
        onOpen();
      },
      onEvent: (event, data) => {
        if (event === "OPENED") {
          clearTimeout(timer);
          onOpen();
        }
        if (event === "ERROR") {
          const message = (data as { errorMessage?: string; message?: string } | undefined)?.errorMessage ?? (data as { message?: string })?.message;
          if (message) lastError = message;
        }
      },
      onSuccess: ({ code }: { code: string }) => finish({ code }),
      onClose: () => finish({ closed: true, error: lastError }),
    });
    widget.setup();
    widget.open();
  });
}

export function BankConnect({
  bizId,
  publicKey,
  businessName,
  businessEmail,
  connections,
}: {
  bizId: string;
  /** Mono public key. Null when Mono isn't set up. */
  publicKey: string | null;
  businessName: string;
  businessEmail: string | null;
  connections: BankConnectionView[];
}) {
  const [email, setEmail] = useState("");
  // The saved business email wins (it may have just been added above on this page).
  const contactEmail = (businessEmail || email).trim();
  const [waiting, setWaiting] = useState(false);
  const [result, setResult] = useState<BankResult | null>(null);
  const [busy, setBusy] = useState<"connect" | "sync" | string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (key: string, work: () => Promise<BankResult>) => {
    setBusy(key);
    setResult(null);
    startTransition(async () => {
      setResult(await work());
      setBusy(null);
    });
  };

  const connect = () => {
    if (!publicKey) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
      setResult({ error: "Please enter your business email first. Mono asks for it." });
      return;
    }
    run("connect", async () => {
      const outcome = await openMono(publicKey, { name: businessName, email: contactEmail }, () => setWaiting(true));
      setWaiting(false);
      if ("closed" in outcome) {
        return outcome.error ? { error: `Mono: ${outcome.error}` } : { message: "No bank was connected." };
      }
      return connectBank(bizId, outcome.code, contactEmail);
    });
  };

  if (!publicKey) {
    return (
      <div className="flex items-start gap-3 text-sm text-muted">
        <Landmark className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden />
        <p>
          Bank connections aren&apos;t switched on yet. Once Spendbox is linked to Mono, you&apos;ll connect your bank
          here and payments will count by themselves.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {connections.length > 0 && (
        <ul className="flex flex-col divide-y divide-line">
          {connections.map((c) => {
            const status = STATUS[c.status];
            return (
              <li key={c.id} className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                    <Landmark className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {c.institution ?? "Bank account"}
                      {c.account_number && <span className="font-normal text-muted">•••{c.account_number.slice(-4)}</span>}
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </p>
                    <p className="truncate text-sm text-muted">
                      {c.account_name ?? ""}
                      {c.last_synced_at ? ` · Checked ${formatWhen(c.last_synced_at)}` : " · Fetching your payments…"}
                    </p>
                    {c.status !== "active" && c.last_error && <p className="text-sm text-red-700">{c.last_error}</p>}
                    {c.status === "active" && c.last_synced_at && c.last_fetch_count === 0 && (
                      <p className="text-sm text-amber-900">
                        Mono hasn&apos;t shared any payments for this account yet
                        {c.data_status && c.data_status !== "AVAILABLE" ? " — it's still preparing your history" : ""}.
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {c.status !== "active" && (
                    <Button size="sm" disabled={pending} loading={busy === "connect"} onClick={connect}>
                      Reconnect
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted"
                    disabled={pending}
                    loading={busy === c.id}
                    onClick={() => {
                      if (confirm(`Disconnect ${c.institution ?? "this account"}? Payments into it will stop counting by themselves.`)) {
                        run(c.id, () => disconnectBank(bizId, c.id));
                      }
                    }}
                  >
                    {busy !== c.id && <Trash className="size-4" aria-hidden />} Disconnect
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!businessEmail && (
        <Field label="Business email" htmlFor="mono-email" hint="Mono needs an email for your business. We also add it to your details.">
          <Input id="mono-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={connect} disabled={pending} loading={busy === "connect"} variant={connections.length ? "secondary" : "primary"}>
          {busy !== "connect" && <Plus className="size-4" aria-hidden />}
          {busy === "connect" ? (waiting ? "Finish in Mono's window…" : "Connecting…") : connections.length ? "Connect another account" : "Connect your bank"}
        </Button>
        {connections.length > 0 && (
          <Button variant="secondary" disabled={pending} loading={busy === "sync"} onClick={() => run("sync", () => syncNow(bizId))}>
            {busy !== "sync" && <RefreshCw className="size-4" aria-hidden />} Check for new payments
          </Button>
        )}
      </div>

      {result?.error && <FormMessage>{result.error}</FormMessage>}
      {result?.message && !result.error && <FormMessage tone="success">{result.message}</FormMessage>}

      <p className="flex items-start gap-2 text-sm text-muted">
        <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden />
        You log in to your bank in Mono&apos;s secure window, not on Spendbox. Access is read-only: Spendbox can see money
        coming in, but can never move it.
      </p>
    </div>
  );
}

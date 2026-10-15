"use client";

import { cash, cashSymbol, fromShown } from "@/lib/world/value";
import { useEffect, useState } from "react";
import { MapPin, MessageCircle, Phone } from "@/components/icons";
import type { PropertyResult } from "@/lib/world/property-api";
import { GAME_SERVICES, gameService, REAL_SERVICES, SERVICE_VAT, type ServiceBoard, type ServiceForm, type ServiceJob, type ServiceKind } from "@/lib/world/services";
import { Sheet } from "../sheet";

const fmt = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
const price = (kind: ServiceKind, n: number) => (kind === "game" ? cash(n) : `₦${fmt(n)}`);
const digits = (p: string) => p.replace(/[^\d+]/g, "");
const wa = (p: string) => {
  const d = p.replace(/\D/g, "");
  return d.startsWith("0") ? `234${d.slice(1)}` : d;
};
const label = (kind: ServiceKind, category: string) => (kind === "game" ? (gameService(category)?.label ?? category) : category);

type Tab = "find" | "requests" | "yours";

/** Services between people: find one, post what you need, and your own (offers, requests, jobs). */
export function ServicesSheet({
  load,
  busy,
  onBook,
  onTake,
  onJob,
  onPost,
  onCloseItem,
  onClose,
}: {
  load: () => Promise<ServiceBoard | null>;
  busy: boolean;
  onBook: (offerId: string, title: string, cost: number) => void;
  onTake: (requestId: string, title: string) => void;
  onJob: (jobId: string, action: "done" | "confirm" | "decline" | "cancel") => void;
  onPost: (what: "offer" | "request", f: ServiceForm) => Promise<PropertyResult>;
  onCloseItem: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("find");
  const [kind, setKind] = useState<ServiceKind>("game");
  const [board, setBoard] = useState<ServiceBoard | null>(null);
  const [form, setForm] = useState<"offer" | "request" | null>(null);
  useEffect(() => {
    if (busy) return;
    let alive = true;
    void load().then((b) => alive && setBoard(b));
    return () => {
      alive = false;
    };
  }, [load, busy, form]);

  const offers = (board?.offers ?? []).filter((o) => o.kind === kind);
  const requests = (board?.requests ?? []).filter((r) => r.kind === kind);
  const jobs = board?.jobs ?? [];
  const waiting = jobs.filter((j) => (j.buying && j.status === "done") || (!j.buying && j.status === "held")).length;

  return (
    <Sheet onClose={onClose} wide title="Services">
      <div className="flex gap-1 rounded-full bg-ink/5 p-1">
        {(
          [
            ["find", "Find"],
            ["requests", "Requests"],
            ["yours", waiting ? `Yours (${waiting})` : "Yours"],
          ] as [Tab, string][]
        ).map(([id, text]) => (
          <button key={id} onClick={() => setTab(id)} className={`h-8 flex-1 rounded-full text-xs font-semibold ${tab === id ? "bg-panel shadow-sm" : "text-muted"}`}>
            {text}
          </button>
        ))}
      </div>
      {tab !== "yours" && (
        <div className="mt-3 flex gap-1.5">
          {(
            [
              ["game", "In the game"],
              ["real", "Real life"],
            ] as [ServiceKind, string][]
          ).map(([k, text]) => (
            <button key={k} onClick={() => setKind(k)} className={`h-8 rounded-full px-3 text-xs font-semibold ${kind === k ? "bg-ink text-white" : "bg-ink/5"}`}>
              {text}
            </button>
          ))}
        </div>
      )}
      {tab !== "yours" && (
        <p className="mt-2 text-[11px] text-muted" title={kind === "game" ? `The price is held when you book and paid when it's done, less ${+(SERVICE_VAT * 100).toFixed(1)}% VAT.` : undefined}>
          {kind === "game" ? "Paid in game money, only once it's done." : "Paid in person, outside the game. Meet safely."}
        </p>
      )}

      {!board ? (
        <p className="mt-6 text-center text-sm text-muted">Looking…</p>
      ) : tab === "find" ? (
        <ul className="mt-3 space-y-2">
          {offers.length === 0 && <li className="py-6 text-center text-sm text-muted">Nobody offers {kind === "game" ? "in-game" : "real-life"} services here yet.</li>}
          {offers.map((o) => (
            <li key={o.id} className="rounded-2xl p-3 ring-1 ring-ink/5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{o.title}</p>
                  <p className="truncate text-xs text-muted">
                    {o.provider} · {label(o.kind, o.category)}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums">{price(o.kind, o.price)}</p>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted">{o.about}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-[11px] text-muted">
                  <MapPin className="size-3" /> {o.area}
                </span>
                {o.kind === "game" && gameService(o.category)?.mind ? <span className="rounded-full bg-me/10 px-2 py-0.5 text-[11px] text-me">+{gameService(o.category)!.mind} mind</span> : null}
                {o.kind === "game" && gameService(o.category)?.body ? <span className="rounded-full bg-me/10 px-2 py-0.5 text-[11px] text-me">+{gameService(o.category)!.body} body</span> : null}
                <span className="flex-1" />
                {o.mine ? (
                  <button onClick={() => onCloseItem(o.id)} className="h-8 rounded-full bg-ink/5 px-3 text-xs font-semibold">
                    Close
                  </button>
                ) : o.kind === "game" ? (
                  <button disabled={busy} onClick={() => onBook(o.id, o.title, o.price)} className="h-8 rounded-full bg-ink px-3 text-xs font-semibold text-white disabled:opacity-40">
                    Book
                  </button>
                ) : (
                  <Contact phone={o.phone} whatsapp={o.whatsapp} />
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : tab === "requests" ? (
        <>
          <button onClick={() => setForm("request")} className="mt-3 h-10 w-full rounded-full bg-gold text-sm font-semibold text-ink">
            + Ask for something
          </button>
          <ul className="mt-3 space-y-2">
            {requests.length === 0 && <li className="py-6 text-center text-sm text-muted">No requests yet.</li>}
            {requests.map((r) => (
              <li key={r.id} className="rounded-2xl p-3 ring-1 ring-ink/5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{r.title}</p>
                    <p className="text-xs text-muted">
                      {r.by} · {label(r.kind, r.category)} · {r.area}
                    </p>
                  </div>
                  <p className="shrink-0 text-right text-sm font-semibold tabular-nums">
                    {price(r.kind, r.budget)}
                    <span className="block text-[11px] font-normal text-muted">they&apos;ll pay</span>
                  </p>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted">{r.about}</p>
                <div className="mt-2 flex justify-end gap-2">
                  {r.mine ? (
                    <button onClick={() => onCloseItem(r.id)} className="h-8 rounded-full bg-ink/5 px-3 text-xs font-semibold">
                      {r.status === "taken" ? "Taken" : "Close"}
                    </button>
                  ) : r.kind === "game" ? (
                    <button
                      disabled={busy || !board.canOffer}
                      title={board.canOffer ? "Take it on" : "Only property owners can take on services"}
                      onClick={() => onTake(r.id, r.title)}
                      className="h-8 rounded-full bg-ink px-3 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      Take it on
                    </button>
                  ) : (
                    <Contact phone={r.phone} whatsapp={r.whatsapp} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          {board.canOffer ? (
            <button onClick={() => setForm("offer")} className="mt-3 h-10 w-full rounded-full bg-gold text-sm font-semibold text-ink">
              + Offer a service
            </button>
          ) : (
            <p className="mt-3 rounded-2xl bg-ink/[0.04] p-3 text-xs text-muted">Own property to offer services.</p>
          )}
          <h3 className="mt-4 text-sm font-semibold">Jobs</h3>
          {jobs.length === 0 ? <p className="mt-1 text-xs text-muted">None yet. Book one under Find.</p> : <ul className="mt-2 space-y-2">{jobs.map((j) => <JobRow key={j.id} j={j} busy={busy} onJob={onJob} />)}</ul>}
          {(board.offers ?? []).some((o) => o.mine) || (board.requests ?? []).some((r) => r.mine) ? <h3 className="mt-4 text-sm font-semibold">Posted by you</h3> : null}
          <ul className="mt-2 space-y-1.5">
            {[...(board.offers ?? []).filter((o) => o.mine).map((o) => ({ id: o.id, text: `Offer: ${o.title} · ${price(o.kind, o.price)}` })), ...(board.requests ?? []).filter((r) => r.mine).map((r) => ({ id: r.id, text: `Request: ${r.title} · ${price(r.kind, r.budget)}` }))].map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2 rounded-xl bg-ink/[0.04] px-3 py-2 text-sm">
                <span className="truncate">{x.text}</span>
                <button onClick={() => onCloseItem(x.id)} className="text-xs font-semibold text-hit">
                  Close
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {form && <ServiceFormSheet what={form} kind={kind} onPost={onPost} onClose={() => setForm(null)} />}
    </Sheet>
  );
}

function Contact({ phone, whatsapp }: { phone: string | null; whatsapp: string | null }) {
  return (
    <span className="flex gap-1.5">
      {phone && (
        <a href={`tel:${digits(phone)}`} className="flex h-8 items-center gap-1 rounded-full bg-ink px-3 text-xs font-semibold text-white">
          <Phone className="size-3.5" /> Call
        </a>
      )}
      {whatsapp && (
        <a href={`https://wa.me/${wa(whatsapp)}`} target="_blank" rel="noreferrer" className="flex h-8 items-center gap-1 rounded-full bg-[#25d366] px-3 text-xs font-semibold text-white">
          <MessageCircle className="size-3.5" /> WhatsApp
        </a>
      )}
    </span>
  );
}

function JobRow({ j, busy, onJob }: { j: ServiceJob; busy: boolean; onJob: (id: string, action: "done" | "confirm" | "decline" | "cancel") => void }) {
  const state: Record<ServiceJob["status"], string> = {
    held: j.buying ? "Waiting for them" : "To do",
    done: j.buying ? "Done? Confirm to pay" : "Waiting for them to confirm",
    paid: "Paid",
    refunded: "Cancelled, refunded",
  };
  const btn = "h-8 rounded-full px-3 text-xs font-semibold disabled:opacity-40";
  return (
    <li className="rounded-2xl p-3 ring-1 ring-ink/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{j.title}</p>
          <p className="text-xs text-muted">
            {j.buying ? `From ${j.other}` : `For ${j.other}`} · {state[j.status]}
          </p>
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums">{cash(j.price)}</p>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        {j.buying && (j.status === "held" || j.status === "done") && (
          <button disabled={busy} onClick={() => onJob(j.id, "confirm")} className={`${btn} bg-ink text-white`}>
            Done: pay
          </button>
        )}
        {j.buying && j.status === "held" && (
          <button disabled={busy} onClick={() => onJob(j.id, "cancel")} className={`${btn} bg-ink/5`}>
            Cancel
          </button>
        )}
        {!j.buying && j.status === "held" && (
          <>
            <button disabled={busy} onClick={() => onJob(j.id, "done")} className={`${btn} bg-ink text-white`}>
              Mark done
            </button>
            <button disabled={busy} onClick={() => onJob(j.id, "decline")} className={`${btn} bg-ink/5`}>
              Decline
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/** Offer a service, or post what you need. */
function ServiceFormSheet({ what, kind: start, onPost, onClose }: { what: "offer" | "request"; kind: ServiceKind; onPost: (what: "offer" | "request", f: ServiceForm) => Promise<PropertyResult>; onClose: () => void }) {
  const [kind, setKind] = useState<ServiceKind>(start);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const input = "w-full rounded-xl bg-ink/5 px-3 py-2.5 text-sm outline-none ring-ink/20 focus:ring-2";
  return (
    <Sheet onClose={onClose} title={what === "offer" ? "Offer a service" : "Post what you need"}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          setSending(true);
          setError(null);
          const r = await onPost(what, {
            kind,
            category: String(d.get("category") ?? ""),
            title: String(d.get("title") ?? ""),
            about: String(d.get("about") ?? ""),
            // In-game prices are typed in the player's own money and kept in mint.
            price: ((v: number) => (kind === "game" ? Math.round(fromShown(v) * 100) / 100 : v))(Number(String(d.get("price") ?? "").replace(/[^\d.]/g, ""))),
            area: String(d.get("area") ?? ""),
            phone: String(d.get("phone") ?? "") || undefined,
            whatsapp: String(d.get("whatsapp") ?? "") || undefined,
          });
          setSending(false);
          if (r.ok) onClose();
          else setError(r.error);
        }}
      >
        <div className="flex gap-1.5">
          {(
            [
              ["game", "In the game"],
              ["real", "Real life"],
            ] as [ServiceKind, string][]
          ).map(([k, text]) => (
            <button type="button" key={k} onClick={() => setKind(k)} className={`h-8 rounded-full px-3 text-xs font-semibold ${kind === k ? "bg-ink text-white" : "bg-ink/5"}`}>
              {text}
            </button>
          ))}
        </div>
        <select name="category" required className={input} defaultValue="" key={kind}>
          <option value="" disabled>
            What kind of service
          </option>
          {kind === "game"
            ? GAME_SERVICES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))
            : REAL_SERVICES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input name="title" required minLength={3} maxLength={60} placeholder={what === "offer" ? "What you offer, in a few words" : "What you need, in a few words"} className={input} />
        <textarea name="about" required minLength={10} maxLength={300} rows={3} placeholder="A little more about it" className={input} />
        <div className="grid grid-cols-2 gap-2">
          <input name="price" required inputMode="decimal" placeholder={`${what === "offer" ? "Price" : "You'll pay"} (${kind === "game" ? cashSymbol() : "₦"})`} className={input} />
          <input name="area" required maxLength={60} placeholder="Area (e.g. Yaba)" className={input} />
        </div>
        {kind === "real" && (
          <div className="grid grid-cols-2 gap-2">
            <input name="phone" inputMode="tel" maxLength={30} placeholder="Phone" className={input} />
            <input name="whatsapp" inputMode="tel" maxLength={30} placeholder="WhatsApp" className={input} />
          </div>
        )}
        {kind === "real" && <p className="text-[11px] text-muted">Shown to other players so they can reach you. Payment happens outside the game.</p>}
        {error && <p className="text-sm text-hit">{error}</p>}
        <button disabled={sending} className="h-11 w-full rounded-full bg-ink font-semibold text-white disabled:opacity-50">
          {sending ? "Posting…" : what === "offer" ? "Offer it" : "Post it"}
        </button>
      </form>
    </Sheet>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Check, Coins, Gift, Handshake, Heart, LoaderCircle, Sparkles, X } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import { cn } from "@/lib/cn";
import { short } from "@/lib/format";
import { loadMyGifts, setBlocked, thankFor, type GiftItem, type MyGifts } from "./hug-actions";
import { Sheet } from "./sheet";

// My gifts: what other players sent you lately (hugs, handshakes, mint gifts, spraying), with a
// thank-you button for each (they're told), and a block button for anyone you'd rather not hear
// from (their hugs, gifts, private messages and friend requests stop reaching you).

const when = (iso: string, now: number) => {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
};

function what(g: GiftItem) {
  switch (g.kind) {
    case "hug":
      return "gave you a hug";
    case "handshake":
      return "shook your hand";
    case "spray":
      return `sprayed you ₥${short(g.amount ?? 0)}`;
    default:
      return `gave you ₥${short(g.amount ?? 0)}`;
  }
}

const KIND_ICON = {
  hug: { Icon: Heart, tint: "bg-[#ffe3ec] text-[#d6336c]" },
  handshake: { Icon: Handshake, tint: "bg-[#fff3bf] text-[#e67700]" },
  gift: { Icon: Coins, tint: "bg-gold/25 text-gold-dark" },
  spray: { Icon: Sparkles, tint: "bg-[#f3d9fa] text-[#ae3ec9]" },
} as const;

export function MyGiftsSheet({
  now,
  onClose,
  onChanged,
  initial,
}: {
  now: number;
  onClose: () => void;
  onChanged?: () => void;
  /** Already loaded (shown straight away instead of loading). */
  initial?: MyGifts;
}) {
  const [gifts, setGifts] = useState<MyGifts | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    const res = await loadMyGifts();
    if (res.ok) {
      setGifts(res.gifts);
      setError(null);
    } else {
      setError(res.error);
    }
  }, []);
  const preloaded = initial !== undefined;
  useEffect(() => {
    if (preloaded) return;
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load, preloaded]);

  async function thank(g: GiftItem) {
    const key = `${g.kind}:${g.id}`;
    setBusy(key);
    const res = await thankFor(g.kind, g.id);
    setBusy(null);
    if (!res.ok) return setError(res.error);
    setGifts((cur) => cur && { ...cur, items: cur.items.map((x) => (x.kind === g.kind && x.id === g.id ? { ...x, thanked: true } : x)) });
  }

  async function block(id: string, on: boolean) {
    setBusy(`block:${id}`);
    const res = await setBlocked(id, on);
    setBusy(null);
    setBlocking(null);
    if (!res.ok) return setError(res.error);
    await load();
    onChanged?.();
  }

  return (
    <Sheet onClose={onClose} wide>
      <div className="flex items-center gap-2">
        <span className="grid size-10 place-items-center rounded-xl bg-[#ffe3ec] text-[#d6336c]">
          <Gift className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-extrabold leading-tight">My gifts</h2>
          <p className="text-xs text-muted">Hugs, handshakes and mint other players sent you. Say thank you!</p>
        </div>
        <button onClick={onClose} className="grid size-9 shrink-0 place-items-center self-start rounded-full text-muted hover:bg-panel-2" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>

      {error && <p className="mt-3 rounded-xl bg-hit/10 px-3 py-2 text-sm text-hit">{error}</p>}

      {!gifts ? (
        !error && (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <LoaderCircle className="size-4 animate-spin" /> Loading…
          </p>
        )
      ) : (
        <>
          {/* The last 30 days */}
          <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
            {[
              { Icon: Heart, n: gifts.totals.hugs, label: gifts.totals.hugs === 1 ? "hug" : "hugs", tint: "text-[#d6336c]" },
              { Icon: Handshake, n: gifts.totals.handshakes, label: gifts.totals.handshakes === 1 ? "handshake" : "handshakes", tint: "text-[#e67700]" },
              { Icon: Coins, n: gifts.totals.mint, label: "mint", tint: "text-gold-dark" },
            ].map(({ Icon, n, label, tint }) => (
              <div key={label} className="rounded-xl bg-panel-2 px-1 py-2">
                <Icon className={cn("mx-auto size-4", tint)} />
                <b className="block font-display text-lg leading-tight">{short(n)}</b>
                <span className="text-[11px] text-muted">{label}</span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-center text-[11px] text-muted">
            Last 30 days · You can send {gifts.leftToday} more hug{gifts.leftToday === 1 ? "" : "s"} and handshakes today
          </p>

          {gifts.items.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-panel-2 px-4 py-6 text-center text-sm text-muted">
              Nothing yet. When someone hugs you, shakes your hand or gives you mint, it shows up here.
            </p>
          ) : (
            <ul className="mt-3 max-h-[46dvh] space-y-1 overflow-y-auto overscroll-contain">
              {gifts.items.map((g) => {
                const key = `${g.kind}:${g.id}`;
                const { Icon, tint } = KIND_ICON[g.kind];
                const askBlock = blocking?.id === g.from;
                return (
                  <li key={key} className="rounded-xl px-1 py-1.5">
                    <div className="flex items-center gap-2.5">
                      <span className="relative shrink-0">
                        <AvatarFace avatar={g.avatar} size={36} className={cn("rounded-full", g.blocked && "opacity-50 grayscale")} />
                        <span className={cn("absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full ring-2 ring-panel", tint)}>
                          <Icon className={cn("size-3", g.kind === "hug" && "fill-current")} />
                        </span>
                      </span>
                      <p className="min-w-0 flex-1 text-sm leading-tight">
                        <b>{g.name}</b> {what(g)}
                        {g.note && <span className="block truncate text-xs italic text-ink/70">&ldquo;{g.note}&rdquo;</span>}
                        <span className="block text-[11px] text-muted">{when(g.at, now)}</span>
                      </p>
                      {g.blocked ? (
                        <span className="shrink-0 rounded-full bg-panel-2 px-2.5 py-1.5 text-xs font-semibold text-muted">Blocked</span>
                      ) : g.thanked ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#d3f9d8] px-2.5 py-1.5 text-xs font-semibold text-[#2b8a3e]">
                          <Check className="size-3.5" strokeWidth={3} />
                          Thanked
                        </span>
                      ) : (
                        <button
                          onClick={() => void thank(g)}
                          disabled={busy !== null}
                          className="flex shrink-0 items-center gap-1 rounded-full bg-[#d6336c] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                        >
                          {busy === key ? <LoaderCircle className="size-3.5 animate-spin" /> : <Heart className="size-3.5" />}
                          Thank you
                        </button>
                      )}
                      {!g.blocked && (
                        <button
                          onClick={() => setBlocking(askBlock ? null : { id: g.from, name: g.name })}
                          className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-panel-2"
                          aria-label={`Block ${g.name}`}
                          title={`Block ${g.name}`}
                        >
                          <Ban className="size-4" />
                        </button>
                      )}
                    </div>
                    {askBlock && (
                      <div className="mt-1.5 rounded-xl bg-hit/10 p-2.5 text-xs">
                        <p>
                          Block <b>{g.name}</b>? Their hugs, handshakes, mint gifts, private messages and friend requests won&apos;t reach you, and if
                          you&apos;re friends, that ends. You can unblock them here later.
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button onClick={() => setBlocking(null)} className="rounded-lg bg-panel py-2 font-semibold">
                            Cancel
                          </button>
                          <button
                            onClick={() => void block(g.from, true)}
                            disabled={busy !== null}
                            className="flex items-center justify-center gap-1 rounded-lg bg-hit py-2 font-bold text-white disabled:opacity-60"
                          >
                            {busy === `block:${g.from}` ? <LoaderCircle className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
                            Block
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {gifts.blocked.length > 0 && (
            <>
              <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-muted">Blocked</h3>
              <ul className="mt-1 space-y-1">
                {gifts.blocked.map((p) => (
                  <li key={p.id} className="flex items-center gap-2.5 rounded-xl px-1 py-1">
                    <AvatarFace avatar={p.avatar} size={30} className="shrink-0 rounded-full opacity-60 grayscale" />
                    <b className="min-w-0 flex-1 truncate text-sm">{p.name}</b>
                    <button
                      onClick={() => void block(p.id, false)}
                      disabled={busy !== null}
                      className="flex shrink-0 items-center gap-1 rounded-full bg-panel-2 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                    >
                      {busy === `block:${p.id}` && <LoaderCircle className="size-3.5 animate-spin" />}
                      Unblock
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

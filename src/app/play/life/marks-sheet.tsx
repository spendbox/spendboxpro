"use client";

import { useEffect, useState } from "react";
import { Flag, Trash2 } from "lucide-react";
import { Star } from "@/components/icons";
import type { Prices } from "@/lib/world/region";
import { ADOPT_SHARE, dayCost, GRAFFITI, graffitiLook, graffitiWall, INKS, MARK_KINDS, MARK_MAX, MARK_MIN_REP, markKind, marksAllowed, personalInfo, REACTIONS, website, type GraffitiStyle, type MarkKind } from "@/lib/world/marks";
import { cash } from "@/lib/world/value";
import { mintOf } from "@/lib/world/items";
import { myThings, type MyItem } from "../item-actions";
import { chipIn, leaveMark, myMarks, openCapsule, reactMark, removeMark, voteMark, type MapMark } from "../mark-actions";
import { Sheet } from "../sheet";

// Marks on the map (docs/MARKS.md): one tapped (who left it, react, vote it down, chip in, open a
// capsule), and leaving one of your own where you're looking.

type Done = (text: string, ok: boolean) => void;

export function MarkCard({ mark, me, prices, onPerson, onClose, onChanged, onDone }: { mark: MapMark; me: string | null; prices: Prices; onPerson: (id: string) => void; onClose: () => void; onChanged: () => void; onDone: Done }) {
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(7);
  const k = markKind(mark.kind);
  const mine = !!me && mark.author === me;
  const run = async (fn: () => Promise<{ ok: boolean; error?: string; text?: string }>, done: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    onDone(r.ok ? (r.text ?? done) : (r.error ?? "That didn't work."), r.ok);
    onChanged();
    return r.ok;
  };
  const due = mark.opensAt ? Date.parse(mark.opensAt) <= Date.now() : true;
  return (
    <Sheet onClose={onClose} clear>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{k?.label ?? mark.kind}{mark.place ? ` · ${mark.place}` : ""}</p>
      {mark.kind === "review" && (
        <p className="mt-1 flex gap-0.5">
          {[1, 2, 3, 4, 5].map((s) => (
            <Star key={s} className={`size-5 ${s <= (mark.rating ?? 0) ? "fill-[#f59f00] text-[#f59f00]" : "text-ink/20"}`} />
          ))}
        </p>
      )}
      {mark.body && mark.kind === "writing" ? (
        <p className="mt-2 rounded-lg px-3 py-3 text-xl leading-snug" style={{ background: graffitiWall(mark.style) }}>
          <span className="inline-block" style={graffitiLook(mark.style, mark.colour ?? "#212529")}>
            {mark.body}
          </span>
        </p>
      ) : mark.body ? (
        <p className="mt-2 font-display text-xl font-extrabold leading-snug">&ldquo;{mark.body}&rdquo;</p>
      ) : mark.kind === "capsule" ? (
        <p className="mt-2 text-sm">Sealed until {new Date(mark.opensAt ?? Date.now()).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.{mark.item ? " Something is inside." : ""}</p>
      ) : null}
      <button onClick={() => mark.author && onPerson(mark.author)} className="mt-1 text-sm font-semibold text-gold-dark">
        Left by {mark.authorName}
      </button>
      <span className="ml-2 text-xs text-muted">{new Date(mark.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
      {mark.expiresAt && <p className="mt-1 text-xs text-muted">Stands until {new Date(mark.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {REACTIONS.map((r) => (
          <button
            key={r.id}
            disabled={busy || !me}
            onClick={() => void run(() => reactMark(mark.id, r.id), mark.mine === r.id ? "Taken back." : "Reacted.")}
            className={`flex h-9 items-center gap-1 rounded-full px-3 text-sm ${mark.mine === r.id ? "bg-gold/25 ring-2 ring-gold" : "bg-ink/5"}`}
          >
            {r.label} <span className="text-xs tabular-nums text-muted">{mark.reactions[r.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {mark.kind === "capsule" && due && mark.item && !mark.takenBy && me && (
        <button disabled={busy} onClick={() => void run(() => openCapsule(mark.id), "Opened.")} className="mt-3 h-11 w-full rounded-full bg-gold font-semibold text-ink disabled:opacity-40">
          Open it: {mark.item} inside
        </button>
      )}
      {mark.takenBy && <p className="mt-2 text-xs text-muted">{mark.takenBy} opened it first.</p>}

      {mark.expiresAt && me && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-ink/[0.04] p-2.5">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 rounded-full bg-panel px-3 text-xs font-semibold" aria-label="Days">
            {[1, 7, 30].map((d) => (
              <option key={d} value={d}>
                {d} day{d === 1 ? "" : "s"}
              </option>
            ))}
          </select>
          <button disabled={busy} onClick={() => void run(() => chipIn(mark.id, days), "Thanks!")} className="h-9 flex-1 rounded-full bg-ink text-xs font-semibold text-white disabled:opacity-40">
            Chip in to keep it · {cash(mintOf(dayCost(mark.kind) * days, prices))}
          </button>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-xs">
        {mine ? (
          <button disabled={busy} onClick={() => void run(() => removeMark(mark.id), "Taken down.").then((ok) => ok && onClose())} className="flex items-center gap-1 font-semibold text-hit">
            <Trash2 className="size-3.5" /> Take it down
          </button>
        ) : me ? (
          <button disabled={busy || mark.voted} onClick={() => void run(() => voteMark(mark.id), "Vote counted.").then(() => onClose())} className="flex items-center gap-1 font-semibold text-muted disabled:opacity-50">
            <Flag className="size-3.5" /> {mark.voted ? "You voted to take it down" : "Vote to take it down"}
          </button>
        ) : (
          <span />
        )}
        <span className="text-muted">{mark.votes ? `${mark.votes} vote${mark.votes === 1 ? "" : "s"} to take down` : ""}</span>
      </div>
    </Sheet>
  );
}

/** Leave a mark where you're looking: writing, a review, a tree, a statue, a time capsule... */
export function LeaveMarkSheet({ where, region, x, z, place, prices, reputation, adoptable, onClose, onDone, onFly, onChanged }: { where: string; region: string; x: number; z: number; place?: string; prices: Prices; reputation: number | null; adoptable?: boolean; onClose: () => void; onDone: Done; onFly: (x: number, z: number) => void; onChanged: () => void }) {
  const [tab, setTab] = useState<"leave" | "mine">("leave");
  const [mine, setMine] = useState<Awaited<ReturnType<typeof myMarks>> | undefined>(undefined);
  const loadMine = () => void myMarks().then((m) => setMine(m));
  useEffect(() => {
    let alive = true;
    void myMarks().then((m) => alive && setMine(m));
    return () => {
      alive = false;
    };
  }, []);
  const [kind, setKind] = useState<MarkKind>("writing");
  const [style, setStyle] = useState<GraffitiStyle>("spray");
  const [body, setBody] = useState("");
  const [colour, setColour] = useState(INKS[0]);
  const [rating, setRating] = useState(5);
  const [days, setDays] = useState(30);
  const [item, setItem] = useState<number | null>(null);
  const [things, setThings] = useState<MyItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const k = markKind(kind)!;
  useEffect(() => {
    if (kind !== "capsule" || things) return;
    void myThings().then((t) => setThings((t?.items ?? []).filter((i) => i.listPrice == null)));
  }, [kind, things]);
  const found = personalInfo(body) ?? website(body);
  const cost = mintOf(kind === "tree" && adoptable ? k.price * ADOPT_SHARE : k.price, prices);
  const rep = mine?.reputation ?? reputation;
  const allowed = mine ? mine.allowed : reputation === null ? null : marksAllowed(reputation);
  const full = !!mine && mine.up >= mine.allowed && mine.allowed > 0;
  const tabs = (
    <div className="mb-3 flex gap-1 rounded-full bg-ink/5 p-1">
      {(
        [
          ["leave", "Leave a mark"],
          ["mine", `My marks${mine ? ` (${mine.up} up)` : ""}`],
        ] as const
      ).map(([id, label]) => (
        <button key={id} onClick={() => setTab(id)} className={`h-9 flex-1 rounded-full text-sm font-semibold ${tab === id ? "bg-panel shadow-sm" : "text-muted"}`}>
          {label}
        </button>
      ))}
    </div>
  );
  if (tab === "mine")
    return (
      <Sheet onClose={onClose} title="Your marks" wide>
        {tabs}
        <MyMarksList
          mine={mine}
          onFly={(mx, mz) => {
            onClose();
            onFly(mx, mz);
          }}
          onRemoved={(text, ok) => {
            onDone(text, ok);
            loadMine();
            onChanged();
          }}
        />
      </Sheet>
    );
  if (allowed === 0)
    return (
      <Sheet onClose={onClose} title="Leave a mark" wide>
        {tabs}
        <p className="text-sm">
          You need <b>{MARK_MIN_REP} reputation</b> to leave anything on the map. You have {rep ?? 0}.
        </p>
        <p className="mt-2 text-xs text-muted">Reputation comes from your home and property, things you own and make, and people reacting to what you do. Tap your ★ at the top to see what adds to it and what takes it away.</p>
        <button onClick={onClose} className="mt-3 h-11 w-full rounded-full bg-ink font-semibold text-white">
          OK
        </button>
      </Sheet>
    );
  return (
    <Sheet onClose={onClose} title="Leave a mark" wide>
      {tabs}
      <p className="text-sm text-muted">At {where}. Your name goes with it; people can react, or vote to take it down.</p>
      {allowed !== null && (
        <p className={`mt-2 rounded-xl px-3 py-2 text-xs ${full ? "bg-hit/10 font-semibold text-hit" : "bg-ink/[0.04]"}`}>
          {mine ? `${mine.up} of ${allowed} up. ` : `You can have ${allowed} up at once. `}
          {full ? (
            <button onClick={() => setTab("mine")} className="underline">
              Take one down in My marks to leave another.
            </button>
          ) : (
            "One more for every 50 reputation."
          )}
        </p>
      )}
      <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {MARK_KINDS.map((m) => (
          <button key={m.kind} onClick={() => setKind(m.kind)} className={`h-8 shrink-0 rounded-full px-3 text-xs font-semibold ${kind === m.kind ? "bg-ink text-white" : "bg-ink/5"}`}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">{kind === "tree" && adoptable ? "There are trees here already: adopt one with your name and words on it, for half the price of planting one. Yours for good." : k.what}</p>
      {kind === "writing" && (
        // The graffiti style: each button shows how it looks.
        <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Graffiti style">
          {GRAFFITI.map((g) => (
            <button
              key={g.id}
              role="radio"
              aria-checked={style === g.id}
              title={g.hint}
              onClick={() => setStyle(g.id)}
              className={`h-10 shrink-0 rounded-lg px-3 text-sm ring-2 ${style === g.id ? "ring-ink" : "ring-transparent"}`}
              style={{ background: graffitiWall(g.id) }}
            >
              <span className="inline-block" style={graffitiLook(g.id, colour)}>
                {g.label}
              </span>
            </button>
          ))}
        </div>
      )}
      {k.text !== "none" && (
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={MARK_MAX}
          rows={2}
          enterKeyHint="done"
          placeholder={kind === "writing" ? "A short line…" : kind === "review" ? "What's it like here?" : kind === "capsule" ? "A message for whoever opens it…" : "A dedication (optional)"}
          // 16px text so phones don't zoom in, and a tap always brings the keyboard up.
          onPointerUp={(e) => e.currentTarget.focus()}
          className="mt-2 w-full rounded-2xl bg-ink/5 px-4 py-2.5 text-base outline-none ring-ink/20 focus:ring-2"
        />
      )}
      {k.text !== "none" && <p className="text-right text-[11px] text-muted">{body.length}/{MARK_MAX}</p>}
      {kind === "writing" && body.trim() && (
        <p className="mt-1 rounded-lg px-3 py-2 text-lg leading-snug" style={{ background: graffitiWall(style) }} aria-label="How it will look">
          <span className="inline-block" style={graffitiLook(style, colour)}>
            {body}
          </span>
        </p>
      )}
      {found && <p className="text-xs font-semibold text-hit">Take out {found}: {found.includes("website") || found.includes("handle") ? "links and handles" : "real contact details"} can&apos;t go on the map.</p>}
      {kind === "writing" && (
        <div className="mt-1 flex gap-1.5">
          {INKS.map((c) => (
            <button key={c} onClick={() => setColour(c)} aria-label={`Ink ${c}`} className={`size-7 rounded-full ring-2 ${colour === c ? "ring-ink" : "ring-ink/10"}`} style={{ background: c }} />
          ))}
        </div>
      )}
      {kind === "review" && (
        <div className="mt-1 flex gap-1">
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} onClick={() => setRating(s)} aria-label={`${s} stars`}>
              <Star className={`size-7 ${s <= rating ? "fill-[#f59f00] text-[#f59f00]" : "text-ink/20"}`} />
            </button>
          ))}
        </div>
      )}
      {kind === "capsule" && (
        <div className="mt-1 space-y-2 text-xs">
          <label className="flex items-center gap-2">
            Opens in
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 rounded-full bg-ink/5 px-3 font-semibold">
              {[1, 7, 30, 90, 365].map((d) => (
                <option key={d} value={d}>
                  {d === 365 ? "a year" : `${d} day${d === 1 ? "" : "s"}`}
                </option>
              ))}
            </select>
          </label>
          <select value={item ?? ""} onChange={(e) => setItem(e.target.value ? Number(e.target.value) : null)} className="h-8 w-full rounded-full bg-ink/5 px-3 font-semibold" aria-label="Something inside">
            <option value="">Nothing inside (just the message)</option>
            {(things ?? []).map((i) => (
              <option key={i.id} value={i.id}>
                Put in: {i.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <button
        disabled={busy || full || !!found || (k.text === "need" && !body.trim())}
        onClick={async () => {
          setBusy(true);
          const r = await leaveMark({ region, x, z, kind, body, colour, style, rating, place, opensInDays: days, itemId: item ?? undefined });
          setBusy(false);
          onDone(r.ok ? (r.text === "adopted" ? `You adopted a tree at ${where}.` : r.text === "moved" ? `${k.label} left just off the road near ${where}.` : `${k.label} left at ${where}.`) : r.error, r.ok);
          if (r.ok) {
            onChanged();
            onClose();
          } else loadMine();
        }}
        className="mt-3 h-11 w-full rounded-full bg-ink font-semibold text-white disabled:opacity-40"
      >
        {cost > 0 ? `Leave it · ${cash(cost)}` : "Leave it"}
      </button>
    </Sheet>
  );
}

/** Your marks: where each is (fly there), whether it's up, and taking one down to make room. */
function MyMarksList({ mine, onFly, onRemoved }: { mine: Awaited<ReturnType<typeof myMarks>> | undefined; onFly: (x: number, z: number) => void; onRemoved: Done }) {
  const [busy, setBusy] = useState<number | null>(null);
  if (mine === undefined) return <div className="h-32 animate-pulse rounded-2xl bg-ink/5" />;
  if (!mine || mine.marks.length === 0) return <p className="py-6 text-center text-sm text-muted">You haven&apos;t left a mark yet.</p>;
  return (
    <>
      <p className="mb-2 text-xs text-muted">
        {mine.up} of {mine.allowed} up · reputation {mine.reputation}. Taking one down makes room for a new one.
      </p>
      <ul className="space-y-2">
        {mine.marks.map((m) => (
          <li key={m.id} className={`rounded-2xl p-3 ${m.up ? "bg-ink/[0.04]" : "bg-ink/[0.02] opacity-60"}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {markKind(m.kind)?.label ?? m.kind}
              {m.place ? ` · ${m.place}` : ""}
            </p>
            {m.body && <p className="mt-0.5 text-sm">&ldquo;{m.body}&rdquo;</p>}
            <p className="mt-1 text-[11px] text-muted">
              {new Date(m.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              {m.up ? (m.expiresAt ? ` · up until ${new Date(m.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : " · up") : m.removed ? " · taken down" : " · ended"}
            </p>
            <div className="mt-2 flex gap-2">
              <button onClick={() => onFly(m.x, m.z)} className="h-8 rounded-full bg-ink/10 px-3 text-xs font-semibold">
                Show on map
              </button>
              {m.up && (
                <button
                  disabled={busy === m.id}
                  onClick={async () => {
                    setBusy(m.id);
                    const r = await removeMark(m.id);
                    setBusy(null);
                    onRemoved(r.ok ? "Taken down. You can leave a new one." : r.error, r.ok);
                  }}
                  className="flex h-8 items-center gap-1 rounded-full bg-hit/10 px-3 text-xs font-semibold text-hit disabled:opacity-40"
                >
                  <Trash2 className="size-3.5" /> Take down
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

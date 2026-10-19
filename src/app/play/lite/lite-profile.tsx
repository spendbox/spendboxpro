"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ImagePlus, Menu, Plus } from "lucide-react";
import { AvatarFace } from "@/components/avatar";
import type { Avatar } from "@/lib/avatar";
import { cn } from "@/lib/cn";
import { cash } from "@/lib/world/value";
import { myThings, type MyItem } from "../item-actions";
import type { PlayerCardData } from "../people-actions";
import { cachedCard, forgetCard, loadCard } from "../people/card-cache";
import { PostPhotoSheet, PostsGrid, useProfilePosts } from "../people/profile-posts";
import { saveAbout } from "../profile-actions";
import { OnTop } from "../on-top";

// Your profile in Lite (docs/LITE.md): your photo, name, a few words about you, your numbers,
// Edit profile and Post a photo, then your photos (or your things). The ☰ holds everything else
// (the game's own menu: home, doorstep, friends, notifications, sign out...).

const ABOUT_MAX = 160;

export function LiteProfile({
  me,
  onClose,
  onMenu,
  onPhoto,
  onLook,
  onMessage,
}: {
  me: { id: string; name: string; avatar: Avatar; level: number };
  onClose: () => void;
  /** The game's menu (everything else). */
  onMenu: () => void;
  /** Change your profile photo (the game's own pop-up). */
  onPhoto: () => void;
  /** Change your 3D look (in the world). */
  onLook: () => void;
  onMessage: (text: string, ok: boolean) => void;
}) {
  const [card, setCard] = useState<PlayerCardData | null>(() => cachedCard(me.id)?.card ?? null);
  const [tab, setTab] = useState<"photos" | "things">("photos");
  const [editing, setEditing] = useState(false);
  const [posting, setPosting] = useState(false);
  const [things, setThings] = useState<MyItem[] | null>(null);
  const { got, add, drop } = useProfilePosts(me.id);
  const reload = () => {
    forgetCard(me.id);
    void loadCard(me.id).then((c) => c && setCard(c));
  };
  useEffect(() => {
    void loadCard(me.id).then((c) => c && setCard(c));
  }, [me.id]);
  useEffect(() => {
    if (tab === "things" && !things) void myThings().then((t) => setThings(t?.items ?? []));
  }, [tab, things]);

  const stats: [string, string][] = [
    ["Reputation", card ? String(card.reputation) : "–"],
    ["Friends", card ? String(card.friends.length) : "–"],
    ["Things", card ? String(card.things) : "–"],
  ];
  return (
    <OnTop role="dialog" aria-modal="true" aria-label="Your profile" className="fixed inset-0 overflow-y-auto overscroll-contain bg-white text-ink">
      <div className="mx-auto w-full max-w-xl pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <header className="flex items-center gap-2 px-2 pb-1 pt-[max(0.875rem,env(safe-area-inset-top))]">
          <button onClick={onClose} className="grid size-11 place-items-center rounded-full" aria-label="Back">
            <ArrowLeft className="size-6" />
          </button>
          <span className="flex-1" />
          <button onClick={onMenu} className="mr-2 grid size-11 place-items-center rounded-full bg-panel-2" aria-label="Settings and more">
            <Menu className="size-[22px]" />
          </button>
        </header>

        <div className="flex flex-col items-center px-5 text-center">
          <AvatarFace avatar={me.avatar} size={96} className="rounded-full" />
          <h1 className="mt-3 text-[22px] font-extrabold">{me.name}</h1>
          <p className="text-sm text-muted">{[`Level ${me.level}`, card?.home?.area].filter(Boolean).join(" · ")}</p>
          {card?.about ? (
            <p className="mt-2.5 max-w-xs whitespace-pre-line text-[15px] leading-relaxed">{card.about}</p>
          ) : (
            <button onClick={() => setEditing(true)} className="mt-2.5 text-sm font-bold text-[#5b3cc4]">
              Add a few words about you
            </button>
          )}
        </div>

        <dl className="mx-5 mt-5 grid grid-cols-3 text-center">
          {stats.map(([label, value]) => (
            <div key={label}>
              <dd className="text-xl font-extrabold tabular-nums">{value}</dd>
              <dt className="text-[13px] text-muted">{label}</dt>
            </div>
          ))}
        </dl>

        <div className="grid grid-cols-2 gap-2.5 px-5 pb-4 pt-5">
          <button onClick={() => setEditing(true)} className="h-[50px] rounded-2xl bg-panel-2 text-[15px] font-extrabold">
            Edit profile
          </button>
          <button onClick={() => setPosting(true)} className="flex h-[50px] items-center justify-center gap-2 rounded-2xl bg-[#7048e8] text-[15px] font-extrabold text-white">
            <Plus className="size-[18px]" /> Post a photo
          </button>
        </div>

        <div className="mx-5 flex border-b border-line" role="tablist">
          {(
            [
              ["photos", "Photos"],
              ["things", "Things"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn("h-12 flex-1 text-[15px] font-extrabold", tab === id ? "text-ink shadow-[inset_0_-3px_0_#18202b]" : "text-muted")}>
              {label}
            </button>
          ))}
        </div>

        {tab === "photos" ? (
          <PostsGrid
            got={got}
            mine
            onDeleted={drop}
            className="mt-0.5"
            empty={
              <button onClick={() => setPosting(true)} className="mx-auto mt-8 flex flex-col items-center gap-2 text-sm font-bold text-muted">
                <ImagePlus className="size-8" />
                {got?.off ? "Posting photos is switched on soon" : "Post your first photo"}
              </button>
            }
          />
        ) : things === null ? (
          <div className="space-y-2 p-5">{[0, 1, 2].map((k) => <div key={k} className="h-12 animate-pulse rounded-2xl bg-ink/5" />)}</div>
        ) : things.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">Nothing yet. Shops are in the ☰ menu.</p>
        ) : (
          <ul className="px-5 py-2">
            {things.map((t) => (
              <li key={t.id} className="flex items-center gap-3 border-b border-line/60 py-3 last:border-0">
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{t.name}</span>
                <span className="shrink-0 text-sm text-muted">{cash(t.worth)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing && (
        <EditProfile
          me={me}
          card={card}
          onClose={() => setEditing(false)}
          onPhoto={onPhoto}
          onLook={onLook}
          onSaved={() => {
            setEditing(false);
            reload();
            onMessage("Profile saved.", true);
          }}
          onMessage={onMessage}
        />
      )}
      {posting && <PostPhotoSheet onClose={() => setPosting(false)} onPosted={add} onMessage={onMessage} />}
    </OnTop>
  );
}

function EditProfile({
  me,
  card,
  onClose,
  onPhoto,
  onLook,
  onSaved,
  onMessage,
}: {
  me: { name: string; avatar: Avatar };
  card: PlayerCardData | null;
  onClose: () => void;
  onPhoto: () => void;
  onLook: () => void;
  onSaved: () => void;
  onMessage: (text: string, ok: boolean) => void;
}) {
  const [about, setAbout] = useState(card?.about ?? "");
  const [photosFor, setPhotosFor] = useState<"everyone" | "friends">(card?.photosFor ?? "everyone");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const r = await saveAbout(about, photosFor).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    setBusy(false);
    if (r.ok) onSaved();
    else onMessage(r.error, false);
  };
  return (
    <OnTop role="dialog" aria-modal="true" aria-label="Edit profile" className="fixed inset-0 flex flex-col bg-white text-ink">
      <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col">
        <header className="flex items-center gap-2 px-2 pb-2 pt-[max(0.875rem,env(safe-area-inset-top))]">
          <button onClick={onClose} className="grid size-11 place-items-center rounded-full" aria-label="Back">
            <ArrowLeft className="size-6" />
          </button>
          <h1 className="flex-1 text-xl font-extrabold">Edit profile</h1>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-4">
          <div className="flex items-center gap-4 pt-2">
            <AvatarFace avatar={me.avatar} size={80} className="shrink-0 rounded-full" />
            <div className="flex flex-col items-start gap-2">
              <button onClick={onPhoto} className="h-11 rounded-2xl bg-panel-2 px-4 text-sm font-extrabold">
                Change photo
              </button>
              <button onClick={onLook} className="text-sm font-bold text-[#5b3cc4]">
                Change your look
              </button>
            </div>
          </div>
          <div>
            <p className="text-sm font-extrabold">Name</p>
            <p className="mt-2 flex h-[50px] items-center rounded-2xl bg-panel-2 px-4 text-base font-semibold text-muted">{me.name}</p>
          </div>
          <label className="block">
            <span className="flex justify-between text-sm font-extrabold">
              About you
              <span className="font-semibold text-muted tabular-nums">
                {about.length} / {ABOUT_MAX}
              </span>
            </span>
            <textarea
              value={about}
              onChange={(e) => setAbout(e.target.value.slice(0, ABOUT_MAX))}
              rows={3}
              placeholder="Tester by day, Whot! champion by night."
              className="mt-2 w-full resize-none rounded-2xl bg-panel-2 px-4 py-3.5 text-base outline-none ring-ink/20 focus:ring-2"
            />
          </label>
          <div>
            <p className="text-sm font-extrabold">Who sees your photos</p>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-2xl bg-panel-2 p-1">
              {(
                [
                  ["everyone", "Everyone"],
                  ["friends", "Friends only"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} onClick={() => setPhotosFor(id)} aria-pressed={photosFor === id} className={cn("h-11 rounded-xl text-sm font-extrabold", photosFor === id ? "bg-white text-ink shadow-sm" : "text-muted")}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          <button disabled={busy} onClick={() => void save()} className="h-14 w-full rounded-[18px] bg-[#7048e8] text-base font-extrabold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </OnTop>
  );
}

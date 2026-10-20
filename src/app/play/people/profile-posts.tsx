"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Lock, Trash2 } from "lucide-react";
import { X } from "@/components/icons";
import { cn } from "@/lib/cn";
import type { ProfilePost } from "@/app/api/profile-posts/route";
import { shrinkPhoto } from "../events/room-kit";
import { OnTopPage } from "../on-top";

// Photos on a profile (src/app/api/profile-posts, game-db/130): a grid on anyone's card and on your
// own profile, a photo full screen when tapped (yours with Delete), and posting one of your own.

type Loaded = { posts: ProfilePost[]; friendsOnly: boolean; off: boolean };

/** Someone's photos, newest first (null while loading). `add` and `drop` keep the list in step after you post or delete. */
export function useProfilePosts(userId: string) {
  const [got, setGot] = useState<Loaded | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch(`/api/profile-posts?user=${encodeURIComponent(userId)}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ posts?: ProfilePost[]; friendsOnly?: boolean; off?: boolean }>)
      .then((d) => alive && setGot({ posts: d.posts ?? [], friendsOnly: !!d.friendsOnly, off: !!d.off }))
      .catch(() => alive && setGot({ posts: [], friendsOnly: false, off: false }));
    return () => {
      alive = false;
    };
  }, [userId]);
  const add = useCallback((p: ProfilePost) => setGot((g) => ({ posts: [p, ...(g?.posts ?? [])], friendsOnly: false, off: false })), []);
  const drop = useCallback((id: number) => setGot((g) => (g ? { ...g, posts: g.posts.filter((p) => p.id !== id) } : g)), []);
  return { got, add, drop };
}

/** Post a photo: pick one, add a line if you like, post. */
export function usePostPhoto(onPosted: (p: ProfilePost) => void, onMessage: (text: string, ok: boolean) => void) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const post = async (file: File | undefined, caption: string) => {
    if (!file) return false;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("photo", await shrinkPhoto(file), "photo.jpg");
      if (caption.trim()) form.set("caption", caption.trim());
      const r = (await fetch("/api/profile-posts", { method: "POST", body: form }).then((x) => x.json())) as { ok: boolean; error?: string; post?: ProfilePost };
      if (!r.ok || !r.post) throw new Error(r.error ?? "Couldn't post it. Try again.");
      onPosted(r.post);
      onMessage("Posted to your profile.", true);
      return true;
    } catch (e) {
      const why = e instanceof Error ? e.message : "";
      onMessage(why === "not a picture" || why === "too big" || !why ? "That file isn't a picture we can use. Try another." : why, false);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { input, busy, post };
}

/** The photos in a grid of three (the newest first); tap one to see it big. */
export function PostsGrid({ got, mine, onDeleted, empty, className }: { got: Loaded | null; mine: boolean; onDeleted?: (id: number) => void; empty?: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState<ProfilePost | null>(null);
  if (!got) return <div className={cn("grid grid-cols-3 gap-0.5", className)}>{[0, 1, 2].map((k) => <div key={k} className="aspect-square animate-pulse bg-ink/5" />)}</div>;
  if (got.friendsOnly)
    return (
      <p className={cn("flex items-center justify-center gap-1.5 py-6 text-sm text-muted", className)}>
        <Lock className="size-4" /> Their photos are for friends only
      </p>
    );
  if (!got.posts.length) return <>{empty ?? null}</>;
  return (
    <>
      <div className={cn("grid grid-cols-3 gap-0.5", className)}>
        {got.posts.map((p) => (
          <button key={p.id} onClick={() => setOpen(p)} className="aspect-square overflow-hidden bg-ink/5" aria-label={p.caption ? `Photo: ${p.caption}` : "Photo"}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" loading="lazy" className="size-full object-cover" />
          </button>
        ))}
      </div>
      {open && <PhotoView post={open} mine={mine} onClose={() => setOpen(null)} onDeleted={(id) => { setOpen(null); onDeleted?.(id); }} />}
    </>
  );
}

function PhotoView({ post, mine, onClose, onDeleted }: { post: ProfilePost; mine: boolean; onClose: () => void; onDeleted: (id: number) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setBusy(true);
    const r = (await fetch(`/api/profile-posts?id=${post.id}`, { method: "DELETE" }).then((x) => x.json()).catch(() => ({ ok: false }))) as { ok: boolean; error?: string };
    setBusy(false);
    if (r.ok) onDeleted(post.id);
    else setError(r.error ?? "That didn't work. Try again.");
  };
  return (
    <OnTopPage role="dialog" aria-modal="true" aria-label="Photo" className="fixed inset-0 flex flex-col bg-black/95 text-white">
      <div className="flex items-center justify-end gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {mine && (
          <button disabled={busy} onClick={() => void remove()} className="flex h-11 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-semibold disabled:opacity-50">
            <Trash2 className="size-4" /> Delete
          </button>
        )}
        <button onClick={onClose} className="grid size-11 place-items-center rounded-full bg-white/10" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>
      <div className="grid min-h-0 flex-1 place-items-center px-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={post.url} alt={post.caption ?? "Photo"} className="max-h-full max-w-full rounded-lg object-contain" />
      </div>
      <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center">
        {post.caption && <p className="text-base">{post.caption}</p>}
        {error && <p className="mt-1 text-sm text-[#ffa8a8]">{error}</p>}
      </div>
    </OnTopPage>
  );
}

/** "Post a photo": pick it, see it, add a line, post (a pop-up). */
export function PostPhotoSheet({ onClose, onPosted, onMessage }: { onClose: () => void; onPosted: (p: ProfilePost) => void; onMessage: (text: string, ok: boolean) => void }) {
  const { input, busy, post } = usePostPhoto(onPosted, onMessage);
  const [file, setFile] = useState<File | null>(null);
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const [caption, setCaption] = useState("");
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  // Straight to the phone's photos.
  useEffect(() => {
    input.current?.click();
  }, [input]);
  return (
    <OnTopPage role="dialog" aria-modal="true" aria-label="Post a photo" className="fixed inset-0 flex flex-col bg-white text-ink">
      <header className="flex items-center gap-2 border-b border-line p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button onClick={onClose} className="grid size-11 place-items-center rounded-full" aria-label="Close">
          <X className="size-5" />
        </button>
        <h2 className="flex-1 text-lg font-extrabold">Post a photo</h2>
      </header>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
        <button onClick={() => input.current?.click()} className="grid aspect-square w-full place-items-center overflow-hidden rounded-3xl bg-panel-2 text-muted">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Your photo" className="size-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-2 text-sm font-semibold">
              <ImagePlus className="size-8" /> Pick a photo
            </span>
          )}
        </button>
        <label className="flex flex-col gap-2 text-sm font-extrabold">
          Say something (optional)
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={140}
            placeholder="Sunday at Tarkwa Bay"
            className="h-12 rounded-2xl bg-panel-2 px-4 text-base font-medium outline-none ring-ink/20 focus:ring-2"
          />
        </label>
        <p className="text-xs text-muted">Everyone who can see your profile can see it. Keep it friendly: photos that break the rules are taken down.</p>
      </div>
      <div className="border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          disabled={!file || busy}
          onClick={() => void post(file ?? undefined, caption).then((ok) => ok && onClose())}
          className="h-14 w-full rounded-2xl bg-[#7048e8] text-base font-extrabold text-white disabled:opacity-40"
        >
          {busy ? "Posting…" : "Post"}
        </button>
      </div>
    </OnTopPage>
  );
}

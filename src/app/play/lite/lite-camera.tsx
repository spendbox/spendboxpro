"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Image as ImageIcon, Send, User, UserRound } from "lucide-react";
import { X } from "@/components/icons";
import { asJpeg, announceChatSent } from "../chat-photo";
import { sendPhoto } from "../chat-actions";
import { addShot } from "../phone/gallery";
import { usePostPhoto } from "../people/profile-posts";
import { cardPreview } from "../people/card-cache";
import { PeopleList } from "../people/people-list";
import { OnTopPage } from "../on-top";
import { Sheet } from "../sheet";

// Lite's camera (docs/LITE.md): there's no town for the game's camera to take, so the phone's own
// camera takes the photo or selfie (or a picture is picked from the phone). Then: send it to
// someone, keep it in your photos, or post it on your profile.

type Picture = { blob: Blob; url: string; width: number; height: number; kind: "photo" | "selfie" };

export function LiteCamera({
  region,
  city,
  centre,
  onClose,
  onMessage,
}: {
  region: string;
  city: string | null;
  /** Where you are (the people nearest you come first when sending). */
  centre: () => { x: number; z: number };
  onClose: () => void;
  onMessage: (text: string, ok: boolean) => void;
}) {
  const back = useRef<HTMLInputElement>(null);
  const front = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [pic, setPic] = useState<Picture | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { post } = usePostPhoto(() => {}, onMessage);
  const url = pic?.url ?? null;
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  const take = (kind: Picture["kind"]) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setError(null);
    const blob = await asJpeg(f);
    if (!blob) return setError("That picture couldn't be used. Try another one.");
    const size = await createImageBitmap(blob)
      .then((b) => {
        const s = { width: b.width, height: b.height };
        b.close();
        return s;
      })
      .catch(() => ({ width: 0, height: 0 }));
    setPic({ blob, url: URL.createObjectURL(blob), ...size, kind });
  };

  const sendTo = async (p: { id: string; name: string }) => {
    if (!pic) return;
    setSending(false);
    setBusy(`Sending to ${p.name}…`);
    const form = new FormData();
    form.set("image", new File([pic.blob], "photo.jpg", { type: "image/jpeg" }));
    form.set("to", p.id);
    const res = await sendPhoto(form).catch(() => ({ ok: false as const, error: "The connection blinked. Try again." }));
    setBusy(null);
    if (!res.ok) return onMessage(res.error, false);
    announceChatSent(res.message);
    onMessage(`Sent to ${p.name}.`, true);
    onClose();
  };
  const keep = async () => {
    if (!pic) return;
    setBusy("Saving…");
    const why = await addShot(pic, { place: null, city }, false);
    setBusy(null);
    if (why) return onMessage(why, false);
    onMessage("Saved to your photos.", true);
    onClose();
  };
  const postIt = async () => {
    if (!pic) return;
    setBusy("Posting…");
    const ok = await post(new File([pic.blob], "photo.jpg", { type: "image/jpeg" }), "");
    setBusy(null);
    if (ok) onClose();
  };

  const inputs = (
    <>
      <input ref={back} type="file" accept="image/*" capture="environment" className="hidden" onChange={take("photo")} />
      <input ref={front} type="file" accept="image/*" capture="user" className="hidden" onChange={take("selfie")} />
      <input ref={file} type="file" accept="image/*" className="hidden" onChange={take("photo")} />
    </>
  );

  if (!pic)
    return (
      <Sheet onClose={onClose} title="Take a picture">
        {inputs}
        <div className="grid grid-cols-2 gap-2.5">
          <button onClick={() => back.current?.click()} className="flex h-24 flex-col items-center justify-center gap-2 rounded-[20px] bg-[#7048e8] text-base font-extrabold text-white">
            <Camera className="size-7" /> Photo
          </button>
          <button onClick={() => front.current?.click()} className="flex h-24 flex-col items-center justify-center gap-2 rounded-[20px] bg-[#7048e8] text-base font-extrabold text-white">
            <User className="size-7" /> Selfie
          </button>
          <button onClick={() => file.current?.click()} className="col-span-2 flex h-14 items-center justify-center gap-2 rounded-[18px] bg-panel-2 text-base font-extrabold">
            <ImageIcon className="size-5" /> From your phone
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-hit">{error}</p>}
      </Sheet>
    );

  return (
    <OnTopPage role="dialog" aria-modal="true" aria-label="Your picture" className="fixed inset-0 flex flex-col bg-black text-white">
      {inputs}
      <div className="flex items-center justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button onClick={() => setPic(null)} className="h-11 rounded-full bg-white/10 px-4 text-sm font-bold">
          Take another
        </button>
        <button onClick={onClose} className="grid size-11 place-items-center rounded-full bg-white/10" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>
      <div className="grid min-h-0 flex-1 place-items-center px-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pic.url} alt="Your picture" className="max-h-full max-w-full rounded-2xl object-contain" />
      </div>
      <div className="mx-auto grid w-full max-w-xl gap-2.5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {busy ? (
          <p className="flex h-14 items-center justify-center text-base font-bold">{busy}</p>
        ) : (
          <>
            <button onClick={() => setSending(true)} className="flex h-14 items-center justify-center gap-2 rounded-[18px] bg-[#7048e8] text-base font-extrabold">
              <Send className="size-5" /> Send to someone
            </button>
            <div className="grid grid-cols-2 gap-2.5">
              <button onClick={() => void keep()} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white/15 text-sm font-extrabold">
                <ImageIcon className="size-5" /> Save to my photos
              </button>
              <button onClick={() => void postIt()} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white/15 text-sm font-extrabold">
                <UserRound className="size-5" /> Post to my profile
              </button>
            </div>
          </>
        )}
      </div>
      {sending && (
        <Sheet onClose={() => setSending(false)} title="Send to…">
          <div className="flex h-[60dvh] flex-col text-ink">
            <PeopleList region={region} compact action="Send" centre={centre} onMessage={(p) => void sendTo(p)} onPerson={(id) => void sendTo({ id, name: cardPreview(id)?.name ?? "them" })} />
          </div>
        </Sheet>
      )}
    </OnTopPage>
  );
}

"use client";

import { useState } from "react";
import { Award, Share2 } from "lucide-react";
import { CERT_LABEL } from "@/lib/world/living";
import type { Cert } from "@/lib/world/work";
import { Sheet } from "../sheet";

// A course finished: congratulations, and the certificate (with your name) to keep or share.

export function CertificateSheet({ name, title, cert, at, onClose }: { name: string; title: string; cert: string | null; at: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const date = new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const award = cert ? (CERT_LABEL[cert as Cert] ?? title) : title;
  const share = async () => {
    const text = `I just finished ${title} in Newtown! 🎓`;
    try {
      if (navigator.share) await navigator.share({ title: "Certificate", text, url: `${location.origin}/play` });
      else {
        await navigator.clipboard.writeText(`${text} ${location.origin}/play`);
        setCopied(true);
      }
    } catch {
      // Closed the share sheet.
    }
  };
  return (
    <Sheet onClose={onClose} wide>
      <p className="text-center font-display text-2xl font-extrabold">🎉 Congratulations!</p>
      <p className="mt-1 text-center text-sm text-muted">You finished {title}. Your new skill counts at work from today.</p>
      {/* The certificate itself. */}
      <div className="mt-4 rounded-2xl bg-[#fffaf0] p-1.5 shadow-inner ring-1 ring-[#e9d8a6]">
        <div className="rounded-xl border-2 border-double border-[#c9a227] px-4 py-6 text-center text-[#3d2f00]">
          <Award className="mx-auto size-10 text-[#c9a227]" />
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.25em]">Newtown · Lagos</p>
          <p className="mt-1 font-display text-xl font-extrabold">{cert ? "Certificate of Completion" : "Certificate of Achievement"}</p>
          <p className="mt-3 text-xs">This is to certify that</p>
          <p className="mt-1 font-display text-2xl font-extrabold italic">{name}</p>
          <p className="mt-2 text-xs">has successfully completed</p>
          <p className="mt-1 font-semibold">{title}</p>
          {award !== title && <p className="mt-1 text-sm">and is awarded the {award}</p>}
          <p className="mt-4 text-[11px] text-[#7a6420]">{date}</p>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button onClick={() => void share()} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-ink/5 text-sm font-semibold">
          <Share2 className="size-4" /> {copied ? "Copied!" : "Share"}
        </button>
        <button onClick={onClose} className="h-11 flex-1 rounded-full bg-ink text-sm font-semibold text-white">
          Brilliant
        </button>
      </div>
    </Sheet>
  );
}

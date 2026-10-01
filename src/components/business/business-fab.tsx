"use client";

import { Gift, Plus, ReceiptText, Share2, Ticket } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RecordPurchaseModal } from "@/components/business/record-purchase";
import { Modal } from "@/components/ui/modal";
import { ShareLink } from "@/components/ui/share-actions";
import { cn } from "@/lib/cn";

/** Round "+" button with the business's most common actions. */
export function BusinessFab({
  bizId,
  currency,
  joinUrl,
  joinMessage,
  businessName,
}: {
  bizId: string;
  currency: string;
  joinUrl: string;
  joinMessage: string;
  businessName: string;
}) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"purchase" | "share" | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const item = "flex h-12 items-center gap-3 rounded-2xl bg-white pr-5 pl-3 text-[15px] font-semibold text-ink shadow-lift ring-1 ring-line transition hover:bg-canvas";
  const icon = "flex size-8 items-center justify-center rounded-xl bg-brand-50 text-brand-700";

  return (
    <>
      {open && <div aria-hidden className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[1px]" onClick={() => setOpen(false)} />}
      <div className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-end gap-3 lg:right-8 lg:bottom-8">
        {open && (
          <div id="quick-actions" className="flex animate-fade-up flex-col items-end gap-2">
            <button
              type="button"
              className={item}
              onClick={() => {
                setOpen(false);
                setDialog("purchase");
              }}
            >
              <span className={icon}>
                <ReceiptText className="size-4" aria-hidden />
              </span>
              Record a purchase
            </button>
            <Link href={`/dashboard/${bizId}/rewards`} className={item} onClick={() => setOpen(false)}>
              <span className={icon}>
                <Ticket className="size-4" aria-hidden />
              </span>
              Give a perk
            </Link>
            <button
              type="button"
              className={item}
              onClick={() => {
                setOpen(false);
                setDialog("share");
              }}
            >
              <span className={icon}>
                <Share2 className="size-4" aria-hidden />
              </span>
              Share your link
            </button>
            <Link href={`/dashboard/${bizId}/perks?new=1`} className={item} onClick={() => setOpen(false)}>
              <span className={icon}>
                <Gift className="size-4" aria-hidden />
              </span>
              Add a perk
            </Link>
          </div>
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="quick-actions"
          aria-label={open ? "Close quick actions" : "Quick actions"}
          onClick={() => setOpen((o) => !o)}
          className="flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lift transition hover:bg-brand-700 active:scale-95"
        >
          <Plus className={cn("size-7 transition-transform", open && "rotate-45")} aria-hidden />
        </button>
      </div>

      <RecordPurchaseModal bizId={bizId} currency={currency} open={dialog === "purchase"} onClose={() => setDialog(null)} />
      <Modal
        open={dialog === "share"}
        onClose={() => setDialog(null)}
        title="Share your link"
        description={`Customers join ${businessName} from this link.`}
      >
        <ShareLink url={joinUrl} message={joinMessage} title={`Join ${businessName}`} />
      </Modal>
    </>
  );
}

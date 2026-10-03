"use client";

import { Gift, Plus, ReceiptText, Share2, Ticket } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent } from "react";
import { RecordPurchaseModal } from "@/components/business/record-purchase";
import { Modal } from "@/components/ui/modal";
import { ShareLink } from "@/components/ui/share-actions";
import { cn } from "@/lib/cn";

// Where the button sits: which side of the screen, and how far up from the
// bottom (px). Saved on the device so it stays where the owner put it.
type FabSpot = { side: "left" | "right"; bottom: number };
const SPOT_KEY = "spendbox:fab-spot";
const SPOT_EVENT = "spendbox:fab-spot";

function readSpot(): string | null {
  try {
    return localStorage.getItem(SPOT_KEY);
  } catch {
    return null;
  }
}

function saveSpot(spot: FabSpot) {
  try {
    localStorage.setItem(SPOT_KEY, JSON.stringify(spot));
  } catch {
    // Private mode: it just won't be remembered.
  }
  window.dispatchEvent(new Event(SPOT_EVENT));
}

function useSpot(): FabSpot | null {
  const raw = useSyncExternalStore(
    (onChange) => {
      window.addEventListener(SPOT_EVENT, onChange);
      return () => window.removeEventListener(SPOT_EVENT, onChange);
    },
    readSpot,
    () => null,
  );
  if (!raw) return null;
  try {
    const spot = JSON.parse(raw) as FabSpot;
    return (spot.side === "left" || spot.side === "right") && Number.isFinite(spot.bottom) ? spot : null;
  } catch {
    return null;
  }
}

/** Round "+" button with the business's most common actions. Drag it anywhere; it snaps to the nearest side. */
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
  const spot = useSpot();
  const [dragAt, setDragAt] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    drag.current = { startX: e.clientX, startY: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 8) return;
    d.moved = true;
    setOpen(false);
    setDragAt({ x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    justDragged.current = true;
    // Snap to the nearer side, kept clear of the top bar and the phone tab bar.
    const height = window.innerHeight;
    const minBottom = window.innerWidth < 1024 ? 88 : 24;
    const bottom = Math.round(Math.min(Math.max(height - e.clientY - 28, minBottom), height - 140));
    saveSpot({ side: e.clientX < window.innerWidth / 2 ? "left" : "right", bottom });
    setDragAt(null);
  };

  const side = spot?.side ?? "right";
  const placed: CSSProperties | undefined = dragAt
    ? { left: dragAt.x - 28, top: dragAt.y - 28, right: "auto", bottom: "auto" }
    : spot
      ? { [side]: 16, [side === "left" ? "right" : "left"]: "auto", bottom: spot.bottom }
      : undefined;
  // Open the menu downward when the button sits in the top half of the screen.
  const menuBelow = Boolean(spot && typeof window !== "undefined" && spot.bottom > window.innerHeight / 2);

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
      <div
        style={placed}
        className={cn(
          "fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex gap-3 lg:right-8 lg:bottom-8",
          menuBelow ? "flex-col-reverse" : "flex-col",
          side === "left" ? "items-start" : "items-end",
        )}
      >
        {open && (
          <div id="quick-actions" className={cn("flex animate-fade-up flex-col gap-2", side === "left" ? "items-start" : "items-end")}>
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
          title="Tap for quick actions · drag to move"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null;
            setDragAt(null);
          }}
          onClick={() => {
            // A drag ends with a click event too; only a tap opens the menu.
            if (justDragged.current) {
              justDragged.current = false;
              return;
            }
            setOpen((o) => !o);
          }}
          className={cn(
            "flex size-14 touch-none items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lift transition hover:bg-brand-700 active:scale-95",
            dragAt && "scale-110 cursor-grabbing shadow-2xl",
          )}
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

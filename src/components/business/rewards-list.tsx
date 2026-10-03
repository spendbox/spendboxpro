"use client";

import { CalendarClock, Check, ChevronRight, Undo2, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { redeemReward } from "@/app/dashboard/[bizId]/actions";
import { PerkIcon } from "@/components/perks/perk-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { formatDate, memberLabel, memberNo } from "@/lib/format";
import { PERK_KINDS } from "@/lib/perks";
import type { BusinessRewardRow } from "@/lib/types";

/** The perk in full, who it's for, and the button to mark it as given (or undo). */
function PerkDetails({ bizId, reward, onDone }: { bizId: string; reward: BusinessRewardRow; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const given = reward.status === "redeemed";
  const kind = PERK_KINDS[reward.kind];
  return (
    <div className="flex flex-col gap-5">
      <div className="relative isolate flex flex-col gap-4 overflow-hidden rounded-3xl p-5 text-white" style={{ background: kind.color }}>
        <div aria-hidden className="absolute -top-14 -right-12 -z-10 size-44 rounded-full bg-white/10" />
        <span className="flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
          <PerkIcon kind={reward.kind} className="size-3.5" /> {kind.label}
        </span>
        <p className="font-display text-2xl leading-tight font-extrabold break-words">{reward.title}</p>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-white/90">
          <CalendarClock className="size-4" aria-hidden />
          {given && reward.redeemed_at
            ? `Given ${formatDate(reward.redeemed_at, { withYear: true })}`
            : reward.expires_at
              ? `Use by ${formatDate(reward.expires_at, { withYear: true })}`
              : "No time limit"}
        </p>
      </div>

      <Link
        href={`/dashboard/${bizId}/customers/${reward.membership_id}`}
        className="flex items-center gap-3 rounded-2xl bg-canvas p-4 ring-1 ring-line transition hover:ring-brand-300"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-ink-2 ring-1 ring-line">
          <UserRound className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted">For</span>
          <span className="block font-semibold text-ink">{memberLabel(reward.member_no, reward.member_name)}</span>
          <span className="block text-xs text-muted">
            {reward.member_name ? `${memberNo(reward.member_no)} · ` : ""}earned {formatDate(reward.issued_at, { withYear: true })}
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
      </Link>

      <FormMessage>{error}</FormMessage>
      <Button
        size="lg"
        block
        variant={given ? "secondary" : "primary"}
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await redeemReward(bizId, reward.id, !given);
            if (r && "error" in r && r.error) setError(r.error);
            else onDone();
          })
        }
      >
        {!pending && (given ? <Undo2 className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />)}
        {given ? "Undo — it wasn't given" : "Mark as given"}
      </Button>
      <p className="text-center text-xs text-muted">The customer sees this in their Audits.</p>
    </div>
  );
}

/** Perks to give (or given). Tap one to see it in full. */
export function RewardsList({
  bizId,
  rewards,
  initialOpen,
}: {
  bizId: string;
  rewards: BusinessRewardRow[];
  /** Opened straight away (e.g. from a link the customer shared). */
  initialOpen?: BusinessRewardRow | null;
}) {
  const [open, setOpen] = useState<BusinessRewardRow | null>(initialOpen ?? null);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  // Closing a perk opened from a shared link drops "?perk=" so it doesn't open again.
  const close = () => {
    setOpen(null);
    if (search.get("perk")) {
      const next = new URLSearchParams(search);
      next.delete("perk");
      router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  };
  return (
    <>
      {rewards.length > 0 && (
        <Card className="divide-y divide-line overflow-hidden">
          {rewards.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setOpen(r)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-canvas sm:px-5"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: PERK_KINDS[r.kind].color }}>
                <PerkIcon kind={r.kind} className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold break-words text-ink">{r.title}</span>
                <span className="block truncate text-sm text-muted">
                  {memberLabel(r.member_no, r.member_name)} ·{" "}
                  {r.status === "redeemed" && r.redeemed_at ? `given ${formatDate(r.redeemed_at)}` : `earned ${formatDate(r.issued_at)}`}
                </span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
            </button>
          ))}
        </Card>
      )}
      <Modal open={open !== null} onClose={close} title={open?.status === "redeemed" ? "Perk given" : "Perk to give"}>
        {open && <PerkDetails bizId={bizId} reward={open} onDone={close} />}
      </Modal>
    </>
  );
}

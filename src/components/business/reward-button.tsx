"use client";

import { Check, Undo2 } from "lucide-react";
import { useTransition } from "react";
import { redeemReward } from "@/app/dashboard/[bizId]/actions";
import { Button } from "@/components/ui/button";

export function RewardButton({ bizId, rewardId, given }: { bizId: string; rewardId: string; given: boolean }) {
  const [pending, startTransition] = useTransition();
  const toggle = () => startTransition(async () => void (await redeemReward(bizId, rewardId, !given)));
  return given ? (
    <Button size="sm" variant="ghost" disabled={pending} onClick={toggle}>
      <Undo2 className="size-4" aria-hidden /> Undo
    </Button>
  ) : (
    <Button size="sm" disabled={pending} onClick={toggle}>
      <Check className="size-4" aria-hidden /> Mark as given
    </Button>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function LeaveButton({ businessName, action }: { businessName: string; action: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-red-700 hover:underline">
        Leave {businessName}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Leave ${businessName}?`}
        description="They will stop seeing your requests, and your unused perks there will be removed. You can join again later from their link."
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Stay
          </Button>
          <Button variant="danger" loading={pending} onClick={() => startTransition(() => action())}>
            Leave
          </Button>
        </div>
      </Modal>
    </>
  );
}

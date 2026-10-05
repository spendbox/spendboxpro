"use client";

import { useState } from "react";
import { BirthdayEditor } from "@/app/me/profile/profile-cards";
import { StepRow, stepClass } from "@/components/ui/checklist";
import { Modal } from "@/components/ui/modal";
import type { Profile } from "@/lib/types";

/** "Add your birthday", done right here in a pop-up. */
export function BirthdayStep({ profile, label, note }: { profile: Profile | null; label: string; note: string }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={stepClass}>
        <StepRow done={false} label={label} note={note} arrow />
      </button>
      <Modal open={open} onClose={close} title="Your birthday" description="Your plugs can send you a treat. They only see it if you share your details with them.">
        {open && <BirthdayEditor profile={profile} close={close} />}
      </Modal>
    </>
  );
}

"use client";

import { Share2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ShareLink } from "@/components/ui/share-actions";

/** A button that opens a pop-up with a link to copy or send. */
export function ShareButton({
  url,
  message,
  title,
  description,
  label = "Share",
  whatsappTo,
  whatsappLabel,
  variant = "secondary",
  size = "md",
  className,
  icon,
  children,
}: {
  url: string;
  message: string;
  title: string;
  description?: ReactNode;
  label?: string;
  whatsappTo?: string | null;
  whatsappLabel?: string;
  variant?: "primary" | "secondary" | "soft" | "light" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  icon?: ReactNode;
  /** Extra content above the link (e.g. what the friend gets). */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        {icon ?? <Share2 className="size-4" aria-hidden />} {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} description={description}>
        <div className="flex flex-col gap-4">
          {children}
          <ShareLink url={url} message={message} title={title} whatsappTo={whatsappTo} whatsappLabel={whatsappLabel} />
        </div>
      </Modal>
    </>
  );
}

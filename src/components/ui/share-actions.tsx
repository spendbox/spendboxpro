"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { whatsappLink } from "@/lib/format";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.14c-.24.68-1.42 1.3-1.95 1.34-.5.05-.97.23-3.26-.68-2.76-1.09-4.5-3.91-4.64-4.09-.13-.18-1.1-1.47-1.1-2.8 0-1.33.7-1.99.95-2.26.24-.27.53-.34.71-.34l.51.01c.16.01.38-.06.6.46.23.54.77 1.87.84 2.01.07.13.11.29.02.47-.09.18-.13.29-.27.45-.13.16-.28.35-.4.47-.13.13-.27.28-.12.55.16.27.7 1.15 1.5 1.86 1.03.92 1.9 1.2 2.17 1.34.27.13.42.11.58-.07.16-.18.67-.78.85-1.05.18-.27.36-.22.6-.13.25.09 1.57.74 1.84.88.27.13.45.2.51.31.07.11.07.65-.17 1.33Z" />
    </svg>
  );
}

export function CopyButton({ value, label = "Copy link", className, compact }: { value: string; label?: string; className?: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          const input = document.createElement("textarea");
          input.value = value;
          document.body.appendChild(input);
          input.select();
          document.execCommand("copy");
          input.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      aria-label={compact ? label : undefined}
      className={cn(
        compact
          ? "flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-2 hover:bg-black/5"
          : buttonClass({ variant: "secondary" }),
        className,
      )}
    >
      {copied ? <Check className="size-4 text-brand-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {!compact && (copied ? "Copied" : label)}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}

const noopSubscribe = () => () => {};

/** The link in a box, plus Copy, WhatsApp and (on phones) the native share sheet. */
export function ShareLink({
  url,
  message,
  title,
  whatsappTo,
  whatsappLabel = "Share on WhatsApp",
}: {
  url: string;
  message: string;
  title: string;
  /** Send straight to this WhatsApp number (e.g. the business) instead of picking a chat. */
  whatsappTo?: string | null;
  whatsappLabel?: string;
}) {
  const text = `${message} ${url}`;
  const waHref = whatsappTo ? whatsappLink(whatsappTo, text) : `https://wa.me/?text=${encodeURIComponent(text)}`;
  const canShare = useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator.share === "function",
    () => false,
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-2xl bg-canvas py-1.5 pr-1.5 pl-4 ring-1 ring-line">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-2">{url.replace(/^https?:\/\//, "")}</span>
        <CopyButton value={url} compact label="Copy link" />
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={waHref}
          target="_blank"
          rel="noreferrer"
          className={buttonClass({ variant: "primary" }, "flex-1 bg-[#107A42] hover:bg-[#0c6536]")}
        >
          <WhatsAppIcon className="size-5" />
          {whatsappLabel}
        </a>
        {canShare ? (
          <button
            type="button"
            className={buttonClass({ variant: "secondary" })}
            onClick={() => navigator.share({ title, text: message, url }).catch(() => {})}
          >
            <Share2 className="size-4" aria-hidden />
            More
          </button>
        ) : (
          <CopyButton value={url} />
        )}
      </div>
    </div>
  );
}

export { WhatsAppIcon };

/** The link on one line with Copy and WhatsApp buttons, for tight spaces. */
export function ShareLinkBar({ url, message, extra }: { url: string; message: string; extra?: ReactNode }) {
  const waHref = `https://wa.me/?text=${encodeURIComponent(`${message} ${url}`)}`;
  return (
    <div className="flex items-center gap-1.5 rounded-2xl bg-white py-1.5 pr-1.5 pl-4 shadow-card ring-1 ring-line">
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-2">{url.replace(/^https?:\/\//, "")}</span>
      <CopyButton value={url} compact label="Copy link" />
      {extra}
      <a
        href={waHref}
        target="_blank"
        rel="noreferrer"
        aria-label="Share on WhatsApp"
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#107A42] px-3 text-sm font-semibold text-white hover:bg-[#0c6536]"
      >
        <WhatsAppIcon className="size-5" />
        <span className="hidden sm:inline">Share</span>
      </a>
    </div>
  );
}

import Link from "next/link";
import { cn } from "@/lib/cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8", className)}>
      <rect width="32" height="32" rx="9" fill="#0B6E4F" />
      <circle cx="16" cy="10.5" r="3.75" fill="#FFD8C2" />
      <path d="M7.5 15.5h17v6.5a3.5 3.5 0 0 1-3.5 3.5H11A3.5 3.5 0 0 1 7.5 22z" fill="#fff" />
      <rect x="12.5" y="15.5" width="7" height="2" rx="1" fill="#0B6E4F" />
    </svg>
  );
}

export function Logo({ href = "/", className, tone = "dark" }: { href?: string; className?: string; tone?: "dark" | "light" }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2", className)} aria-label="Spendbox home">
      <LogoMark />
      <span
        className={cn(
          "font-display text-[22px] leading-none font-extrabold tracking-tight",
          tone === "dark" ? "text-brand-700" : "text-white",
        )}
      >
        spendbox
      </span>
    </Link>
  );
}

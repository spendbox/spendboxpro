import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "green" | "amber" | "gray" | "red" | "violet" | "solid";

const tones: Record<Tone, string> = {
  green: "bg-brand-50 text-brand-800",
  amber: "bg-amber-50 text-amber-900",
  gray: "bg-black/5 text-ink-2",
  red: "bg-red-50 text-red-800",
  violet: "bg-violet-50 text-violet-900",
  solid: "bg-accent-600 text-white",
};

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

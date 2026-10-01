import { Cake, Coins, Repeat, Sparkles, UserPlus, type LucideProps } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PERK_KINDS, perkTrigger } from "@/lib/perks";
import type { PerkKind } from "@/lib/types";

const ICONS: Record<PerkKind, (props: LucideProps) => ReactNode> = {
  welcome: Sparkles,
  visits: Repeat,
  referral: UserPlus,
  spend: Coins,
  birthday: Cake,
};

export function PerkIcon({ kind, ...props }: { kind: PerkKind } & LucideProps) {
  const Icon = ICONS[kind];
  return <Icon aria-hidden {...props} />;
}

/** A perk shown as a colourful loyalty card. */
export function PerkCard({
  kind,
  title,
  threshold,
  details,
  currency,
  paused,
  footer,
  audience = "business",
  className,
  size = "lg",
}: {
  kind: PerkKind;
  title: string;
  threshold?: number | null;
  details?: string | null;
  currency?: string;
  paused?: boolean;
  footer?: ReactNode;
  audience?: "business" | "customer";
  className?: string;
  size?: "lg" | "sm";
}) {
  const info = PERK_KINDS[kind];
  return (
    <div
      className={cn(
        "relative isolate flex flex-col justify-between overflow-hidden text-white",
        size === "lg" ? "min-h-48 rounded-3xl p-5 sm:min-h-52" : "min-h-36 rounded-2xl p-4",
        paused && "grayscale-[85%]",
        className,
      )}
      style={{ background: info.color }}
    >
      <div aria-hidden className="absolute -top-12 -right-12 -z-10 size-44 rounded-full bg-white/10" />
      <div aria-hidden className="absolute -bottom-20 -left-10 -z-10 size-48 rounded-full bg-black/10" />

      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">
          <PerkIcon kind={kind} className="size-3.5" />
          {info.label}
        </span>
        {paused && <span className="rounded-full bg-black/25 px-2.5 py-1 text-xs font-semibold">Paused</span>}
      </div>

      <div className={size === "lg" ? "mt-6" : "mt-4"}>
        <p className={cn("font-display leading-tight font-bold", size === "lg" ? "text-2xl" : "text-lg")}>{title}</p>
        <p className="mt-1.5 text-sm text-white/90">{perkTrigger(kind, threshold ?? null, currency, audience)}</p>
        {details && <p className="mt-1 text-xs text-white/90">{details}</p>}
      </div>
      {footer && <div className="mt-4">{footer}</div>}
    </div>
  );
}

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageHeader({
  title,
  description,
  back,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      {back && (
        <Link
          href={back.href}
          className="-ml-1 inline-flex w-fit items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-semibold text-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight text-ink sm:text-[32px]">
            {title}
          </h1>
          {description && <p className="mt-1 text-[15px] text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

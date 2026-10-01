import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark" | "soft" | "light";
type Size = "sm" | "md" | "lg";

interface StyleProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

const base =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold transition-colors disabled:pointer-events-none disabled:opacity-60";

const sizes: Record<Size, string> = {
  sm: "h-9 rounded-lg px-3 text-sm",
  md: "h-11 rounded-xl px-4 text-[15px]",
  lg: "h-13 rounded-2xl px-5 text-base",
};

const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800",
  secondary: "bg-white text-ink ring-1 ring-inset ring-line-strong hover:bg-canvas",
  ghost: "text-ink-2 hover:bg-black/5",
  danger: "bg-white text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50",
  dark: "bg-ink text-white hover:bg-ink-2",
  soft: "bg-brand-50 text-brand-700 hover:bg-brand-100",
  light: "bg-white/15 text-white ring-1 ring-inset ring-white/25 hover:bg-white/25",
};

export function buttonClass({ variant = "primary", size = "md", block }: StyleProps, className?: string) {
  return cn(base, sizes[size], variants[variant], block && "w-full", className);
}

export function Button({
  variant,
  size,
  block,
  className,
  type = "button",
  loading,
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & StyleProps & { loading?: boolean }) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, block }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant, size, block, className, ...props }: ComponentProps<typeof Link> & StyleProps) {
  return <Link className={buttonClass({ variant, size, block }, className)} {...props} />;
}

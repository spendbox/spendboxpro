import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

const sizes = {
  sm: "size-9 rounded-xl text-xs",
  md: "size-12 rounded-2xl text-sm",
  lg: "size-16 rounded-[20px] text-lg",
};

export function BusinessAvatar({
  name,
  color,
  size = "md",
  className,
}: {
  name: string;
  color?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center font-display font-bold text-white", sizes[size], className)}
      style={{ background: color ?? "#0B6E4F" }}
    >
      {initials(name)}
    </div>
  );
}

export function PersonAvatar({ name, className }: { name: string | null; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-800",
        className,
      )}
    >
      {name ? initials(name) : "#"}
    </div>
  );
}

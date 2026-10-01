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
  logoUrl,
  size = "md",
  className,
}: {
  name: string;
  color?: string | null;
  logoUrl?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- logos come from Supabase Storage
      <img
        src={logoUrl}
        alt=""
        aria-hidden
        className={cn("shrink-0 bg-white object-cover ring-1 ring-black/5", sizes[size], className)}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center font-display font-bold text-white", sizes[size], className)}
      style={{ background: color ?? "#2A772C" }}
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

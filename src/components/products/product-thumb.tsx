import { Play } from "lucide-react";
import { cn } from "@/lib/cn";

/** The still picture for a product: its photo, or a video's still frame. */
export function ProductThumb({
  mediaType,
  mediaUrl,
  posterUrl,
  className,
  showPlay = true,
}: {
  mediaType: "image" | "video";
  mediaUrl: string;
  posterUrl: string | null;
  className?: string;
  showPlay?: boolean;
}) {
  const still = mediaType === "image" ? mediaUrl : posterUrl;
  return (
    <span className={cn("relative block overflow-hidden bg-canvas", className)}>
      {still ? (
        // eslint-disable-next-line @next/next/no-img-element -- product media comes from Supabase Storage
        <img src={still} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        <video src={`${mediaUrl}#t=0.5`} muted playsInline preload="metadata" className="size-full object-cover" />
      )}
      {mediaType === "video" && showPlay && (
        <span className="absolute right-1.5 bottom-1.5 flex size-6 items-center justify-center rounded-full bg-black/55 text-white">
          <Play className="size-3 fill-current" aria-hidden />
        </span>
      )}
    </span>
  );
}

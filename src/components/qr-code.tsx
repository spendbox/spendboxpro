import QRCode from "qrcode";
import { cn } from "@/lib/cn";

/** Server-rendered QR code (an inline SVG, so it is crisp at any size). */
export async function QrCode({ value, className, label }: { value: string; className?: string; label: string }) {
  const svg = await QRCode.toString(value, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#14201A", light: "#FFFFFF" },
  });
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("aspect-square overflow-hidden rounded-2xl bg-white p-2 ring-1 ring-line [&_svg]:size-full", className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

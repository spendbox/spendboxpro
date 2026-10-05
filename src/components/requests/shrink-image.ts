/**
 * Shrinks a photo in the browser before upload (longest side 1600px, JPEG),
 * so a few photos stay small enough to send quickly on mobile data.
 *
 * When a photo can't be opened it throws a message that says why, as best the
 * browser can tell: it's still downloading (an empty file from iCloud or
 * Google Photos), it's an iPhone HEIC photo this browser can't open, it's
 * huge, it took too long, or it isn't a photo at all.
 */

const MB = 1024 * 1024;
/** Bigger than this and phones tend to run out of memory opening it. */
const HUGE_BYTES = 40 * MB;
/** Opening a photo shouldn't take longer than this, even on a slow phone. */
const READ_TIMEOUT_MS = 25_000;

const isHeic = (file: File) => /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
/** Photos phones sometimes hand over without a type. */
const looksLikePhoto = (file: File) => file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|hei[cf]|avif)$/i.test(file.name);
const sizeOf = (bytes: number) => (bytes >= MB ? `${Math.round(bytes / MB)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Why a photo couldn't be opened, in words for the person who picked it. */
export function photoProblem(file: File, reason?: "timeout" | "decode" | "memory"): string {
  if (file.size === 0) return "It hasn't finished downloading to this phone (it may still be in iCloud or Google Photos). Open it in your gallery first, then try again.";
  if (!looksLikePhoto(file)) return "It isn't a photo we can open. Please pick a JPG, PNG or WebP photo.";
  if (isHeic(file)) return "It's an iPhone HEIC photo, which this browser can't open. Send it to yourself as a JPG, or on your iPhone set Settings › Camera › Formats to “Most Compatible”.";
  if (reason === "timeout") return `It took too long to open${file.size > 10 * MB ? ` (it's ${sizeOf(file.size)})` : ""}. Try again, or pick a smaller copy of it.`;
  if (reason === "memory" || file.size > HUGE_BYTES) return `It's too large to open on this device (${sizeOf(file.size)}). Try a smaller copy, or a screenshot of it.`;
  return "The file looks damaged or isn't a normal photo. Try opening it in your gallery and saving a copy, then pick that.";
}

const withTimeout = <T>(work: Promise<T>) =>
  Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), READ_TIMEOUT_MS))]);

/** Opens the photo, through the fast path where the browser has it and an <img> where it doesn't. */
async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  try {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    // Some browsers (older Safari, some Android ones) only open certain photos through an <img>.
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  }
}

export async function shrinkImage(file: File, maxSide = 1600, quality = 0.82): Promise<File> {
  if (file.size === 0 || !looksLikePhoto(file)) throw new Error(photoProblem(file));
  let opened: Awaited<ReturnType<typeof decode>>;
  try {
    opened = await withTimeout(decode(file));
  } catch (e) {
    throw new Error(photoProblem(file, (e as Error).message === "timeout" ? "timeout" : "decode"));
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(opened.width, opened.height, 1));
    const width = Math.max(1, Math.round(opened.width * scale));
    const height = Math.max(1, Math.round(opened.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(photoProblem(file, "memory"));
    ctx.drawImage(opened.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error(photoProblem(file, "memory"));
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally {
    opened.close();
  }
}

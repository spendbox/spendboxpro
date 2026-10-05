// Getting product photos and videos ready in the browser, uploading them, and sharing them.

import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, VIDEO_TYPES } from "@/lib/product-rules";
import { shrinkImage } from "@/components/requests/shrink-image";

export interface PreparedMedia {
  type: "image" | "video";
  file: File;
  /** A still frame for videos (JPEG), when the browser can make one. */
  poster: File | null;
  /** Local preview address. */
  previewUrl: string;
}

/** Shrinks a photo, or checks a video and grabs a still frame from it. Throws a friendly message. */
export async function prepareMedia(file: File): Promise<PreparedMedia> {
  if (file.type.startsWith("image/")) {
    const small = await shrinkImage(file, 1600, 0.85).catch(() => {
      throw new Error("We couldn't read that photo. Please try another.");
    });
    return { type: "image", file: small, poster: null, previewUrl: URL.createObjectURL(small) };
  }
  if (!file.type.startsWith("video/")) throw new Error("Please pick a photo or a video.");
  // Phones sometimes leave the type off .mov files.
  const type = VIDEO_TYPES[file.type] ? file.type : /\.mov$/i.test(file.name) ? "video/quicktime" : file.type;
  if (!VIDEO_TYPES[type]) throw new Error("Please use an MP4 or MOV video.");
  if (file.size > MAX_VIDEO_BYTES) throw new Error("That video is too big. Please keep it under 50 MB (about a minute).");
  const video = file.type === type ? file : new File([file], file.name, { type });
  const previewUrl = URL.createObjectURL(video);
  const { duration, poster } = await readVideo(previewUrl);
  if (duration > MAX_VIDEO_SECONDS + 1) {
    URL.revokeObjectURL(previewUrl);
    throw new Error(`Please keep videos to ${MAX_VIDEO_SECONDS} seconds or less.`);
  }
  return { type: "video", file: video, poster, previewUrl };
}

/** A video's length and a still frame (or null if the browser can't decode it). */
function readVideo(url: string): Promise<{ duration: number; poster: File | null }> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    let duration = 0;
    const done = (poster: File | null) => {
      video.removeAttribute("src");
      video.load();
      resolve({ duration, poster });
    };
    const timer = setTimeout(() => done(null), 8000);
    video.onloadedmetadata = () => {
      duration = Number.isFinite(video.duration) ? video.duration : 0;
      video.currentTime = Math.min(0.5, duration / 2 || 0);
    };
    video.onseeked = () => {
      clearTimeout(timer);
      try {
        const scale = Math.min(1, 1080 / Math.max(video.videoWidth, video.videoHeight, 1));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx || !canvas.width) return done(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => done(blob ? new File([blob], "poster.jpg", { type: "image/jpeg" }) : null), "image/jpeg", 0.8);
      } catch {
        done(null);
      }
    };
    video.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
  });
}

/** Uploads a file to a one-time storage link, reporting progress (0–1). */
export function uploadToSignedUrl(signedUrl: string, file: File, onProgress?: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("cacheControl", "31536000");
    form.append("", file);
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("The upload didn't go through. Please try again.")));
    xhr.onerror = () => reject(new Error("The upload didn't go through. Check your connection and try again."));
    xhr.send(form);
  });
}

/**
 * Opens the phone's share sheet with the photo or video, so it can go straight
 * to a WhatsApp status. Where files can't be shared (most computers), opens
 * WhatsApp with the text and link instead. Returns which one happened.
 */
export async function shareToStatus({ file, mediaUrl, text }: { file?: File | null; mediaUrl?: string; text: string }): Promise<"shared" | "whatsapp" | "cancelled"> {
  let media = file ?? null;
  if (!media && mediaUrl && typeof navigator.canShare === "function") {
    try {
      const blob = await (await fetch(mediaUrl)).blob();
      const ext = blob.type.includes("video") ? "mp4" : "jpg";
      media = new File([blob], `spendbox.${ext}`, { type: blob.type });
    } catch {
      media = null;
    }
  }
  if (media && typeof navigator.canShare === "function" && navigator.canShare({ files: [media] })) {
    try {
      await navigator.share({ files: [media], text });
      return "shared";
    } catch (error) {
      if ((error as Error).name === "AbortError") return "cancelled";
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  return "whatsapp";
}

/** The words that go with a shared product. */
export function shareText(title: string, price: string | null, businessName: string, joinUrl: string) {
  return `${title}${price ? ` · ${price}` : ""}\nSee more from ${businessName} on Spendbox: ${joinUrl}`;
}

/**
 * Shares several products at once: their photos and videos to the share sheet
 * (WhatsApp status or a chat) where the phone allows, or WhatsApp with their
 * names, prices and the link.
 */
export async function shareManyToWhatsApp(items: { mediaUrl?: string; file?: File; title: string; price: string | null }[], businessName: string, joinUrl: string): Promise<"shared" | "whatsapp" | "cancelled"> {
  const text = [`New at ${businessName}:`, ...items.map((i) => `• ${i.title}${i.price ? ` · ${i.price}` : ""}`), `See them all on Spendbox: ${joinUrl}`].join("\n");
  if (typeof navigator.canShare === "function") {
    const files = (
      await Promise.all(
        items.map(async (item, n) => {
          if (item.file) return item.file;
          try {
            const blob = await (await fetch(item.mediaUrl!)).blob();
            return new File([blob], `spendbox-${n + 1}.${blob.type.includes("video") ? "mp4" : "jpg"}`, { type: blob.type });
          } catch {
            return null;
          }
        }),
      )
    ).filter((f): f is File => Boolean(f));
    if (files.length && navigator.canShare({ files })) {
      try {
        await navigator.share({ files, text });
        return "shared";
      } catch (error) {
        if ((error as Error).name === "AbortError") return "cancelled";
      }
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  return "whatsapp";
}

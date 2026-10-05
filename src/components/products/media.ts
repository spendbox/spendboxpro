// Getting product photos and videos ready in the browser, uploading them, and sharing them.

import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, VIDEO_TYPES } from "@/lib/product-rules";
import { shrinkImage } from "@/components/requests/shrink-image";

const MB = 1024 * 1024;

export interface PreparedMedia {
  type: "image" | "video";
  file: File;
  /** A still frame for videos (JPEG), when the browser can make one. */
  poster: File | null;
  /** Local preview address. */
  previewUrl: string;
  /** Width / height, when the browser could tell (frames in the 3D shop fit it). */
  aspect?: number | null;
}

/** A width / height ratio kept to the range the database accepts. */
const ratio = (w: number, h: number) => (w > 0 && h > 0 ? Math.round(Math.min(5, Math.max(0.2, w / h)) * 1000) / 1000 : null);

async function imageAspect(file: Blob) {
  try {
    const bitmap = await createImageBitmap(file);
    const r = ratio(bitmap.width, bitmap.height);
    bitmap.close();
    return r;
  } catch {
    return null;
  }
}

/** Shrinks a photo, or checks a video and grabs a still frame from it. Throws a friendly message. */
export async function prepareMedia(file: File): Promise<PreparedMedia> {
  if (file.type.startsWith("image/") || (!file.type && !/\.(mp4|mov|webm)$/i.test(file.name))) {
    const small = await shrinkImage(file, 1600, 0.85).catch((e: Error) => {
      throw new Error(`We couldn't read that photo. ${e.message}`);
    });
    return { type: "image", file: small, poster: null, previewUrl: URL.createObjectURL(small), aspect: await imageAspect(small) };
  }
  if (!file.type.startsWith("video/")) throw new Error("Please pick a photo or a video.");
  // Phones sometimes leave the type off .mov files.
  const type = VIDEO_TYPES[file.type] ? file.type : /\.mov$/i.test(file.name) ? "video/quicktime" : file.type;
  if (!VIDEO_TYPES[type]) throw new Error("Please use an MP4 or MOV video.");
  if (file.size > MAX_VIDEO_BYTES) throw new Error("That video is too big. Please keep it under 50 MB (about a minute).");
  const video = file.type === type ? file : new File([file], file.name, { type });
  const previewUrl = URL.createObjectURL(video);
  const { duration, poster, aspect } = await readVideo(previewUrl);
  if (duration > MAX_VIDEO_SECONDS + 1) {
    URL.revokeObjectURL(previewUrl);
    throw new Error(`Please keep videos to ${MAX_VIDEO_SECONDS} seconds or less.`);
  }
  return { type: "video", file: video, poster, previewUrl, aspect };
}

/** A video's length and a still frame (or null if the browser can't decode it). */
function readVideo(url: string): Promise<{ duration: number; poster: File | null; aspect: number | null }> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    let duration = 0;
    let aspect: number | null = null;
    const done = (poster: File | null) => {
      video.removeAttribute("src");
      video.load();
      resolve({ duration, poster, aspect });
    };
    const timer = setTimeout(() => done(null), 8000);
    video.onloadedmetadata = () => {
      duration = Number.isFinite(video.duration) ? video.duration : 0;
      aspect = ratio(video.videoWidth, video.videoHeight);
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

/** Why an upload failed, from what the storage server said (or didn't). */
function uploadProblem(status: number, body: string, file: File) {
  if (status === 413 || /too large|exceeded the maximum/i.test(body)) return `It's too big to upload (${Math.round(file.size / MB)} MB). Videos need to be under 50 MB.`;
  if (/mime type|not supported/i.test(body)) return "That kind of file can't be uploaded. Please use a JPG, PNG or WebP photo, or an MP4 or MOV video.";
  if (status === 400 && /signature|expired|token/i.test(body)) return "The upload link ran out. Press Post again.";
  if (status === 409 || /already exists/i.test(body)) return "It's already uploaded. Press Post again.";
  if (status >= 500) return "Our storage is busy right now. Please try again in a minute.";
  return `The upload didn't go through (error ${status}). Please try again.`;
}

/** One try at the upload. Rejects with `retry` set when trying again may help (the connection dropped or stalled). */
function putOnce(signedUrl: string, file: File, onProgress?: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("cacheControl", "31536000");
    form.append("", file);
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    // Long enough for a 50 MB video on slow data, short enough not to hang forever.
    xhr.timeout = Math.max(60_000, (file.size / MB) * 20_000);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    const fail = (message: string, retry: boolean) => reject(Object.assign(new Error(message), { retry }));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : fail(uploadProblem(xhr.status, xhr.responseText ?? "", file), xhr.status >= 500));
    xhr.onerror = () =>
      fail(navigator.onLine === false ? "You're offline. Check your connection, then press Post again." : "The connection dropped while uploading. Check your connection and press Post again.", true);
    xhr.ontimeout = () => fail("The upload took too long (the connection may be slow). Press Post again, or try on Wi-Fi.", true);
    xhr.send(form);
  });
}

/**
 * Uploads a file to a one-time storage link, reporting progress (0–1).
 * First checks the file can still be read on this device (a draft whose photo
 * was removed from the phone can't be), then tries up to three times when the
 * connection drops, and says what went wrong when it can't.
 */
export async function uploadToSignedUrl(signedUrl: string, file: File, onProgress?: (fraction: number) => void): Promise<void> {
  try {
    await file.slice(0, 1).arrayBuffer();
  } catch {
    throw new Error("This photo or video is no longer on this device. Remove it and add it again.");
  }
  for (let attempt = 1; ; attempt++) {
    try {
      return await putOnce(signedUrl, file, onProgress);
    } catch (e) {
      const err = e as Error & { retry?: boolean };
      if (!err.retry || attempt >= 3 || navigator.onLine === false) throw err;
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
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

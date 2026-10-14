"use client";

/**
 * Send the ad wizard's form (with its pictures) to /api/ad-checkout, telling `onProgress` how much
 * has gone up (0..1) as it goes, so the page can show the upload moving. Then the answer.
 */
export function sendAdCheckout(form: FormData, onProgress: (share: number) => void): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/ad-checkout");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
    };
    xhr.upload.onload = () => onProgress(1);
    xhr.onload = () => {
      const body = xhr.response as { ok: boolean; url?: string; error?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300 && body?.ok && body.url) resolve({ ok: true, url: body.url });
      else resolve({ ok: false, error: body?.error ?? "Something went wrong. Please try again." });
    };
    xhr.onerror = () => resolve({ ok: false, error: "The connection dropped while sending. Please check it and try again." });
    xhr.ontimeout = () => resolve({ ok: false, error: "That took too long. Please try again on a better connection." });
    xhr.timeout = 120_000;
    xhr.send(form);
  });
}

/** Bytes as people say them: "820 KB", "1.4 MB". */
export const sizeOf = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

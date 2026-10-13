"use client";

// The phone's own notifications (public/sw.js) and the number on the app's icon: once you've
// read something in the game, its notification goes from the phone too, and the number matches
// what's still waiting. Never throws (not every phone or browser can do this).

type BadgeNav = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

/** Close the phone's notifications with this tag ("dm:<id>", "notice"), or all of them. */
export function closePhoneNotices(tag?: string) {
  try {
    void navigator.serviceWorker
      ?.getRegistration("/sw.js")
      .then((reg) => reg?.getNotifications(tag ? { tag } : undefined))
      .then((list) => list?.forEach((n) => n.close()))
      .catch(() => {});
  } catch {}
}

/** The number on the app's icon: what's still unread. */
export function setPhoneBadge(unread: number) {
  try {
    const nav = navigator as BadgeNav;
    if (unread > 0) void nav.setAppBadge?.(unread).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  } catch {}
}

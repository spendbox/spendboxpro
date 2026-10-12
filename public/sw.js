// Newtown's service worker: shows push notifications (src/lib/push.ts). A push carries nothing;
// what to show is fetched from the game, signed in as you.
self.addEventListener("push", (event) => {
  event.waitUntil(
    fetch("/api/push/latest", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({ title: "Newtown", body: "Something happened in the city.", url: "/play" }))
      .then((n) => self.registration.showNotification(n.title, { body: n.body, icon: "/icon.svg", badge: "/icon.svg", data: { url: n.url || "/play" }, tag: "newtown" })),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/play";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if (c.url.includes("/play") && "focus" in c) return c.focus();
      return self.clients.openWindow(url);
    }),
  );
});

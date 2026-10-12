// Newtown's service worker: shows push notifications (src/lib/push.ts). A push carries nothing;
// what to show is fetched from the game, signed in as you.
self.addEventListener("push", (event) => {
  event.waitUntil(
    fetch("/api/push/latest", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({ title: "Newtown", body: "Something happened in the city.", url: "/play" }))
      .then((n) =>
        // An open game checks for news straight away (the bubble pops up there too).
        self.clients
          .matchAll({ type: "window", includeUncontrolled: true })
          .then((list) => list.forEach((c) => c.postMessage({ type: "newtown-push" })))
          .then(() => self.registration.showNotification(n.title, { body: n.body, icon: "/icon.svg", badge: "/icon.svg", data: { url: n.url || "/play" }, tag: "newtown", renotify: true })),
      ),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/play";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list)
        if ("focus" in c) {
          // The game is open already: take it to the conversation (or whatever this was about).
          c.postMessage({ type: "newtown-open", url });
          return c.focus();
        }
      return self.clients.openWindow(url);
    }),
  );
});

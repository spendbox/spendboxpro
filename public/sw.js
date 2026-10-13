// Newtown's service worker: shows push notifications (src/lib/push.ts). A push carries nothing;
// what to show is fetched from the game, signed in as you. One notification per conversation
// (its tag), replaced as more messages come, and the number on the app's icon kept up to date.
// The game closes a conversation's notification once you've read it there (closeNotices below).
self.addEventListener("push", (event) => {
  event.waitUntil(
    fetch("/api/push/latest", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({ title: "Newtown", body: "Something happened in the city.", url: "/play" }))
      .then((n) =>
        // An open game checks for news straight away (the bubble pops up there too).
        self.clients
          .matchAll({ type: "window", includeUncontrolled: true })
          .then((list) => {
            list.forEach((c) => c.postMessage({ type: "newtown-push" }));
            return list.some((c) => c.focused && c.visibilityState === "visible");
          })
          .then((watching) => {
            if (typeof n.unread === "number" && self.navigator && "setAppBadge" in self.navigator) {
              (n.unread > 0 ? self.navigator.setAppBadge(n.unread) : self.navigator.clearAppBadge()).catch(() => {});
            }
            return self.registration
              .showNotification(n.title, {
                body: n.body,
                icon: "/icon.svg",
                badge: "/icon.svg",
                data: { url: n.url || "/play" },
                tag: n.tag || "newtown",
                renotify: !watching,
                // The game is open in front of you: no buzz, and it goes away by itself.
                silent: watching,
              })
              .then(() => {
                if (!watching) return;
                return new Promise((done) => setTimeout(done, 4000))
                  .then(() => self.registration.getNotifications({ tag: n.tag || "newtown" }))
                  .then((list) => list.forEach((x) => x.close()));
              });
          }),
      ),
  );
});

// The game says something was read: close those notifications and set the icon's number.
self.addEventListener("message", (event) => {
  const d = event.data || {};
  if (d.type !== "newtown-read") return;
  event.waitUntil(
    self.registration.getNotifications().then((list) => {
      for (const x of list) if (!d.tag || x.tag === d.tag) x.close();
      if (typeof d.unread === "number" && self.navigator && "setAppBadge" in self.navigator) {
        return (d.unread > 0 ? self.navigator.setAppBadge(d.unread) : self.navigator.clearAppBadge()).catch(() => {});
      }
    }),
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

self.addEventListener("push", (event) => {
  let payload = { title: "PedeJa", body: "", url: "/" };

  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    // payload sem JSON valido; mantem defaults.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/src/assets/iconSite/logo.png",
      badge: "/src/assets/iconSite/logo.png",
      data: { url: payload.url || "/" },
      vibrate: [200, 100, 200],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});

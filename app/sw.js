// Plejer service worker: gør appen installerbar og modtager påmindelser fra Firebase Cloud Messaging.
importScripts("firebase-config.js");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

if (self.PLEJER_FIREBASE && self.PLEJER_FIREBASE.config) {
  importScripts(
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js"
  );
  firebase.initializeApp(self.PLEJER_FIREBASE.config);
  // Beskeder med en notification-del vises automatisk. Her håndteres kun rene data-beskeder.
  firebase.messaging().onBackgroundMessage((besked) => {
    if (besked.notification) return;
    const d = besked.data || {};
    self.registration.showNotification(d.title || "Plejer", {
      body: d.body || "Noget er over tid.",
      icon: "ikon-192.png",
      badge: "ikon-192.png",
      tag: d.tag || "plejer",
      renotify: true,
      requireInteraction: true,
      data: { url: d.url || "/app/" }
    });
  });
}

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/app/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((vinduer) => {
    for (const v of vinduer) { if (v.url.includes("/app/")) { v.focus(); return; } }
    return self.clients.openWindow(url);
  }));
});

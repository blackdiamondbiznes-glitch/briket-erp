const CACHE = "bd-mijoz-v1";
const ASSETS = ["/mijoz", "/mijoz-manifest.webmanifest", "/mijoz-icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return;
  e.respondWith(
    caches.match(e.request).then(
      (hit) => hit || fetch(e.request).catch(() => caches.match("/mijoz"))
    )
  );
});

// Har deploy'da versiyani oshiring
const CACHE = "bd-mijoz-v2";
const ASSETS = ["/mijoz", "/mijoz-manifest.webmanifest", "/mijoz-icon.svg", "/bd_logo.jpg"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
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

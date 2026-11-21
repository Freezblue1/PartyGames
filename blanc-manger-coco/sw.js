/* Lets the game install as an app and open even with a weak network.
   Network first: a new version of the site shows up as soon as it is online; the saved copy is only a fallback. */
const CACHE = "bmc-v2";
const SHELL = ["./", "index.html", "style.css", "app.js", "config.js", "cards.js", "extensions.js", "gages.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k.startsWith(CACHE.split("-")[0] + "-")).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request).then(hit => hit || caches.match("index.html")))
  );
});

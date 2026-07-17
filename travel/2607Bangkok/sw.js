const CACHE = "travel-bkk-v24";
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll([
    "./",
    "./index.html",
    "./itinerary.html",
    "./ui/style.css",
    "./ui/app.js",
    "./ui/theme.png",
    "./ui/prince.png",
    "./data/site.json",
    "./data/trip.json",
    "./data/guide.json",
    "./data/users.json"
  ])));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

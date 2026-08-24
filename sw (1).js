/* Service Worker — Pedidos Mooving (PWA con actualización automática) */
const CACHE = "pedidos-mooving-v5";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./productos.json",
  "./clientes.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", e => {
  // no fallar la instalación si algún archivo opcional no está
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const dinamico = req.mode === "navigate"
    || url.pathname.endsWith(".html")
    || url.pathname.endsWith(".json")
    || url.pathname === "/" || url.pathname.endsWith("/");

  if (dinamico) {
    // NETWORK-FIRST: con internet trae la última versión; sin internet usa la copia guardada.
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then(hit => hit || (req.mode === "navigate" ? caches.match("./index.html") : undefined)))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => undefined))
  );
});

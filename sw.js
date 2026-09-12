/* Service Worker — Pedidos Mooving (PWA con actualización automática) */
const CACHE = "pedidos-mooving-v22";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./productos.json",
  "./clientes.json",
  "./fotos.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

/* Las fotos de producto NO están en la lista de arriba: cuáles son lo dice
   fotos.json, que puede cambiar sin tocar este archivo. Así que al instalarse
   el Service Worker lo lee y se guarda todas las fotos que ahí figuren.

   Por qué precargarlas y no dejar que se bajen al mirarlas: en la expo puede
   no haber señal, y una foto que nunca se abrió no estaría en el caché. La
   idea es que el vendedor abra la app una vez con internet en su casa y ya
   tenga todo.

   Nada de esto puede hacer fallar la instalación: si no hay fotos.json, si
   está mal escrito o si falta una imagen, se sigue de largo. */
async function guardarFotos(cache) {
  try {
    const r = await fetch("./fotos.json", { cache: "no-store" });
    if (!r.ok) return 0;
    const d = await r.json();
    const carpeta = String((d && d.carpeta) || "fotos").replace(/\/+$/, "");
    const archivos = new Set();
    for (const m of [d && d.porCodigo, d && d.porNombre]) {
      if (m && typeof m === "object") {
        for (const k of Object.keys(m)) if (m[k]) archivos.add(String(m[k]));
      }
    }
    if (!archivos.size) return 0;
    const urls = [...archivos].map(a => "./" + (carpeta ? carpeta + "/" : "") + a);
    const res = await Promise.allSettled(urls.map(u => cache.add(u)));
    return res.filter(x => x.status === "fulfilled").length;
  } catch (e) { return 0; }
}

self.addEventListener("install", e => {
  // no fallar la instalación si algún archivo opcional no está
  e.waitUntil(
    caches.open(CACHE)
      .then(async c => {
        await Promise.allSettled(SHELL.map(u => c.add(u)));
        await guardarFotos(c);
      })
      .then(() => self.skipWaiting())
  );
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

  /* NUNCA tocar las llamadas al servidor de datos (Supabase).
     Son datos que cambian a cada rato y van atados a la sesión del usuario.
     Guardarlas en el caché hacía que el panel del administrador quedara
     congelado en una foto vieja: los pedidos nuevos no aparecían nunca,
     ni tocando el botón de actualizar. */
  if (url.hostname.endsWith(".supabase.co")) return;

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

// Service worker: hace que la app abra sin señal.
//
// Sin esto, un teléfono sin internet no llega ni a la pantalla de entrar,
// por más que el trabajo esté guardado en el equipo. Aquí se guarda copia
// de los archivos de la app y se sirven del cache cuando la red no responde.
//
// Al publicar cambios, sube VERSION. Es lo que hace que los teléfonos
// suelten la copia vieja: el cache lleva la versión en el nombre y al
// activarse el worker nuevo borra los demás.
const VERSION = "v3";
const CACHE = `bitacora-${VERSION}`;

// Lo que se baja de una al instalar: la app entera, supabase-js incluido.
// Solo las fuentes se guardan la primera vez que se piden.
const CASCO = [
  "./", "./index.html", "./app.js", "./local.js", "./config.js",
  "./protocolo.js", "./taller.js", "./informes.js", "./estilo.css", "./manifest.json",
  "./vendor/supabase.js", "./vendor/qr.js",
  "./icono-192.png", "./icono-512.png"
];

// Lo único que queda fuera son las fuentes, y son adorno: estilo.css declara
// alternativas del sistema para cuando no bajan.
const CDN = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", ev => {
  ev.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // uno por uno: si un archivo falla no se cae la instalación entera
    await Promise.all(CASCO.map(u => cache.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", ev => {
  ev.waitUntil((async () => {
    const viejos = (await caches.keys()).filter(k => k.startsWith("bitacora-") && k !== CACHE);
    await Promise.all(viejos.map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function guardar(req, res){
  if(res && (res.ok || res.type === "opaque")){
    const cache = await caches.open(CACHE);
    await cache.put(req, res.clone()).catch(() => {});
  }
  return res;
}

self.addEventListener("fetch", ev => {
  const req = ev.request;
  if(req.method !== "GET") return;

  const url = new URL(req.url);

  // Supabase nunca se guarda. Son los datos de los estudiantes, y servir una
  // copia vieja haría creer que se guardó algo que no se guardó.
  if(url.hostname.endsWith(".supabase.co")) return;

  const mismoOrigen = url.origin === self.location.origin;
  if(!mismoOrigen && !CDN.includes(url.hostname)) return;

  // Del cache primero y se revalida por detrás: abre rápido y sin señal, y
  // la versión nueva queda lista para la próxima vez que abran la app.
  ev.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const guardada = await cache.match(req, { ignoreSearch: !mismoOrigen });

    const red = fetch(req).then(res => guardar(req, res)).catch(() => null);
    if(guardada){ ev.waitUntil(red); return guardada; }

    const res = await red;
    if(res) return res;

    // Sin red y sin copia: si el teléfono pedía una página, dale la app.
    if(req.mode === "navigate"){
      const casco = await cache.match("./index.html") || await cache.match("./");
      if(casco) return casco;
    }
    return new Response("Sin conexión y sin copia guardada.", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  })());
});

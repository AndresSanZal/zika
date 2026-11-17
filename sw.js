/* 字卡 — service worker: hace que la app funcione sin conexión */
const VERSION = "2026-11-17b";
const SHELL = "zika-shell-" + VERSION;
const CHARS = "zika-chars-v1";
const AUDIO = "zika-audio-v1";
const SHELL_FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "lib/hanzi-writer.min.js",
  "lib/pinyin-pro.js",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith("zika-shell-") && k !== SHELL) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // El vocabulario siempre se pide a la red (la app guarda su propia copia)
  if (url.pathname.endsWith("/vocab.json")) return;

  // Trazos y audios: primero la caché, si no la red (y se guardan)
  const dir = url.pathname.includes("/chardata/") ? "chardata/" : url.pathname.includes("/audio/") ? "audio/" : null;
  if (dir) {
    event.respondWith((async () => {
      const c = await caches.open(dir === "audio/" ? AUDIO : CHARS);
      const key = url.pathname.slice(url.pathname.indexOf(dir));
      const hit = await c.match(key);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(key, res.clone());
      return res;
    })());
    return;
  }

  // App: responde al instante desde la caché y se actualiza en segundo plano
  event.respondWith((async () => {
    const c = await caches.open(SHELL);
    const isNav = req.mode === "navigate";
    const cached = isNav ? (await c.match("index.html")) : (await c.match(req, { ignoreSearch: true }));
    const network = fetch(req).then(res => {
      if (res.ok) c.put(isNav ? "index.html" : req, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { event.waitUntil(network); return cached; }
    const res = await network;
    return res || new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  })());
});

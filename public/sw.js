// Cache only application and runtime/model GET requests, never user media.
const APP = "bnedits-app-v1",
  MODELS = "bnedits-models-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP)
      .then((c) =>
        c.addAll(["/", "/assets/logo.png", "/manifest.webmanifest"]),
      ),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith("bnedits-") && name !== APP && name !== MODELS)
          await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  const model =
    [
      "cdn.jsdelivr.net",
      "huggingface.co",
      "cdn-lfs.huggingface.co",
      "storage.googleapis.com",
    ].includes(url.hostname) || /\.(wasm|onnx|task)$/.test(url.pathname);
  const local = url.origin === self.location.origin;
  if (!local && !model) return;
  if (local && req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((r) => {
          if (r.ok) {
            const copy = r.clone();
            caches.open(APP).then((c) => c.put("/", copy));
          }
          return r;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }
  event.respondWith(
    (async () => {
      const cache = await caches.open(model ? MODELS : APP);
      const old = await cache.match(req);
      if (old) return old;
      const response = await fetch(req);
      if (response.ok && response.type !== "opaque") {
        try {
          await cache.put(req, response.clone());
        } catch {
          /* Storage pressure must never prevent editing. */
        }
      }
      return response;
    })(),
  );
});

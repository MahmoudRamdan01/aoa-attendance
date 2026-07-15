const SHELL_CACHE = "aoa-shell-__CACHE_VERSION__";
const ASSET_CACHE = "aoa-assets-__CACHE_VERSION__";
const MODEL_CACHE = "aoa-models-__CACHE_VERSION__";
const PRECACHE = __PRECACHE__;
const MODEL_FILES = PRECACHE.filter((path) => path.includes("/models/") || path.includes("/wasm/"));
const FACE_RUNTIME_FILES = PRECACHE.filter((path) => path.includes("/human.esm-"));
const ON_DEMAND_FILES = [...MODEL_FILES, ...FACE_RUNTIME_FILES];
const ASSET_FILES = PRECACHE.filter((path) => path.includes("/assets/") && !ON_DEMAND_FILES.includes(path));
const SHELL_FILES = PRECACHE.filter((path) => !ON_DEMAND_FILES.includes(path) && !ASSET_FILES.includes(path));

async function addAllSettled(cacheName, files) {
  const cache = await caches.open(cacheName);
  await Promise.allSettled(files.map((file) => cache.add(file)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(Promise.all([
    addAllSettled(SHELL_CACHE, SHELL_FILES),
    addAllSettled(ASSET_CACHE, ASSET_FILES),
  ]).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("aoa-") && ![SHELL_CACHE, ASSET_CACHE, MODEL_CACHE].includes(key))
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response?.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response?.ok) cache.put("./index.html", response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match("./index.html"));
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request));
    return;
  }
  if (url.pathname.includes("/models/") || url.pathname.includes("/wasm/")) {
    event.respondWith(cacheFirst(event.request, MODEL_CACHE));
    return;
  }
  if (url.pathname.includes("/assets/")) {
    event.respondWith(cacheFirst(event.request, ASSET_CACHE));
    return;
  }
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response?.ok) {
        const cache = await caches.open(SHELL_CACHE);
        cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      throw new Error("offline");
    }
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "warm-models") {
    event.waitUntil(addAllSettled(MODEL_CACHE, MODEL_FILES));
  }
});

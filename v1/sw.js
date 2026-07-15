const SHELL_CACHE = "aoa-shell-268fc801f46c";
const ASSET_CACHE = "aoa-assets-268fc801f46c";
const MODEL_CACHE = "aoa-models-268fc801f46c";
const PRECACHE = ["./assets/AdminDashboard-De-edX-H.js","./assets/AssistantView-b73WMHhV.js","./assets/EmployeesView-DHnWsOjb.js","./assets/ExpensesView-CrbYRzXz.js","./assets/OwnerDashboard-QfesRRxy.js","./assets/OwnerLedgerView-D-qS-oE9.js","./assets/PartnerLedgerView-BGiHKuvO.js","./assets/SecuritySettings-vGkmPnrf.js","./assets/alexandria-arabic-600-normal-CG1onHtq.woff2","./assets/alexandria-arabic-600-normal-Cuiz3iHe.woff","./assets/alexandria-arabic-700-normal-D0In6rsA.woff2","./assets/alexandria-arabic-700-normal-DzvlhbG_.woff","./assets/alexandria-latin-600-normal-BS7IWR5e.woff","./assets/alexandria-latin-600-normal-Cb47BBea.woff2","./assets/alexandria-latin-700-normal-9QjHO7f_.woff2","./assets/alexandria-latin-700-normal-BBRdbUeB.woff","./assets/generateCategoricalChart-BQGxysLe.js","./assets/human.esm-Bsmf_kNX.js","./assets/ibm-plex-sans-arabic-arabic-400-normal-CZLC1jgY.woff","./assets/ibm-plex-sans-arabic-arabic-400-normal-CyU-ddYS.woff2","./assets/ibm-plex-sans-arabic-arabic-500-normal-C4MQITzh.woff2","./assets/ibm-plex-sans-arabic-arabic-500-normal-XmtXq_5I.woff","./assets/ibm-plex-sans-arabic-arabic-600-normal-0pRdybE_.woff2","./assets/ibm-plex-sans-arabic-arabic-600-normal-B3qNl98V.woff","./assets/ibm-plex-sans-arabic-arabic-700-normal-COV7B1nq.woff","./assets/ibm-plex-sans-arabic-arabic-700-normal-DrtBj6UE.woff2","./assets/ibm-plex-sans-arabic-latin-400-normal-Bo5KPYvw.woff2","./assets/ibm-plex-sans-arabic-latin-400-normal-sbZiljcy.woff","./assets/ibm-plex-sans-arabic-latin-500-normal-BKKTaxl1.woff","./assets/ibm-plex-sans-arabic-latin-500-normal-Cd6jVIg7.woff2","./assets/ibm-plex-sans-arabic-latin-600-normal-5MnVa4PS.woff","./assets/ibm-plex-sans-arabic-latin-600-normal-KrqB56Mw.woff2","./assets/ibm-plex-sans-arabic-latin-700-normal-BzSf6GNr.woff2","./assets/ibm-plex-sans-arabic-latin-700-normal-C6QlO9CN.woff","./assets/index-Bk4LLUKC.js","./assets/index-Cr9j0J_E.css","./assets/jetbrains-mono-latin-500-normal-BWZEU5yA.woff2","./assets/jetbrains-mono-latin-500-normal-CJOVTJB7.woff","./assets/jetbrains-mono-latin-600-normal-BfsvjouI.woff","./assets/jetbrains-mono-latin-600-normal-C8RAYTDA.woff2","./assets/plus-CTWwyH0A.js","./icon-192.png","./icon-512.png","./icon-maskable-512.png","./icon-maskable.svg","./icon.svg","./index.html","./logo.png","./manifest.webmanifest","./models/antispoof.bin","./models/antispoof.json","./models/blazeface.bin","./models/blazeface.json","./models/facemesh.bin","./models/facemesh.json","./models/faceres.bin","./models/faceres.json","./models/liveness.bin","./models/liveness.json","./sw-killswitch.js","./training/evaluation-form.pdf","./training/training-plan.pdf","./wasm/tfjs-backend-wasm-simd.wasm","./wasm/tfjs-backend-wasm-threaded-simd.wasm","./wasm/tfjs-backend-wasm.wasm"];
const MODEL_FILES = PRECACHE.filter((path) => path.includes("/models/") || path.includes("/wasm/"));
const ASSET_FILES = PRECACHE.filter((path) => path.includes("/assets/"));
const SHELL_FILES = PRECACHE.filter((path) => !MODEL_FILES.includes(path) && !ASSET_FILES.includes(path));

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

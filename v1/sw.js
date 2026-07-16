const SHELL_CACHE = "aoa-shell-7931231c3a4a";
const ASSET_CACHE = "aoa-assets-7931231c3a4a";
const MODEL_CACHE = "aoa-models-7931231c3a4a";
const PRECACHE = ["./assets/AdminDashboard-DKijytVM.js","./assets/AssistantView-DCwmkvdS.js","./assets/EmployeesView-BuHZ3oK4.js","./assets/ExpensesView-UskueJ8b.js","./assets/OwnerDashboard-DGMOOw2b.js","./assets/OwnerLedgerView-DOpVk4t7.js","./assets/PartnerLedgerView-CXkRQWay.js","./assets/SecuritySettings-Dypn8Esp.js","./assets/alexandria-arabic-600-normal-CG1onHtq.woff2","./assets/alexandria-arabic-600-normal-Cuiz3iHe.woff","./assets/alexandria-arabic-700-normal-D0In6rsA.woff2","./assets/alexandria-arabic-700-normal-DzvlhbG_.woff","./assets/alexandria-latin-600-normal-BS7IWR5e.woff","./assets/alexandria-latin-600-normal-Cb47BBea.woff2","./assets/alexandria-latin-700-normal-9QjHO7f_.woff2","./assets/alexandria-latin-700-normal-BBRdbUeB.woff","./assets/generateCategoricalChart-HH4Tc77S.js","./assets/human.esm-Bsmf_kNX.js","./assets/ibm-plex-sans-arabic-arabic-400-normal-CZLC1jgY.woff","./assets/ibm-plex-sans-arabic-arabic-400-normal-CyU-ddYS.woff2","./assets/ibm-plex-sans-arabic-arabic-500-normal-C4MQITzh.woff2","./assets/ibm-plex-sans-arabic-arabic-500-normal-XmtXq_5I.woff","./assets/ibm-plex-sans-arabic-arabic-600-normal-0pRdybE_.woff2","./assets/ibm-plex-sans-arabic-arabic-600-normal-B3qNl98V.woff","./assets/ibm-plex-sans-arabic-arabic-700-normal-COV7B1nq.woff","./assets/ibm-plex-sans-arabic-arabic-700-normal-DrtBj6UE.woff2","./assets/ibm-plex-sans-arabic-latin-400-normal-Bo5KPYvw.woff2","./assets/ibm-plex-sans-arabic-latin-400-normal-sbZiljcy.woff","./assets/ibm-plex-sans-arabic-latin-500-normal-BKKTaxl1.woff","./assets/ibm-plex-sans-arabic-latin-500-normal-Cd6jVIg7.woff2","./assets/ibm-plex-sans-arabic-latin-600-normal-5MnVa4PS.woff","./assets/ibm-plex-sans-arabic-latin-600-normal-KrqB56Mw.woff2","./assets/ibm-plex-sans-arabic-latin-700-normal-BzSf6GNr.woff2","./assets/ibm-plex-sans-arabic-latin-700-normal-C6QlO9CN.woff","./assets/index-51vwDYup.js","./assets/index-DjW1IRJI.css","./assets/jetbrains-mono-latin-500-normal-BWZEU5yA.woff2","./assets/jetbrains-mono-latin-500-normal-CJOVTJB7.woff","./assets/jetbrains-mono-latin-600-normal-BfsvjouI.woff","./assets/jetbrains-mono-latin-600-normal-C8RAYTDA.woff2","./assets/pencil-DRF_1-qp.js","./assets/plus-BAxX0BlX.js","./assets/user-plus-Dicq5fAM.js","./icon-192.png","./icon-512.png","./icon-maskable-512.png","./icon-maskable.svg","./icon.svg","./index.html","./logo.png","./manifest.webmanifest","./models/antispoof.bin","./models/antispoof.json","./models/blazeface.bin","./models/blazeface.json","./models/facemesh.bin","./models/facemesh.json","./models/faceres.bin","./models/faceres.json","./models/liveness.bin","./models/liveness.json","./sw-killswitch.js","./training/evaluation-form.pdf","./training/training-plan.pdf","./wasm/tfjs-backend-wasm-simd.wasm","./wasm/tfjs-backend-wasm-threaded-simd.wasm","./wasm/tfjs-backend-wasm.wasm"];
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

// Web Push: show a system notification (with sound) even when the app/phone is
// closed. Payload comes from the send-push Edge Function.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Air Ocean Line";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: data.tag || "aoa-notification",
    dir: "rtl",
    lang: "ar",
    renotify: true,
    data: { url: data.url || "./#/notifications" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url ? event.notification.data.url : "./#/notifications";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) client.navigate(target).catch(() => {});
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});

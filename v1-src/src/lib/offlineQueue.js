const DB_NAME = "aoa-attendance";
const DB_VERSION = 1;
const STORE = "attendanceQueue";
const LEGACY_KEY = "aoa:v1:offlineAttendanceQueue";

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("المتصفح لا يدعم التخزين الآمن Offline."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("capturedAt", "capturedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("تعذر فتح التخزين Offline."));
  });
}

async function withStore(mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    try {
      result = action(store);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("تعذر تحديث طابور Offline."));
    };
  });
}

export async function enqueueAttendance(item) {
  const row = {
    ...item,
    id: item.id || crypto.randomUUID(),
    capturedAt: item.capturedAt || new Date().toISOString(),
    attempts: item.attempts || 0,
  };
  await withStore("readwrite", (store) => store.put(row));
  return row;
}

export async function updateQueuedAttendance(item) {
  await withStore("readwrite", (store) => store.put(item));
}

export async function removeQueuedAttendance(id) {
  await withStore("readwrite", (store) => store.delete(id));
}

// Sign-out cleanup: purge any queued rows (they hold the raw face template,
// GPS samples and device id) so nothing sensitive survives on a shared device.
export async function clearAttendanceQueue() {
  try {
    if (!("indexedDB" in window)) return;
    await withStore("readwrite", (store) => store.clear());
  } catch {
    /* Best-effort; sign-out must never be blocked by storage errors. */
  }
}

export async function listQueuedAttendance() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => {
      db.close();
      resolve((request.result || []).sort((a, b) => String(a.capturedAt).localeCompare(String(b.capturedAt))));
    };
    request.onerror = () => {
      db.close();
      reject(request.error || new Error("تعذر قراءة طابور Offline."));
    };
  });
}

export async function queuedAttendanceCount() {
  const rows = await listQueuedAttendance();
  return rows.length;
}

export async function migrateLegacyAttendanceQueue() {
  let legacy = [];
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]");
  } catch {
    legacy = [];
  }
  if (!Array.isArray(legacy) || !legacy.length) return 0;
  for (const item of legacy) {
    await enqueueAttendance({
      id: item.id || crypto.randomUUID(),
      kind: item.kind,
      qr: item.qr || "",
      note: item.note || "",
      location: item.location || null,
      deviceId: item.deviceId || null,
      capturedAt: item.at || new Date().toISOString(),
      legacy: true,
    });
  }
  localStorage.removeItem(LEGACY_KEY);
  return legacy.length;
}

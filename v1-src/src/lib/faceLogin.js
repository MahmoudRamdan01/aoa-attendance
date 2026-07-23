// Device-bound "login with your face" convenience.
//
// SECURITY NOTE — read before touching this file:
// Supabase issues a session only for email+password, and an explicit sign-out
// revokes it server-side. To let a returning employee sign in with just their
// face (surviving sign-out, as the owner asked), we must keep a reusable
// credential ON THIS DEVICE. We do that as safely as the browser allows:
//   • the password is encrypted with an AES-GCM key that is generated
//     non-extractable and stored as a live CryptoKey in IndexedDB — it can
//     decrypt on this device but can never be read out or copied elsewhere;
//   • decryption only runs AFTER a live face clears CaptureSheet's full gate
//     (single face, liveness, antispoof, gesture challenge) AND matches the
//     enrolled template above FACE_MATCH_THRESHOLD.
// This is convenience-grade biometrics, not hardened auth: anyone who already
// controls an unlocked, enrolled device could bypass the JS gate. Enrollment
// is opt-in per device and requires the real password once. Nothing here ever
// touches the server — it is purely a local shortcut to the normal login.

import { COMPANY } from "./company";

const DB_NAME = "aoi-face-login";
const STORE = "enrollments";
const DB_VERSION = 1;

// Cosine-similarity gate for the 1024-d faceres template. Fallback to the
// password is always one tap away, so we bias toward fewer false accepts;
// raise this if a device is shared by look-alikes, lower it if the real owner
// gets rejected under bad lighting.
export const FACE_MATCH_THRESHOLD = 0.65;

export function isFaceLoginSupported() {
  return (
    typeof indexedDB !== "undefined" &&
    typeof crypto !== "undefined" &&
    !!crypto.subtle &&
    typeof crypto.subtle.generateKey === "function"
  );
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "email" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTx(mode, work) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        let result;
        Promise.resolve(work(store))
          .then((value) => {
            result = value;
          })
          .catch(reject);
        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function encryptSecret(secret) {
  // extractable = false: the key lives in IndexedDB as an opaque CryptoKey and
  // can never be exported, only used to decrypt on this device.
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(secret),
  );
  return { key, iv, cipher };
}

async function decryptSecret({ key, iv, cipher }) {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return -1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom ? dot / denom : -1;
}

// Enrollments are already origin-scoped (each company is its own build/domain),
// but we tag + filter by company key as belt-and-suspenders.
async function listCompanyEnrollments() {
  const all = await runTx("readonly", (store) => requestAsPromise(store.getAll()));
  return (all || []).filter((record) => record.company === COMPANY.key);
}

export async function hasFaceEnrollment() {
  if (!isFaceLoginSupported()) return false;
  try {
    const records = await listCompanyEnrollments();
    return records.length > 0;
  } catch {
    return false;
  }
}

export async function enrollFace({ email, password, embedding, scores }) {
  if (!isFaceLoginSupported()) throw new Error("face login unsupported");
  if (!Array.isArray(embedding) || embedding.length !== 1024) {
    throw new Error("invalid face template");
  }
  const { key, iv, cipher } = await encryptSecret(password);
  const record = {
    email: normalizeEmail(email),
    company: COMPANY.key,
    embedding: Array.from(embedding),
    key,
    iv,
    cipher,
    scores: scores || null,
    enrolledAt: new Date().toISOString(),
  };
  await runTx("readwrite", (store) => requestAsPromise(store.put(record)));
  return record.email;
}

// Match a freshly captured (already liveness/antispoof-cleared) template
// against enrolled faces on this device. Returns decrypted credentials for the
// best match above threshold, or null.
export async function matchFace(embedding) {
  if (!isFaceLoginSupported() || !Array.isArray(embedding)) return null;
  let records;
  try {
    records = await listCompanyEnrollments();
  } catch {
    return null;
  }
  let best = null;
  let bestScore = -1;
  for (const record of records) {
    const score = cosineSimilarity(embedding, record.embedding);
    if (score > bestScore) {
      bestScore = score;
      best = record;
    }
  }
  if (!best || bestScore < FACE_MATCH_THRESHOLD) return null;
  const password = await decryptSecret(best);
  return { email: best.email, password, score: bestScore };
}

// ---- In-memory hand-off from the login screen to the in-app setup flow ----
// After a successful password login, the credentials are kept ONLY in module
// memory (never persisted) so the post-login "سجّل وشك" offer can enroll
// without asking for the password again. A page refresh clears it naturally.
let stashedCredentials = null;

export function stashCredentialsForEnroll(email, password) {
  stashedCredentials = { email: normalizeEmail(email), password };
}

export function peekStashedCredentials() {
  return stashedCredentials;
}

export function clearStashedCredentials() {
  stashedCredentials = null;
}

export async function removeEnrollment(email) {
  if (!isFaceLoginSupported()) return;
  try {
    await runTx("readwrite", (store) => requestAsPromise(store.delete(normalizeEmail(email))));
  } catch {
    // best effort — a stale enrollment simply fails the next password check
  }
}


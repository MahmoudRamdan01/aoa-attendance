import { supabase } from "./supabase";

// Web Push subscription helpers. The VAPID public key is fetched from the
// server (public); the private key never leaves the Edge Function.

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// "unsupported" | "denied" | "on" | "off"
export async function pushStatus() {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? "on" : "off";
  } catch {
    return "off";
  }
}

export async function enablePush() {
  if (!pushSupported()) throw new Error("المتصفح لا يدعم إشعارات الموبايل. جرّب من Chrome أو Safari حديث، ويفضّل تثبّت التطبيق على الشاشة الرئيسية.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("لازم تسمح بالإشعارات. لو رفضت قبل كده، فعّلها من إعدادات الموقع في المتصفح.");
  const { data: key, error } = await supabase.rpc("get_push_public_key_v1");
  if (error || !key) throw new Error("تعذر تجهيز الإشعارات، أعد المحاولة.");
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }
  const json = sub.toJSON();
  const { data, error: saveError } = await supabase.rpc("save_push_subscription_v1", {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_user_agent: navigator.userAgent,
  });
  if (saveError || data?.error) throw new Error("تعذر حفظ الاشتراك، أعد المحاولة.");
  return "on";
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.rpc("delete_push_subscription_v1", { p_endpoint: sub.endpoint });
    await sub.unsubscribe().catch(() => {});
  }
  return "off";
}

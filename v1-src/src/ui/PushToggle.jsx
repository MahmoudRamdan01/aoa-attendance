import { useEffect, useState } from "react";
import { BellOff, BellRing, Loader2 } from "lucide-react";
import { disablePush, enablePush, pushStatus, pushSupported } from "../lib/push";

// A single button that turns device push notifications on/off for this user.
// Rendered in the inbox popover so every role can reach it from the bell.
export default function PushToggle({ onToast }) {
  const [status, setStatus] = useState("off");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    pushStatus().then((s) => alive && setStatus(s));
    return () => { alive = false; };
  }, []);

  if (!pushSupported()) return null;

  if (status === "denied") {
    return (
      <button className="ui-action" type="button" disabled title="الإشعارات مرفوضة — فعّلها من إعدادات الموقع في المتصفح">
        <BellOff size={15} aria-hidden="true" /> الإشعارات مرفوضة
      </button>
    );
  }

  async function toggle() {
    setBusy(true);
    try {
      const next = status === "on" ? await disablePush() : await enablePush();
      setStatus(next);
      onToast?.(next === "on" ? "تم تفعيل إشعارات الموبايل — هتوصلك حتى لو التطبيق مقفول." : "تم إيقاف إشعارات الموبايل.");
    } catch (error) {
      onToast?.(error.message || "تعذر تغيير الإشعارات.");
      setStatus(await pushStatus());
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="ui-action" type="button" onClick={toggle} disabled={busy} aria-pressed={status === "on"}>
      {busy ? <Loader2 size={15} className="spin" aria-hidden="true" />
        : status === "on" ? <BellRing size={15} aria-hidden="true" />
        : <BellOff size={15} aria-hidden="true" />}
      {status === "on" ? "إشعارات الموبايل مفعّلة" : "فعّل إشعارات الموبايل"}
    </button>
  );
}

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { queuedAttendanceCount } from "../lib/offlineQueue";

// Shell-level offline banner (redesign spec B.7). EmployeeToday still owns the
// actual syncQueue/security logic — this banner only mirrors queue state and
// asks for a sync over a tiny window-event bus, so no security code moves.
export const QUEUE_EVENT = "aoa:attendance-queue";
export const SYNC_REQUEST_EVENT = "aoa:attendance-sync-request";

export function announceQueue(detail) {
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail }));
}

export default function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [queued, setQueued] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const count = await queuedAttendanceCount();
        if (active) setQueued(count);
      } catch {
        if (active) setQueued(0);
      }
    };
    const onQueue = (event) => {
      if (typeof event.detail?.queued === "number") setQueued(event.detail.queued);
      else refresh();
      if (typeof event.detail?.syncing === "boolean") setSyncing(event.detail.syncing);
    };
    const onOnline = () => {
      setOnline(true);
      refresh();
    };
    const onOffline = () => setOnline(false);
    refresh();
    window.addEventListener(QUEUE_EVENT, onQueue);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      active = false;
      window.removeEventListener(QUEUE_EVENT, onQueue);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (online && queued === 0) return null;

  return (
    <button
      type="button"
      className="ops-offline-banner"
      onClick={() => window.dispatchEvent(new CustomEvent(SYNC_REQUEST_EVENT))}
      disabled={syncing}
      aria-live="polite"
    >
      <WifiOff size={15} aria-hidden="true" />
      <span>{online ? "عمليات محفوظة بانتظار المزامنة — اضغط للمزامنة" : "بدون اتصال — تُحفظ العمليات وتُزامَن تلقائيًا"}</span>
      {queued > 0 ? (
        <span className="ops-offline-count">
          <bdi dir="ltr">{queued}</bdi> بالانتظار
        </span>
      ) : null}
    </button>
  );
}

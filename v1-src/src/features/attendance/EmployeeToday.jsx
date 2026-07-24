import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, MessageSquare } from "lucide-react";
import { distanceMeters, supabase, todayIso } from "../../lib/supabase";
import { cls } from "../../lib/cls";
import { getCompanyLocation } from "../../lib/dates";
import { haptic } from "../../lib/haptics";
import { statusLabels } from "../../lib/labels";
import { fmtTime12 } from "../../lib/format";
import { checkoutWindowState } from "../../lib/attendanceWindow";
import { getDeviceFingerprint, getDeviceId } from "../../lib/deviceFingerprint";
import {
  enqueueAttendance,
  listQueuedAttendance,
  migrateLegacyAttendanceQueue,
  queuedAttendanceCount,
  removeQueuedAttendance,
  updateQueuedAttendance,
} from "../../lib/offlineQueue";
import { ConfirmDialog } from "../../ui/primitives";
import { SYNC_REQUEST_EVENT, announceQueue } from "../../ui/OfflineBanner";
import CaptureSheet, { requestCaptureSession } from "./CaptureSheet";
import CheckInRing from "./CheckInRing";
import LocationMap from "./LocationMap";
import { prepareFaceEngine } from "./useFaceEngine";
import { startGpsSampler } from "./useGpsSampler";

const ERROR_MESSAGES = {
  gps_suspect: "تعذّر التحقق من الموقع بشكل موثوق. أغلق أي تطبيق لتزييف الموقع (Fake GPS) وأعد المحاولة من مكانك الطبيعي.",
  face_mismatch: "تعذّر التحقق من الوجه. يُرجى التأكد من وضوح الوجه وجودة الإضاءة ثم إعادة المحاولة.",
  low_accuracy: "دقة تحديد الموقع ضعيفة. شغّل الـ GPS وانتظر لحظة في مكان مكشوف.",
  outside: "أنت خارج نطاق الشركة.",
  window_closed: "نافذة التسجيل مغلقة حاليًا.",
  already: "هذه العملية مسجّلة بالفعل.",
  no_checkin: "يجب تسجيل الحضور أولًا.",
  update_required: "نسخة التطبيق قديمة. حدّث الصفحة وثبّت آخر إصدار.",
  day_locked: "اليوم مسجل إجازة أو مأمورية أو مرضي، ولا يمكن استبداله بحضور من التطبيق.",
};

const LOCKED_DAY_STATUSES = new Set(["leave", "mission", "sick"]);

// Short ring titles per error code — the full ERROR_MESSAGES text becomes the
// detail line inside the ring (redesign spec B-3: errors move into the ring).
const ERROR_TITLES = {
  gps_suspect: "تعذّر توثيق الموقع",
  face_mismatch: "تعذّر التحقق من الوجه",
  low_accuracy: "دقة GPS غير كافية",
  outside: "أنت خارج نطاق الشركة",
  window_closed: "نافذة التسجيل مغلقة",
  already: "العملية مسجّلة بالفعل",
  no_checkin: "سجّل حضورك أولًا",
  update_required: "حدّث التطبيق",
  day_locked: "اليوم مسجّل إجازة",
};

const VERIFY_STEP_LABELS = {
  gps: "تثبيت الموقع (GPS)…",
  face: "التحقق من بصمة الوجه…",
  send: "جارٍ التسجيل…",
};

function pad2(value) {
  return String(value).padStart(2, "0");
}

function fmtClock12(date) {
  const hours = date.getHours();
  return { time: `${hours % 12 || 12}:${pad2(date.getMinutes())}`, meridiem: hours < 12 ? "ص" : "م" };
}

function fmtDuration(ms, { seconds = true } = {}) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return seconds ? `${h}:${pad2(m)}:${pad2(total % 60)}` : `${h}:${pad2(m)}`;
}

// attendance.check_in / check_out are bare Postgres `time` values (HH:MM:SS).
// Pin them onto the record's work_date to get a real Date for the timers.
function parseDayTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const parsed = new Date(`${dateStr}T${String(timeStr).slice(0, 8)}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeQr(value) {
  return value.trim().toUpperCase();
}

function isNetworkError(error) {
  const message = String(error?.message || "").toLowerCase();
  return !navigator.onLine || message.includes("fetch") || message.includes("network") || message.includes("load failed");
}

function EmployeeToday({ context, session, onToast, routeParam }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [locationState, setLocationState] = useState(null);
  const [todayRecord, setTodayRecord] = useState(null);
  const [queued, setQueued] = useState(0);
  const [capture, setCapture] = useState(null);
  const [consentKind, setConsentKind] = useState("");
  const [shortcutRequested, setShortcutRequested] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  // Ring presentation state (redesign B-3). Security flow untouched — these
  // only mirror where the existing promise chain currently is.
  const [verifyStep, setVerifyStep] = useState("send");
  const [ringError, setRingError] = useState(null);
  const lastKindRef = useRef("in");
  const [securityConfig, setSecurityConfig] = useState({
    face_mode: "off",
    antispoof_min: 0.6,
    checkout_from: null,
    checkout_to: null,
  });

  const employee = context?.employee;
  const companyLocation = useMemo(() => getCompanyLocation(context), [context?.location]);
  const consentKey = `aoa:v1:biometric-consent:${session?.user?.id || employee?.id || "unknown"}`;
  const dayLocked = LOCKED_DAY_STATUSES.has(todayRecord?.status) && !todayRecord?.check_in;
  const checkoutFrom = securityConfig.checkout_from;
  const checkoutTo = securityConfig.checkout_to;
  const checkoutWindow = checkoutWindowState({ checkoutFrom, checkoutTo, now: clock });
  const checkoutTimeAllowed = checkoutWindow.configured && checkoutWindow.open;

  const refreshQueueCount = useCallback(async () => {
    try {
      const count = await queuedAttendanceCount();
      setQueued(count);
      announceQueue({ queued: count }); // keep the shell offline banner in sync
    } catch {
      setQueued(0);
      announceQueue({ queued: 0 });
    }
  }, []);

  const refreshSecurityConfig = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_attendance_security_config_v1");
    if (!error && data) setSecurityConfig((current) => ({ ...current, ...data }));
  }, []);

  useEffect(() => {
    loadToday();
    migrateLegacyAttendanceQueue().finally(refreshQueueCount);
    refreshSecurityConfig();
  }, [employee?.id, refreshQueueCount, refreshSecurityConfig]);

  useEffect(() => {
    const refresh = () => refreshSecurityConfig();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refreshSecurityConfig]);

  // Warm the face models in the background as soon as we know face mode is on,
  // so the capture sheet opens with the engine already loaded (fast UX).
  useEffect(() => {
    if (securityConfig.face_mode !== "off") prepareFaceEngine().catch(() => {});
  }, [securityConfig.face_mode]);

  // The screen now shows a live clock (and the elapsed timer while checked
  // in), so tick every second for the whole visit — cheap, and it keeps the
  // checkout-window state fresh too.
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  // Phase-8 map card: a low-power watcher feeds the pin/zone chip. This is
  // presentation only — the recorded fix still comes from the same GPS
  // sampler the RPC path uses; nothing here is ever submitted. Employees
  // exempt from the geofence don't need it (and the map is hidden for them).
  useEffect(() => {
    if (employee?.location_exempt || !navigator.geolocation) return undefined;
    let alive = true;
    const id = navigator.geolocation.watchPosition(
      (position) => {
        if (!alive) return;
        const fix = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy || 0),
        };
        setLocationState({ ...fix, distance: distanceMeters(fix, companyLocation) });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 },
    );
    return () => {
      alive = false;
      navigator.geolocation.clearWatch(id);
    };
  }, [employee?.location_exempt, companyLocation.lat, companyLocation.lng]);

  useEffect(() => {
    if (routeParam === "capture-in" && !todayRecord?.check_in && !dayLocked) setShortcutRequested(true);
  }, [routeParam, todayRecord?.check_in, dayLocked]);

  useEffect(() => {
    const sync = () => syncQueue({ quiet: true });
    // The shell offline banner requests a sync over the event bus (UI only —
    // syncQueue itself is unchanged).
    const requested = () => syncQueue();
    window.addEventListener("online", sync);
    window.addEventListener(SYNC_REQUEST_EVENT, requested);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener(SYNC_REQUEST_EVENT, requested);
    };
  });

  async function loadToday() {
    if (!employee?.id) return;
    const { data } = await supabase
      .from("attendance")
      .select("*")
      .eq("employee_id", employee.id)
      .eq("work_date", todayIso())
      .maybeSingle();
    setTodayRecord(data || null);
  }

  function attendanceArgs(kind, captureData) {
    return {
      p_kind: kind,
      p_lat: captureData.location?.lat ?? null,
      p_lng: captureData.location?.lng ?? null,
      p_accuracy: captureData.location?.accuracy ?? null,
      p_qr_code: null, // QR entry removed from the UI (qr_required is off)
      p_device_id: getDeviceId(),
      p_note: note.trim() || null,
      // No photos, ever: only the face embedding (a mathematical template)
      // leaves the device. The server stores it encrypted.
      p_photo_path: null,
      p_face_embedding: captureData.faceEmbedding ? JSON.stringify(captureData.faceEmbedding) : null,
      p_face_scores: captureData.faceScores || null,
      p_gps_samples: captureData.samples,
      p_fingerprint: getDeviceFingerprint(),
    };
  }

  async function runV2(args) {
    const { data, error } = await supabase.rpc("employee_attendance_action_v2", args);
    if (error) throw error;
    if (data?.error) {
      const err = new Error(ERROR_MESSAGES[data.error] || data.message || "تعذر التسجيل.");
      err.code = data.error;
      throw err;
    }
    return data;
  }

  async function queueCapture(kind, captureData, args) {
    await enqueueAttendance({
      kind,
      capturedAt: captureData.capturedAt,
      location: captureData.location,
      samples: captureData.samples,
      qr: "",
      note,
      deviceId: args.p_device_id,
      fingerprint: args.p_fingerprint,
      faceEmbedding: args.p_face_embedding,
      faceScores: args.p_face_scores,
    });
    await refreshQueueCount();
  }

  async function submitCapture(kind, captureData) {
    if (captureData.location) {
      const distance = distanceMeters(captureData.location, companyLocation);
      setLocationState({ ...captureData.location, distance });
      // No client-side hard block: employees may have extra allowed locations
      // (employee_locations) that only the server knows about — it validates.
    }

    const draftArgs = attendanceArgs(kind, captureData);
    if (!navigator.onLine) {
      await queueCapture(kind, captureData, draftArgs);
      onToast("تم حفظ العملية دون اتصال، وستتم مزامنتها تلقائيًا عند عودة الاتصال بالإنترنت.");
      setCapture(null);
      return;
    }

    try {
      const data = await runV2(draftArgs);
      haptic([14, 60, 14]);
      onToast(data.label || (kind === "in" ? "تم تسجيل الحضور." : "تم تسجيل الانصراف."));
      setNote("");
      setCapture(null);
      setShortcutRequested(false);
      await loadToday();
    } catch (error) {
      if (isNetworkError(error)) {
        await queueCapture(kind, captureData, draftArgs);
        onToast("انقطع الاتصال؛ تم حفظ العملية وستتم مزامنتها تلقائيًا.");
        setCapture(null);
        return;
      }
      throw error;
    }
  }

  async function beginCapture(kind) {
    setBusy(kind);
    setVerifyStep("face");
    try {
      // This call must remain directly inside the click handler for iOS.
      const captureSession = await requestCaptureSession({ faceMode: securityConfig.face_mode });
      setCapture({ kind, session: captureSession });
      setShortcutRequested(false);
    } catch (error) {
      setRingError({ title: "تعذر تشغيل الكاميرا", detail: error.message || "اسمح للتطبيق باستخدام الكاميرا وحاول مرة أخرى." });
    } finally {
      setBusy("");
    }
  }

  // The camera is only needed for face verification. With face off (owner's
  // "متوقف"), check-in is GPS-only — no camera prompt and no biometric consent.
  // Photos are never taken or stored in any mode.
  const cameraNeeded = securityConfig.face_mode !== "off";

  async function submitDirect(kind) {
    setBusy(kind);
    setVerifyStep("send");
    try {
      // location_exempt (e.g. حبيبة): no GPS at all — the server skips the
      // geofence for her too, so we go straight to the RPC.
      const locationExempt = Boolean(employee?.location_exempt);
      let location = null;
      let samples = [];
      if (!locationExempt) {
        setVerifyStep("gps"); // ring mirrors the real GPS sampling stage
        const sampler = startGpsSampler();
        sampler.first.catch(() => {});
        samples = await sampler.done;
        location = [...samples].sort((a, b) => a.accuracy - b.accuracy)[0] || null;
        if (!location) throw new Error("تعذر تثبيت الموقع. فعّل الـ GPS وحاول من مكان مكشوف.");
        // A coarse network fix can sit km away from the phone — sending it
        // gets an unfair "خارج النطاق". Be honest instead and ask for a retry.
        if (location.accuracy > 300) {
          throw new Error(`دقة تحديد الموقع غير كافية حاليًا (±${location.accuracy} متر). يُرجى الانتظار بضع ثوانٍ في مكان مكشوف أو قرب نافذة ثم إعادة المحاولة.`);
        }
        const distance = distanceMeters(location, companyLocation);
        setLocationState({ ...location, distance });
        // Client precheck only warns for the MAIN geofence; employees with an
        // extra allowed location (إسراء) are validated server-side, so don't
        // hard-block here — let the RPC decide.
      }
      const captureData = { location, samples, capturedAt: new Date().toISOString(), faceEmbedding: null, faceScores: null };
      const args = attendanceArgs(kind, captureData);
      if (!navigator.onLine) {
        await queueCapture(kind, captureData, args);
        onToast("لا يوجد اتصال بالإنترنت؛ تم حفظ العملية وستتم مزامنتها تلقائيًا.");
        return;
      }
      try {
        setVerifyStep("send");
        const data = await runV2(args);
        haptic([14, 60, 14]);
        onToast(data.label || (kind === "in" ? "تم تسجيل الحضور." : "تم تسجيل الانصراف."));
        setNote("");
        await loadToday();
      } catch (error) {
        if (isNetworkError(error)) {
          await queueCapture(kind, captureData, args);
          onToast("انقطع الاتصال؛ تم حفظ العملية وستتم مزامنتها تلقائيًا.");
          return;
        }
        throw error;
      }
    } catch (error) {
      // Check-in/checkout errors render INSIDE the ring (redesign B-3);
      // toasts remain for everything else.
      setRingError({
        title: ERROR_TITLES[error.code] || "تعذر التسجيل",
        detail: error.message || ERROR_MESSAGES[error.code] || "حدث خطأ غير متوقع — أعد المحاولة.",
      });
    } finally {
      setBusy("");
    }
  }

  function attendance(kind) {
    lastKindRef.current = kind;
    setRingError(null);
    if (kind === "in" && dayLocked) {
      onToast(ERROR_MESSAGES.day_locked);
      return;
    }
    // Known-outside fix: the server would reject this anyway, so fail in the
    // ring immediately instead of paying a round-trip (spec 06 §gating). Only
    // this one case short-circuits — every OTHER failure still comes from the
    // server response, and employees exempt from the geofence never hit it.
    if (!employee?.location_exempt && locationState && !insideRange) {
      setRingError({
        title: ERROR_TITLES.outside,
        detail: `أنت على بُعد ~${roundedDistance} م — اقترب من الموقع وأعد المحاولة`,
      });
      return;
    }
    if (!cameraNeeded) {
      submitDirect(kind);
      return;
    }
    if (localStorage.getItem(consentKey) !== "accepted") {
      setConsentKind(kind);
      return;
    }
    beginCapture(kind);
  }

  function acceptConsent() {
    const kind = consentKind;
    localStorage.setItem(consentKey, "accepted");
    setConsentKind("");
    beginCapture(kind);
  }

  async function replayLegacy(item) {
    const loc = item.location;
    if (!loc) throw new Error("عملية قديمة بلا موقع.");
    const { data, error } = await supabase.rpc("employee_attendance_action_v1", {
      p_kind: item.kind,
      p_lat: loc.lat,
      p_lng: loc.lng,
      p_accuracy: loc.accuracy,
      p_qr_code: normalizeQr(item.qr || "") || null,
      p_device_id: item.deviceId || getDeviceId(),
      p_note: item.note?.trim() || null,
    });
    if (error) throw error;
    if (data?.error && data.error !== "already") throw new Error(data.message || data.error);
  }

  async function syncQueue({ quiet = false } = {}) {
    if (!navigator.onLine || busy === "sync") return;
    let items;
    try {
      items = await listQueuedAttendance();
    } catch {
      return;
    }
    if (!items.length) return;
    setBusy("sync");
    announceQueue({ syncing: true });
    let synced = 0;
    let expired = 0;
    try {
      for (const item of items) {
        try {
          if (item.legacy) {
            await replayLegacy(item);
          } else {
            // Attendance is per-day: an item queued on a previous day can't be
            // replayed as today's record.
            const queuedDay = String(item.capturedAt || "").slice(0, 10);
            if (queuedDay !== todayIso()) {
              expired += 1;
              await removeQueuedAttendance(item.id);
              continue;
            }
            await runV2({
              p_kind: item.kind,
              p_lat: item.location.lat,
              p_lng: item.location.lng,
              p_accuracy: item.location.accuracy,
              p_qr_code: normalizeQr(item.qr || "") || null,
              p_device_id: item.deviceId || getDeviceId(),
              p_note: item.note?.trim() || null,
              p_photo_path: null,
              p_face_embedding: item.faceEmbedding || null,
              p_face_scores: item.faceScores || null,
              p_gps_samples: item.samples || [],
              p_fingerprint: item.fingerprint || getDeviceFingerprint(),
            });
          }
          await removeQueuedAttendance(item.id);
          synced += 1;
        } catch (error) {
          if (error.code === "already") {
            await removeQueuedAttendance(item.id);
            synced += 1;
            continue;
          }
          item.attempts = (item.attempts || 0) + 1;
          item.lastError = error.message || "sync_failed";
          await updateQueuedAttendance(item);
        }
      }
    } finally {
      setBusy("");
      announceQueue({ syncing: false });
    }
    await refreshQueueCount();
    await loadToday();
    if (!quiet || expired) {
      const parts = [];
      if (synced) parts.push(`تمت مزامنة ${synced}`);
      if (expired) parts.push(`تعذر إرسال ${expired} لأنها من يوم سابق`);
      onToast(parts.join(" · ") || "تعذر مزامنة العمليات المحفوظة.");
    }
  }

  const todayNote = todayRecord
    ? [
        statusLabels[todayRecord.status] || todayRecord.status,
        Number(todayRecord.late_minutes || 0) > 0 ? `${todayRecord.late_minutes} دقيقة تأخير` : "",
        Number(todayRecord.deduction_days || 0) > 0 ? `خصم ${todayRecord.deduction_days} يوم` : "",
      ].filter(Boolean).join(" · ")
    : "";

  // ---- Ring phase derivation (presentation only — spec B-3) ----
  const verifying = busy === "in" || busy === "out";
  const ringPhase = ringError
    ? "fail"
    : verifying
      ? "verifying"
      : dayLocked
        ? "locked"
        : !todayRecord?.check_in
          ? "idle"
          : !todayRecord?.check_out
            ? "in"
            : "done";
  const checkInAt = parseDayTime(todayRecord?.work_date, todayRecord?.check_in);
  const checkOutAt = parseDayTime(todayRecord?.work_date, todayRecord?.check_out);
  const elapsed = checkInAt ? fmtDuration(clock - checkInAt) : "";
  const worked = checkInAt && checkOutAt ? fmtDuration(checkOutAt - checkInAt, { seconds: false }) : "";
  const checkoutState = !checkoutWindow.configured
    ? { open: false, label: "موعد الانصراف غير مضبوط" }
    : checkoutWindow.beforeOpen
      ? { open: false, label: `يفتح ${fmtTime12(checkoutFrom)}` }
      : checkoutWindow.afterClose
        ? { open: false, label: "انتهى وقت الانصراف" }
        : { open: true, label: "تسجيل انصراف" };
  const bigClock = fmtClock12(clock);
  const zoneRadius = companyLocation.radiusMeters || 1000;
  const insideRange = locationState && locationState.distance <= zoneRadius;

  // ---- Phase-8 map state (presentation; the server stays the authority) ----
  const showMap = !employee?.location_exempt;
  const accuracyLimit = 300; // same ceiling the capture path rejects at
  const mapState = !locationState
    ? "unknown"
    : !insideRange
      ? "out"
      : locationState.accuracy > accuracyLimit
        ? "poor"
        : "in";
  const roundedDistance = locationState ? Math.round(locationState.distance / 10) * 10 : 0;
  const mapChip = {
    unknown: "جارٍ تحديد موقعك…",
    in: `داخل نطاق الشركة · دقة ±${Math.round(locationState?.accuracy || 0)} م`,
    poor: `دقة GPS ضعيفة · ±${Math.round(locationState?.accuracy || 0)} م`,
    out: `خارج نطاق الشركة · ~${roundedDistance} م`,
  }[mapState];

  return (
    <>
      {/* Design (ref 01): content sits directly on the canvas — no panel. */}
      <div className="today-screen">
        {/* Live clock (the design hides the date line — the topbar carries it) */}
        <div className="today-clockline">
          <p className="today-clock" dir="ltr">
            {bigClock.time}
            <i> {bigClock.meridiem}</i>
          </p>
        </div>

        {/* Status card: two halves split by a vertical hairline */}
        <div className="today-status">
          <StatusDot done={!!todayRecord?.check_in} label="حضور" value={fmtTime12(todayRecord?.check_in) || "لم يُسجَّل"} />
          <span className="today-status-divider" aria-hidden="true" />
          <StatusDot done={!!todayRecord?.check_out} label="انصراف" value={fmtTime12(todayRecord?.check_out) || "لم يُسجَّل"} />
        </div>

        {/* Map card (spec 06): leads the screen, ring sits below it */}
        {showMap ? (
          <LocationMap
            center={companyLocation}
            radiusMeters={zoneRadius}
            position={locationState}
            state={mapState}
            chipText={mapChip}
          />
        ) : null}

        {/* The ring — same attendance() entrypoints as the old buttons */}
        <CheckInRing
          phase={ringPhase}
          step={VERIFY_STEP_LABELS[verifyStep] || VERIFY_STEP_LABELS.send}
          error={ringError}
          elapsed={elapsed}
          worked={worked}
          lockedLabel={statusLabels[todayRecord?.status] || "اليوم مسجّل إجازة"}
          checkoutState={checkoutState}
          onCheckIn={() => attendance("in")}
          onCheckOut={() => attendance("out")}
          onRetry={() => attendance(lastKindRef.current)}
          disabled={Boolean(busy)}
        />

        {/* Location chip removed in spec 06 — it now lives inside the map */}
        {todayNote ? <p className="muted today-note-line">{todayNote}</p> : null}

        {shortcutRequested ? (
          <div className="capture-shortcut">
            <Camera size={22} />
            <div><strong>جاهز لتسجيل حضورك؟</strong><span>اضغط لفتح الكاميرا وتثبيت الموقع.</span></div>
            <button type="button" className="primary" onClick={() => attendance("in")}>ابدأ</button>
          </div>
        ) : null}

        {/* Note field (design: r14 row card) */}
        <label className="today-note-field">
          <MessageSquare size={16} aria-hidden="true" />
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="ملاحظة اليوم (اختياري)…"
            maxLength={280}
            aria-label="ملاحظة اليوم (اختياري)"
          />
        </label>
        {todayRecord?.employee_note ? (
          <p className="muted"><MessageSquare size={15} /> ملاحظتك المسجلة: {todayRecord.employee_note}</p>
        ) : null}

        {/* Security card removed in spec 06 — its three lines moved to
            المزيد → "أمان الحضور"; the ring already says "لا تُحفظ أي صور". */}
      </div>

      <ConfirmDialog
        open={Boolean(consentKind)}
        title="موافقة على التحقق ببصمة الوجه"
        message="أوافق على استخدام الكاميرا لحظيًا عند الحضور والانصراف للتحقق من بصمة وجهي والحيوية لأغراض تأمين سجل الحضور. لا يتم حفظ أي صور أو فيديو نهائيًا — يتم استخراج بصمة رقمية (أرقام فقط) وتُخزَّن مشفرة. يمكنني التواصل مع الإدارة لأي استفسار."
        confirmLabel="أوافق وابدأ"
        cancelLabel="إلغاء"
        onConfirm={acceptConsent}
        onCancel={() => setConsentKind("")}
      />

      {capture ? (
        <CaptureSheet
          kind={capture.kind}
          session={capture.session}
          faceMode={securityConfig.face_mode}
          antispoofMin={Number(securityConfig.antispoof_min || 0.6)}
          quick
          onCapture={(data) => submitCapture(capture.kind, data)}
          onCancel={() => setCapture(null)}
        />
      ) : null}
    </>
  );
}

function StatusDot({ done, label, value }) {
  return (
    <div className={cls("status-dot", done && "done")}>
      <span />
      <div><small>{label}</small><strong>{value}</strong></div>
    </div>
  );
}

export default EmployeeToday;

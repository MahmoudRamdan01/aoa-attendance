import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, Clock3, LogOut, MapPin, MessageSquare, QrCode, ShieldCheck, WifiOff } from "lucide-react";
import { distanceMeters, supabase, todayIso } from "../../lib/supabase";
import { cls } from "../../lib/cls";
import { getCompanyLocation } from "../../lib/dates";
import { statusLabels } from "../../lib/labels";
import { fmtTime12 } from "../../lib/format";
import { getDeviceFingerprint, getDeviceId } from "../../lib/deviceFingerprint";
import { isCaptureFromToday, uploadAttendanceCapture } from "../../lib/captureUpload";
import {
  enqueueAttendance,
  listQueuedAttendance,
  migrateLegacyAttendanceQueue,
  queuedAttendanceCount,
  removeQueuedAttendance,
  updateQueuedAttendance,
} from "../../lib/offlineQueue";
import { ConfirmDialog } from "../../ui/primitives";
import CaptureSheet, { requestCaptureSession } from "./CaptureSheet";
import { startGpsSampler } from "./useGpsSampler";

const ERROR_MESSAGES = {
  photo_required: "لازم تلتقط صورة واضحة عشان تسجّل.",
  photo_invalid: "الصورة لم تصل بشكل سليم. حاول تلتقط من جديد.",
  gps_suspect: "تعذر التحقق من الموقع بشكل موثوق. اقفل أي تطبيق Fake GPS وحاول من مكانك الطبيعي.",
  face_mismatch: "تعذر التحقق من الوجه. اتأكد إن وشك واضح في الإضاءة وحاول تاني.",
  low_accuracy: "دقة الموقع ضعيفة. شغّل GPS وانتظر لحظة في مكان مكشوف.",
  outside: "أنت خارج نطاق الشركة.",
  window_closed: "نافذة التسجيل مقفولة حاليًا.",
  already: "العملية دي مسجلة بالفعل.",
  no_checkin: "لازم تسجل حضور الأول.",
  update_required: "نسخة التطبيق قديمة. حدّث الصفحة وثبّت آخر إصدار.",
  day_locked: "اليوم مسجل إجازة أو مأمورية أو مرضي، ولا يمكن استبداله بحضور من التطبيق.",
};

const LOCKED_DAY_STATUSES = new Set(["leave", "mission", "sick"]);

function normalizeQr(value) {
  return value.trim().toUpperCase();
}

function isNetworkError(error) {
  const message = String(error?.message || "").toLowerCase();
  return !navigator.onLine || message.includes("fetch") || message.includes("network") || message.includes("load failed");
}

function EmployeeToday({ context, session, onToast, routeParam }) {
  const [qr, setQr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [locationState, setLocationState] = useState(null);
  const [todayRecord, setTodayRecord] = useState(null);
  const [queued, setQueued] = useState(0);
  const [capture, setCapture] = useState(null);
  const [consentKind, setConsentKind] = useState("");
  const [shortcutRequested, setShortcutRequested] = useState(false);
  const [securityConfig, setSecurityConfig] = useState({
    face_mode: "off",
    antispoof_min: 0.6,
  });

  const employee = context?.employee;
  const companyLocation = useMemo(() => getCompanyLocation(context), [context?.location]);
  const consentKey = `aoa:v1:biometric-consent:${session?.user?.id || employee?.id || "unknown"}`;
  const dayLocked = LOCKED_DAY_STATUSES.has(todayRecord?.status) && !todayRecord?.check_in;

  const refreshQueueCount = useCallback(async () => {
    try {
      setQueued(await queuedAttendanceCount());
    } catch {
      setQueued(0);
    }
  }, []);

  useEffect(() => {
    loadToday();
    migrateLegacyAttendanceQueue().finally(refreshQueueCount);
    supabase.rpc("get_attendance_security_config_v1").then(({ data }) => {
      if (data?.face_mode) setSecurityConfig(data);
    }).catch(() => {});
  }, [employee?.id, refreshQueueCount]);

  useEffect(() => {
    if (routeParam === "capture-in" && !todayRecord?.check_in && !dayLocked) setShortcutRequested(true);
  }, [routeParam, todayRecord?.check_in, dayLocked]);

  useEffect(() => {
    const sync = () => syncQueue({ quiet: true });
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
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

  function attendanceArgs(kind, captureData, photoPath) {
    return {
      p_kind: kind,
      p_lat: captureData.location?.lat ?? null,
      p_lng: captureData.location?.lng ?? null,
      p_accuracy: captureData.location?.accuracy ?? null,
      p_qr_code: normalizeQr(qr) || null,
      p_device_id: getDeviceId(),
      p_note: note.trim() || null,
      p_photo_path: photoPath,
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

  async function queueCapture(kind, captureData, args, photoPath = null) {
    await enqueueAttendance({
      kind,
      blob: captureData.blob,
      width: captureData.width,
      height: captureData.height,
      capturedAt: captureData.capturedAt,
      location: captureData.location,
      samples: captureData.samples,
      qr,
      note,
      deviceId: args.p_device_id,
      fingerprint: args.p_fingerprint,
      faceEmbedding: args.p_face_embedding,
      faceScores: args.p_face_scores,
      photoPath,
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

    const draftArgs = attendanceArgs(kind, captureData, null);
    if (!navigator.onLine) {
      await queueCapture(kind, captureData, draftArgs);
      onToast("تم حفظ الصورة والعملية Offline، وهتتزامن تلقائيًا عند رجوع الإنترنت.");
      setCapture(null);
      return;
    }

    let photoPath = null;
    try {
      photoPath = await uploadAttendanceCapture({
        employeeId: employee.id,
        kind,
        blob: captureData.blob,
        capturedAt: new Date(captureData.capturedAt),
      });
      const data = await runV2({ ...draftArgs, p_photo_path: photoPath });
      onToast(data.label || (kind === "in" ? "تم تسجيل الحضور بالصورة." : "تم تسجيل الانصراف بالصورة."));
      setNote("");
      setCapture(null);
      setShortcutRequested(false);
      await loadToday();
    } catch (error) {
      if (isNetworkError(error)) {
        await queueCapture(kind, captureData, draftArgs, photoPath);
        onToast("الاتصال انقطع؛ حفظنا العملية وهتتزامن تلقائيًا.");
        setCapture(null);
        return;
      }
      throw error;
    }
  }

  async function beginCapture(kind) {
    setBusy(kind);
    try {
      // This call must remain directly inside the click handler for iOS.
      const captureSession = await requestCaptureSession({ faceMode: securityConfig.face_mode });
      setCapture({ kind, session: captureSession });
      setShortcutRequested(false);
    } catch (error) {
      onToast(error.message || "تعذر تشغيل الكاميرا.");
    } finally {
      setBusy("");
    }
  }

  // The camera is only needed when the photo is required OR face verification
  // is active. With both off (owner's "متوقف"), check-in is GPS-only — no
  // camera prompt and no biometric consent.
  const cameraNeeded = securityConfig.photo_required !== false || securityConfig.face_mode !== "off";

  async function submitDirect(kind) {
    setBusy(kind);
    try {
      // location_exempt (e.g. حبيبة): no GPS at all — the server skips the
      // geofence for her too, so we go straight to the RPC.
      const locationExempt = Boolean(employee?.location_exempt);
      let location = null;
      let samples = [];
      if (!locationExempt) {
        const sampler = startGpsSampler();
        sampler.first.catch(() => {});
        samples = await sampler.done;
        location = [...samples].sort((a, b) => a.accuracy - b.accuracy)[0] || null;
        if (!location) throw new Error("تعذر تثبيت الموقع. فعّل الـ GPS وحاول من مكان مكشوف.");
        const distance = distanceMeters(location, companyLocation);
        setLocationState({ ...location, distance });
        // Client precheck only warns for the MAIN geofence; employees with an
        // extra allowed location (إسراء) are validated server-side, so don't
        // hard-block here — let the RPC decide.
      }
      const captureData = { location, samples, blob: null, capturedAt: new Date().toISOString(), faceEmbedding: null, faceScores: null };
      const args = attendanceArgs(kind, captureData, null);
      if (!navigator.onLine) {
        await queueCapture(kind, captureData, args);
        onToast("مفيش إنترنت؛ حفظنا العملية وهتتزامن تلقائيًا.");
        return;
      }
      try {
        const data = await runV2(args);
        onToast(data.label || (kind === "in" ? "تم تسجيل الحضور." : "تم تسجيل الانصراف."));
        setNote("");
        await loadToday();
      } catch (error) {
        if (isNetworkError(error)) {
          await queueCapture(kind, captureData, args);
          onToast("الاتصال انقطع؛ حفظنا العملية وهتتزامن تلقائيًا.");
          return;
        }
        throw error;
      }
    } catch (error) {
      onToast(error.message || "تعذر التسجيل.");
    } finally {
      setBusy("");
    }
  }

  function attendance(kind) {
    if (kind === "in" && dayLocked) {
      onToast(ERROR_MESSAGES.day_locked);
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
    let synced = 0;
    let expired = 0;
    try {
      for (const item of items) {
        try {
          if (item.legacy) {
            await replayLegacy(item);
          } else {
            if (!isCaptureFromToday(item.capturedAt)) {
              expired += 1;
              await removeQueuedAttendance(item.id);
              continue;
            }
            // GPS-only items (camera off) have no blob — nothing to upload.
            const photoPath = item.blob ? await uploadAttendanceCapture({
              employeeId: employee.id,
              kind: item.kind,
              blob: item.blob,
              capturedAt: new Date(item.capturedAt),
              path: item.photoPath,
            }) : null;
            if (item.blob && photoPath !== item.photoPath) {
              item.photoPath = photoPath;
              await updateQueuedAttendance(item);
            }
            await runV2({
              p_kind: item.kind,
              p_lat: item.location.lat,
              p_lng: item.location.lng,
              p_accuracy: item.location.accuracy,
              p_qr_code: normalizeQr(item.qr || "") || null,
              p_device_id: item.deviceId || getDeviceId(),
              p_note: item.note?.trim() || null,
              p_photo_path: photoPath,
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

  return (
    <>
      <div className="grid two">
        <section className="panel hero-panel attendance-capture-panel">
          <div className="panel-title">
            <Clock3 size={20} />
            <h2>تسجيل اليوم</h2>
          </div>
          <div className="today-status">
            <StatusDot done={!!todayRecord?.check_in} label="حضور" value={fmtTime12(todayRecord?.check_in) || "لم يسجل"} />
            <StatusDot done={!!todayRecord?.check_out} label="انصراف" value={fmtTime12(todayRecord?.check_out) || "لم يسجل"} />
          </div>

          {shortcutRequested ? (
            <div className="capture-shortcut">
              <Camera size={22} />
              <div><strong>جاهز لتسجيل حضورك؟</strong><span>اضغط لفتح الكاميرا وتثبيت الموقع.</span></div>
              <button type="button" className="primary" onClick={() => attendance("in")}>ابدأ</button>
            </div>
          ) : null}

          <label className="field">
            كود QR اليومي (اختياري)
            <input
              dir="ltr"
              value={qr}
              onChange={(event) => setQr(event.target.value.toUpperCase())}
              placeholder="اختياري — الموقع والصورة يكفوا"
              autoCapitalize="characters"
              autoComplete="one-time-code"
            />
          </label>
          <label className="field">
            ملاحظة (اختياري)
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="مثال: اتأخرت بسبب الزحمة"
              maxLength={280}
            />
          </label>
          {todayRecord?.employee_note ? (
            <p className="muted"><MessageSquare size={15} /> ملاحظتك المسجلة: {todayRecord.employee_note}</p>
          ) : null}

          <div className="actions-row attendance-main-actions">
            <button className="primary capture-action" disabled={busy || !!todayRecord?.check_in || dayLocked} onClick={() => attendance("in")}>
              <Camera size={19} /> {busy === "in" ? "جاري فتح الكاميرا…" : "تسجيل حضور"}
            </button>
            <button className="secondary capture-action" disabled={busy || !todayRecord?.check_in || !!todayRecord?.check_out} onClick={() => attendance("out")}>
              <LogOut size={19} /> {busy === "out" ? "جاري فتح الكاميرا…" : "تسجيل انصراف"}
            </button>
          </div>
          {locationState ? (
            <p className="muted">
              <MapPin size={15} /> المسافة عن الشركة: {Math.round(locationState.distance)} متر · دقة GPS {locationState.accuracy} متر
            </p>
          ) : null}
          {todayNote ? <p className="muted">{todayNote}</p> : null}
          {queued > 0 ? (
            <button className="warning-btn" onClick={() => syncQueue()} disabled={busy === "sync"}>
              <WifiOff size={17} /> مزامنة {queued} عملية محفوظة Offline
            </button>
          ) : null}
        </section>

        <section className="panel">
          <div className="panel-title">
            <ShieldCheck size={20} />
            <h2>تسجيل آمن</h2>
          </div>
          <ul className="rules">
            <li>صورة سيلفي مطلوبة عند الحضور والانصراف.</li>
            <li>لازم تكون داخل {companyLocation.radiusMeters} متر من موقع الشركة.</li>
            <li>النظام يفحص تغيرات GPS والجهاز ويرسل تنبيهًا للإدارة عند الاشتباه.</li>
            <li>الصورة في bucket خاص ولا يمكن تعديلها بعد الرفع.</li>
            <li><QrCode size={15} /> QR اختياري إلا لو الإدارة فعّلته.</li>
          </ul>
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(consentKind)}
        title="موافقة على التحقق بالصورة والوجه"
        message="أوافق على التقاط صورتي عند الحضور والانصراف واستخدام بصمة الوجه والتحقق من الحيوية لأغراض تأمين سجل الحضور، مع حفظ الصورة في أرشيف خاص متاح للإدارة فقط. يمكنني مراجعة سياسة الخصوصية أو التواصل مع الإدارة."
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

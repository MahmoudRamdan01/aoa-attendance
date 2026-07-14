import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, LogOut, MapPin, MessageSquare, QrCode, WifiOff } from "lucide-react";
import { distanceMeters, supabase, todayIso } from "../../lib/supabase";
import { cls } from "../../lib/cls";
import { getCompanyLocation } from "../../lib/dates";

import { statusLabels } from "../../lib/labels";

const QUEUE_KEY = "aoa:v1:offlineAttendanceQueue";

function getQueuedActions() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function setQueuedActions(items) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

function getDeviceId() {
  let id = localStorage.getItem("aoa:v1:deviceId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("aoa:v1:deviceId", id);
  }
  return id;
}

function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("المتصفح لا يدعم تحديد الموقع."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 0),
        }),
      () => reject(new Error("لازم تسمح للموقع عشان التسجيل من الشركة.")),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 20000 }
    );
  });
}

function normalizeQr(value) {
  return value.trim().toUpperCase();
}

function EmployeeToday({ context, onToast }) {
  const [qr, setQr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [locationState, setLocationState] = useState(null);
  const [todayRecord, setTodayRecord] = useState(null);
  const [queued, setQueued] = useState(getQueuedActions().length);

  const employee = context?.employee;
  const companyLocation = useMemo(() => getCompanyLocation(context), [context?.location]);

  useEffect(() => {
    loadToday();
    setQueued(getQueuedActions().length);
  }, [employee?.id]);

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

  async function submitAttendance(kind, loc, qrValue, deviceId = getDeviceId(), noteValue = "") {
    const cleanQr = normalizeQr(qrValue);
    const cleanNote = (noteValue || "").trim();
    const distance = distanceMeters(loc, companyLocation);
    setLocationState({ ...loc, distance });
    if (distance > companyLocation.radiusMeters) {
      return {
        error: "outside",
        message: `أنت خارج نطاق الشركة (${Math.round(distance)} متر).`,
      };
    }

    const { data, error } = await supabase.rpc("employee_attendance_action_v1", {
      p_kind: kind,
      p_lat: loc.lat,
      p_lng: loc.lng,
      p_accuracy: loc.accuracy,
      p_qr_code: cleanQr,
      p_device_id: deviceId,
      p_note: cleanNote || null,
    });
    if (error) throw error;
    return data;
  }

  async function attendance(kind) {
    // QR is optional now — attendance works with GPS alone. If a code is typed
    // and the admin has turned QR back on (qr_required), the server validates it.
    setBusy(kind);
    let loc = null;
    try {
      loc = await getLocation();
      const data = await submitAttendance(kind, loc, qr, getDeviceId(), note);
      if (data?.error) {
        onToast(data.message || "تعذر التسجيل.");
      } else {
        onToast(data.label || (kind === "in" ? "تم تسجيل الحضور." : "تم تسجيل الانصراف."));
        setNote("");
        loadToday();
      }
    } catch (error) {
      if (!loc) {
        onToast(error.message || "تعذر تحديد الموقع.");
      } else {
        const nextQueue = [
          ...getQueuedActions(),
          {
            id: crypto.randomUUID(),
            kind,
            qr,
            note,
            location: loc,
            deviceId: getDeviceId(),
            at: new Date().toISOString(),
          },
        ];
        setQueuedActions(nextQueue);
        setQueued(nextQueue.length);
        onToast("تم حفظ العملية Offline لحين عودة الاتصال.");
      }
    }
    setBusy("");
  }

  async function syncQueue() {
    const items = getQueuedActions();
    if (!items.length) return;
    setBusy("sync");
    const remaining = [];
    for (const item of items) {
      try {
        const loc = item.location || (await getLocation());
        const data = await submitAttendance(item.kind, loc, item.qr || qr, item.deviceId, item.note || "");
        if (data?.error) remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }
    setQueuedActions(remaining);
    setQueued(remaining.length);
    loadToday();
    onToast(remaining.length ? `تمت مزامنة ${items.length - remaining.length} وباقي ${remaining.length}.` : "تمت مزامنة كل العمليات المحفوظة.");
    setBusy("");
  }

  const todayNote = todayRecord
    ? [
        statusLabels[todayRecord.status] || todayRecord.status,
        Number(todayRecord.late_minutes || 0) > 0 ? `${todayRecord.late_minutes} دقيقة تأخير` : "",
        Number(todayRecord.deduction_days || 0) > 0 ? `خصم ${todayRecord.deduction_days} يوم` : "",
      ].filter(Boolean).join(" · ")
    : "";

  return (
    <div className="grid two">
      <section className="panel hero-panel">
        <div className="panel-title">
          <Clock3 size={20} />
          <h2>تسجيل اليوم</h2>
        </div>
        <div className="today-status">
          <StatusDot done={!!todayRecord?.check_in} label="حضور" value={todayRecord?.check_in?.slice(0, 5) || "لم يسجل"} />
          <StatusDot done={!!todayRecord?.check_out} label="انصراف" value={todayRecord?.check_out?.slice(0, 5) || "لم يسجل"} />
        </div>
        <label className="field">
          كود QR اليومي (اختياري)
          <input
            dir="ltr"
            value={qr}
            onChange={(e) => setQr(e.target.value.toUpperCase())}
            placeholder="اختياري — تقدر تسجل بالموقع بس"
            autoCapitalize="characters"
            autoComplete="one-time-code"
          />
        </label>
        <label className="field">
          ملاحظة (اختياري)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="اكتب ملاحظة تظهر للإدارة (مثال: اتأخرت بسبب الزحمة)"
            maxLength={280}
          />
        </label>
        {todayRecord?.employee_note && (
          <p className="muted">
            <MessageSquare size={15} /> ملاحظتك المسجلة: {todayRecord.employee_note}
          </p>
        )}
        <div className="actions-row">
          <button className="primary" disabled={busy || !!todayRecord?.check_in} onClick={() => attendance("in")}>
            <CheckCircle2 size={18} /> {busy === "in" ? "جاري..." : "تسجيل حضور"}
          </button>
          <button className="secondary" disabled={busy || !todayRecord?.check_in || !!todayRecord?.check_out} onClick={() => attendance("out")}>
            <LogOut size={18} /> {busy === "out" ? "جاري..." : "تسجيل انصراف"}
          </button>
        </div>
        {locationState && (
          <p className="muted">
            <MapPin size={15} /> المسافة عن الشركة: {Math.round(locationState.distance)} متر · دقة GPS {locationState.accuracy} متر
          </p>
        )}
        {todayNote && <p className="muted">{todayNote}</p>}
        {queued > 0 && (
          <button className="warning-btn" onClick={syncQueue} disabled={busy === "sync"}>
            <WifiOff size={17} /> مزامنة {queued} عملية محفوظة Offline
          </button>
        )}
      </section>

      <section className="panel">
        <div className="panel-title">
          <QrCode size={20} />
          <h2>قواعد التسجيل</h2>
        </div>
        <ul className="rules">
          <li>التسجيل مرة حضور ومرة انصراف يوميًا.</li>
          <li>لازم تكون داخل {companyLocation.radiusMeters} متر من موقع الشركة.</li>
          <li>كود QR اختياري — تقدر تسجل بالموقع لوحده (بيظهر عند HR/Owner لو حبيت تستخدمه).</li>
          <li>لو النت قطع، العملية تتحفظ وتتزامن عند رجوعه.</li>
        </ul>
      </section>
    </div>
  );
}

function StatusDot({ done, label, value }) {
  return (
    <div className={cls("status-dot", done && "done")}>
      <span />
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

export default EmployeeToday;

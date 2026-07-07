import { useEffect, useMemo, useState } from "react";
import QRCodeLib from "qrcode";
import {
  Banknote,
  Bell,
  CalendarDays,
  CheckCircle2,
  CheckCheck,
  Clipboard,
  Clock3,
  Download,
  LogOut,
  MapPin,
  MessageSquare,
  Plane,
  Printer,
  QrCode,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  UserCog,
  Users,
  WifiOff,
} from "lucide-react";
import {
  COMPANY_LOCATION,
  distanceMeters,
  supabase,
  todayIso,
} from "./lib/supabase";

const QUEUE_KEY = "aoa:v1:offlineAttendanceQueue";
const roleNames = { employee: "موظف", hr: "HR", owner: "Owner" };
const statusLabels = {
  present: "حاضر",
  late: "متأخر",
  absent: "غياب",
  leave: "أجازة",
  mission: "مأمورية",
  sick: "مرضي",
  pending: "معلّق",
  approved: "مربوط",
  rejected: "مرفوض",
};
const notificationCategoryLabels = {
  admin_message: "رسالة إدارية",
  approval: "موافقة مطلوبة",
  qr: "QR يومي",
  system: "النظام",
};
const roleOptions = [
  { value: "employee", label: "موظف" },
  { value: "hr", label: "HR" },
  { value: "owner", label: "Owner" },
];

function addDays(date, days) {
  // Parse and compute in UTC. Parsing "${date}T00:00:00" as *local* time and then
  // reading it back via toISOString() (UTC) makes positive-offset timezones (e.g.
  // Africa/Cairo, UTC+2/+3) land on the same day — which made datesBetween() loop
  // forever and froze the Owner dashboard. UTC-only math avoids that entirely.
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function dateRangeForPeriod(period, anchor = todayIso()) {
  const day = new Date(`${anchor}T00:00:00Z`);
  if (period === "day") return { from: anchor, to: anchor, label: "اليوم" };
  if (period === "week") {
    const start = new Date(day);
    const dayIndex = start.getUTCDay();
    const diffToSaturday = (dayIndex + 1) % 7;
    start.setUTCDate(start.getUTCDate() - diffToSaturday);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
      label: "الأسبوع",
    };
  }
  return { from: `${anchor.slice(0, 7)}-01`, to: anchor, label: "الشهر" };
}

function datesBetween(from, to) {
  const dates = [];
  let cursor = from;
  // Safety cap (defense-in-depth): never iterate more than ~2 years of days.
  while (cursor <= to && dates.length < 800) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function getCompanyLocation(context) {
  const loc = context?.location;
  if (!loc?.lat || !loc?.lng) return COMPANY_LOCATION;
  return {
    label: loc.label || COMPANY_LOCATION.label,
    lat: Number(loc.lat),
    lng: Number(loc.lng),
    radiusMeters: Number(loc.radius_m || loc.radiusMeters || COMPANY_LOCATION.radiusMeters),
  };
}

function cls(...items) {
  return items.filter(Boolean).join(" ");
}

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

function money(value) {
  return Math.round(Number(value || 0)).toLocaleString("en-US");
}

function fmtDate(date) {
  return new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function fmtDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ar-EG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeQr(value) {
  return value.trim().toUpperCase();
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function App() {
  const [session, setSession] = useState(null);
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState("today");
  const [toast, setToast] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setContext(null);
      return;
    }
    loadContext();
  }, [session]);

  useEffect(() => {
    if (!context) return;
    const role = context.role || "employee";
    const isAdminOnly = (role === "hr" || role === "owner") && !context.employee;
    if (isAdminOnly && (activeView === "today" || activeView === "requests")) {
      setActiveView(role === "owner" ? "owner" : "admin");
    }
  }, [context?.role, context?.employee?.id, activeView]);

  useEffect(() => {
    if (!session || !context || context.migration_required) return;
    let cancelled = false;
    supabase.rpc("broadcast_daily_qr_v1").then(({ data }) => {
      if (!cancelled && data?.sent && (context.role === "hr" || context.role === "owner")) {
        setToast(`تم إرسال QR اليوم تلقائيًا إلى ${data.count || 0} من الفريق.`);
      }
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, context?.role, context?.employee?.id, context?.migration_required]);

  async function loadContext() {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_my_context_v1");
    if (!error && data) {
      setContext(data);
      setLoading(false);
      return;
    }

    const uid = session.user.id;
    const { data: admin } = await supabase
      .from("app_admins")
      .select("role,name")
      .eq("user_id", uid)
      .maybeSingle();
    setContext({
      role: admin?.role || "employee",
      admin_name: admin?.name || session.user.email,
      employee: null,
      migration_required: true,
      setup_message:
        "شغّل migration v1 عشان employee portal وGPS والـ notifications يشتغلوا بالكامل.",
    });
    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setContext(null);
  }

  if (loading) return <Splash />;
  if (!session) return <LoginScreen />;

  const role = context?.role || "employee";
  const isAdmin = role === "hr" || role === "owner";
  const hasEmployeePortal = !!context?.employee;

  return (
    <div className="app-shell">
      <aside className="side">
        <div className="brand">
          <div className="brand-mark">
            <Plane size={24} />
          </div>
          <div>
            <p>Air Ocean Line</p>
            <strong>HR v1</strong>
          </div>
        </div>

        <nav className="nav">
          {hasEmployeePortal && (
            <>
              <button className={cls(activeView === "today" && "active")} onClick={() => setActiveView("today")}>
                <Clock3 size={18} /> اليوم
              </button>
              <button className={cls(activeView === "requests" && "active")} onClick={() => setActiveView("requests")}>
                <CalendarDays size={18} /> الطلبات
              </button>
            </>
          )}
          <button className={cls(activeView === "notifications" && "active")} onClick={() => setActiveView("notifications")}>
            <Bell size={18} /> الإشعارات
          </button>
          {isAdmin && (
            <button className={cls(activeView === "admin" && "active")} onClick={() => setActiveView("admin")}>
              <UserCog size={18} /> الإدارة
            </button>
          )}
          {role === "owner" && (
            <button className={cls(activeView === "owner" && "active")} onClick={() => setActiveView("owner")}>
              <ShieldCheck size={18} /> Owner
            </button>
          )}
        </nav>

        <button className="logout" onClick={signOut}>
          <LogOut size={18} /> خروج
        </button>
      </aside>

      <main className="main">
        <header className="top">
          <div>
            <span className="eyebrow">{fmtDate(new Date())}</span>
            <h1>أهلًا، {context?.employee?.name || context?.admin_name || session.user.email}</h1>
          </div>
          <div className="top-actions">
            <span className="badge">{roleNames[role] || role}</span>
            <button className="icon-btn" onClick={loadContext} title="تحديث">
              <RefreshCcw size={18} />
            </button>
          </div>
        </header>

        {context?.migration_required && <SetupBanner message={context.setup_message} />}
        {toast && <div className="toast">{toast}</div>}

        {activeView === "today" && hasEmployeePortal && (
          <EmployeeToday context={context} session={session} onToast={setToast} />
        )}
        {activeView === "requests" && hasEmployeePortal && (
          <RequestsView context={context} session={session} onToast={setToast} />
        )}
        {activeView === "notifications" && <NotificationsView context={context} onToast={setToast} />}
        {activeView === "admin" && isAdmin && (
          <AdminDashboard context={context} onToast={setToast} />
        )}
        {activeView === "owner" && role === "owner" && <OwnerDashboard onToast={setToast} />}
      </main>
    </div>
  );
}

function Splash() {
  return (
    <div className="splash">
      <div className="brand-mark large">
        <Plane size={34} />
      </div>
      <p>تحميل نظام Air Ocean Line...</p>
    </div>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage("الإيميل أو الباسورد غير صحيح.");
    setBusy(false);
  }

  return (
    <main className="login-screen">
      <section className="login-panel">
        <div className="brand login-brand">
          <div className="brand-mark">
            <Plane size={24} />
          </div>
          <div>
            <p>Air Ocean Line</p>
            <strong>نظام الحضور والموارد البشرية</strong>
          </div>
        </div>
        <form onSubmit={login}>
          <label>
            الإيميل
            <input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </label>
          <label>
            الباسورد
            <input dir="ltr" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "جار الدخول..." : "دخول"}
          </button>
          {message && <p className="error">{message}</p>}
        </form>
      </section>
    </main>
  );
}

function SetupBanner({ message }) {
  return (
    <div className="setup-banner">
      <Sparkles size={18} />
      <span>{message}</span>
    </div>
  );
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
    if (!normalizeQr(qr)) {
      onToast("اكتب كود QR قبل تحديد الموقع.");
      return;
    }
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
          كود QR اليومي
          <input
            dir="ltr"
            value={qr}
            onChange={(e) => setQr(e.target.value.toUpperCase())}
            placeholder="اكتب أو امسح كود اليوم"
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
          <li>كود QR يتغير يوميًا ويظهر عند HR/Owner.</li>
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

function RequestsView({ context, onToast }) {
  const [kind, setKind] = useState("permission");
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshRequests = () => setRefreshKey((key) => key + 1);

  return (
    <div className="grid two">
      <section className="panel">
        <div className="tabs compact-tabs">
          <button className={cls(kind === "permission" && "active")} onClick={() => setKind("permission")}>إذن</button>
          <button className={cls(kind === "leave" && "active")} onClick={() => setKind("leave")}>أجازة</button>
        </div>
        {kind === "permission" ? (
          <PermissionForm onToast={onToast} onDone={refreshRequests} />
        ) : (
          <LeaveForm context={context} onToast={onToast} onDone={refreshRequests} />
        )}
      </section>
      <MyRequests context={context} refreshKey={refreshKey} />
    </div>
  );
}

function PermissionForm({ onToast, onDone }) {
  const [date, setDate] = useState(todayIso());
  const [hours, setHours] = useState(1);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("request_permission_v1", {
      p_date: date,
      p_hours_requested: hours,
      p_reason: reason,
    });
    setBusy(false);
    if (error || data?.error) onToast(data?.message || "تعذر إرسال طلب الإذن.");
    else {
      setReason("");
      onToast("تم إرسال طلب الإذن.");
      onDone?.();
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <h2>طلب إذن</h2>
      <label>اليوم<input type="date" value={date} min={todayIso()} onChange={(e) => setDate(e.target.value)} /></label>
      <label>المدة المطلوبة<select value={hours} onChange={(e) => setHours(Number(e.target.value))}><option value={1}>ساعة</option><option value={2}>ساعتين</option></select></label>
      <label>السبب<input value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="اكتب السبب بوضوح" /></label>
      <button className="primary" disabled={busy}>{busy ? "جار الإرسال..." : "إرسال الطلب"}</button>
      <p className="muted">الحد: 3 أذونات شهريًا، وغير مسموح بأيام متتالية.</p>
    </form>
  );
}

function LeaveForm({ context, onToast, onDone }) {
  const minLeaveDate = addDays(todayIso(), 1);
  const [from, setFrom] = useState(minLeaveDate);
  const [to, setTo] = useState(minLeaveDate);
  const [cover, setCover] = useState("");
  const [reason, setReason] = useState("");
  const [employees, setEmployees] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("kiosk_employees").select("id,name,active").eq("active", true).order("id").then(({ data }) => {
      setEmployees((data || []).filter((emp) => emp.id !== context?.employee?.id));
    });
  }, [context?.employee?.id]);

  function updateFrom(value) {
    setFrom(value);
    if (to < value) setTo(value);
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("request_leave_v1", {
      p_from: from,
      p_to: to,
      p_cover: Number(cover),
      p_reason: reason,
    });
    setBusy(false);
    if (error || data?.error) onToast(data?.message || "تعذر إرسال طلب الأجازة.");
    else {
      setReason("");
      onToast("تم إرسال طلب الأجازة.");
      onDone?.();
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <h2>طلب أجازة</h2>
      <div className="form-grid">
        <label>من<input type="date" value={from} min={minLeaveDate} onChange={(e) => updateFrom(e.target.value)} /></label>
        <label>إلى<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <label>الموظف البديل<select value={cover} onChange={(e) => setCover(e.target.value)} required><option value="">اختار Cover</option>{employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}</select></label>
      <label>السبب<input value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="سبب الأجازة" /></label>
      <button className="primary" disabled={busy}>{busy ? "جار الإرسال..." : "إرسال الطلب"}</button>
      <p className="muted">الحد: يومين شهريًا، غير متتاليين، وتخصم من الرصيد السنوي.</p>
    </form>
  );
}

function MyRequests({ context, refreshKey }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!context?.employee?.id) return;
    setLoading(true);
    Promise.all([
      supabase.from("permissions").select("id,perm_date,hours,hours_requested,hours_approved,reason,status,decision_note,decided_at").eq("employee_id", context.employee.id).order("perm_date", { ascending: false }).limit(10),
      supabase.from("leave_requests").select("id,from_date,to_date,days,reason,status,decision_note,decided_at").eq("employee_id", context.employee.id).order("from_date", { ascending: false }).limit(10),
    ]).then(([p, l]) => {
      const nextRows = [
        ...(p.data || []).map((item) => ({
          type: "إذن",
          date: item.perm_date,
          sortDate: item.perm_date,
          status: item.status,
          meta: `${item.hours_requested || item.hours} ساعة مطلوبة${item.hours_approved ? ` · المعتمد ${item.hours_approved} ساعة` : ""}`,
          reason: item.reason,
          decision: item.decision_note,
          decidedAt: item.decided_at,
        })),
        ...(l.data || []).map((item) => ({
          type: "أجازة",
          date: `${item.from_date} → ${item.to_date}`,
          sortDate: item.from_date,
          status: item.status,
          meta: `${item.days} يوم`,
          reason: item.reason,
          decision: item.decision_note,
          decidedAt: item.decided_at,
        })),
      ].sort((a, b) => b.sortDate.localeCompare(a.sortDate));
      setRows(nextRows);
      setLoading(false);
    });
  }, [context?.employee?.id, refreshKey]);

  return (
    <section className="panel">
      <div className="panel-title"><CalendarDays size={20} /><h2>طلباتي</h2></div>
      <div className="list">
        {loading && <p className="muted">جاري تحميل الطلبات...</p>}
        {!loading && rows.length === 0 && <p className="muted">لا توجد طلبات بعد.</p>}
        {rows.map((row, index) => (
          <div className="list-row" key={`${row.type}-${row.date}-${index}`}>
            <div><strong>{row.type}</strong><span>{row.date}</span></div>
            <p>{row.meta}</p>
            {row.reason && <p>السبب: {row.reason}</p>}
            {row.decision && <p>قرار الإدارة: {row.decision}{row.decidedAt ? ` · ${fmtDateTime(row.decidedAt)}` : ""}</p>}
            <StatusBadge status={row.status} />
          </div>
        ))}
      </div>
    </section>
  );
}

function AdminDashboard({ context, onToast }) {
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [reportDate, setReportDate] = useState(todayIso());
  const [holiday, setHoliday] = useState({ date: todayIso(), to: todayIso(), label: "" });
  const [qr, setQr] = useState({ today: "", tomorrow: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    loadAdmin();
  }, [reportDate]);

  async function loadAdmin() {
    setLoading(true);
    setError("");
    try {
      const [emp, att, perm, leave, qrData, tomorrowQr] = await Promise.all([
        supabase.from("employees").select("id,name,leave_balance,active").order("id"),
        supabase.from("attendance").select("*").eq("work_date", reportDate),
        supabase.from("permissions").select("*, employees(name)").eq("status", "pending").order("perm_date"),
        supabase.from("leave_requests").select("*, employees!leave_requests_employee_id_fkey(name), cover:employees!leave_requests_cover_employee_id_fkey(name)").eq("status", "pending").order("from_date"),
        supabase.rpc("get_daily_qr_v1"),
        supabase.rpc("get_qr_for_date_v1", { p_date: addDays(todayIso(), 1) }),
      ]);
      const failed = [emp, att, perm, leave, qrData, tomorrowQr].find((item) => item.error);
      if (failed) throw failed.error;
      setEmployees(emp.data || []);
      setAttendance(att.data || []);
      setPermissions(perm.data || []);
      setLeaves(leave.data || []);
      setQr({
        today: qrData.data?.code || "",
        tomorrow: tomorrowQr.data?.code || "",
      });
    } catch (err) {
      setError(err.message || "تعذر تحميل بيانات الإدارة.");
    }
    setLoading(false);
  }

  async function reset(empId) {
    const ok = confirm("تمسح سجل اليوم للموظف ده؟ العملية هتتسجل في Audit Log.");
    if (!ok) return;
    const { data, error } = await supabase.rpc("reset_attendance_day_v1", {
      p_employee_id: empId,
      p_date: reportDate,
      p_reason: "تصحيح سجل من لوحة v1",
    });
    if (error || data?.error) onToast(data?.message || "Owner فقط يقدر يمسح السجل.");
    else {
      onToast("تم مسح سجل اليوم.");
      loadAdmin();
    }
  }

  async function decidePermission(id, approve, hoursApproved) {
    if (context.role !== "owner") {
      onToast("الموافقة على الأذونات Owner فقط.");
      return;
    }
    const { data, error } = await supabase.rpc("decide_permission_v1", {
      p_id: id,
      p_approve: approve,
      p_hours_approved: hoursApproved,
      p_note: approve ? "تمت الموافقة" : "تم الرفض",
    });
    if (error || data?.error) onToast(data?.message || "تعذر تحديث الإذن.");
    else {
      onToast("تم تحديث طلب الإذن.");
      loadAdmin();
    }
  }

  async function decideLeave(id, approve) {
    if (context.role !== "owner") {
      onToast("الموافقة على الأجازات Owner فقط.");
      return;
    }
    const { data, error } = await supabase.rpc("decide_leave_v1", {
      p_id: id,
      p_approve: approve,
      p_note: approve ? "تمت الموافقة" : "تم الرفض",
    });
    if (error || data?.error) onToast(data?.message || "تعذر تحديث الأجازة.");
    else {
      onToast("تم تحديث طلب الأجازة.");
      loadAdmin();
    }
  }

  async function submitHoliday(event) {
    event.preventDefault();
    const from = holiday.date <= holiday.to ? holiday.date : holiday.to;
    const to = holiday.date <= holiday.to ? holiday.to : holiday.date;
    let failed = null;
    for (const day of datesBetween(from, to)) {
      const { data, error } = await supabase.rpc("set_official_holiday_v1", {
        p_date: day,
        p_label: holiday.label || "أجازة رسمية",
      });
      if (error || data?.error) {
        failed = data?.message || "تعذر تسجيل الأجازة الرسمية.";
        break;
      }
    }
    if (failed) onToast(failed);
    else {
      onToast("تم تسجيل الأجازة الرسمية.");
      setHoliday({ date: todayIso(), to: todayIso(), label: "" });
    }
  }

  async function markMissingCheckouts() {
    const { data, error } = await supabase.rpc("mark_missing_checkouts_v1", {
      p_date: reportDate,
    });
    if (error || data?.error) onToast(data?.message || "تعذر مراجعة الانصراف.");
    else {
      onToast(`تمت مراجعة ${data?.processed || 0} سجل بدون انصراف.`);
      loadAdmin();
    }
  }

  const recs = useMemo(() => new Map(attendance.map((row) => [row.employee_id, row])), [attendance]);
  const adminStats = useMemo(() => {
    const active = employees.filter((emp) => emp.active !== false);
    const checkedIn = active.filter((emp) => recs.get(emp.id)?.check_in).length;
    const late = active.filter((emp) => recs.get(emp.id)?.status === "late").length;
    const pending = active.filter((emp) => recs.get(emp.id)?.status === "pending").length;
    const missingCheckout = active.filter((emp) => {
      const rec = recs.get(emp.id);
      return rec?.check_in && !rec?.check_out && ["present", "late"].includes(rec.status);
    }).length;
    const deductions = attendance.reduce((sum, rec) => sum + Number(rec.deduction_days || 0), 0);
    return {
      active: active.length,
      checkedIn,
      notRegistered: Math.max(0, active.length - checkedIn),
      late,
      pending,
      missingCheckout,
      deductions,
    };
  }, [employees, attendance, recs]);
  const filteredEmployees = useMemo(() => {
    const query = employeeQuery.trim().toLowerCase();
    return employees.filter((emp) => {
      const rec = recs.get(emp.id);
      const status = rec?.status || "none";
      const matchesStatus = statusFilter === "all" || statusFilter === status;
      const matchesQuery = !query || emp.name.toLowerCase().includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [employees, employeeQuery, statusFilter, recs]);
  const canApprove = context.role === "owner";

  return (
    <div className="stack">
      {error && <div className="setup-banner">{error}</div>}
      <section className="panel">
        <div className="panel-title between">
          <div><Users size={20} /><h2>جدول الحضور</h2></div>
          <div className="toolbar">
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
            <button className="secondary" onClick={markMissingCheckouts}>مراجعة الانصراف</button>
            <button className="secondary" onClick={loadAdmin}>تحديث</button>
          </div>
        </div>
        <div className="stats-grid compact-stats">
          <Metric label="الموظفون" value={adminStats.active} />
          <Metric label="سجلوا حضور" value={adminStats.checkedIn} tone="info" />
          <Metric label="لم يسجلوا" value={adminStats.notRegistered} tone="danger" />
          <Metric label="تأخير" value={adminStats.late} tone="warn" />
          <Metric label="بدون انصراف" value={adminStats.missingCheckout} tone="gold" />
        </div>
        <div className="toolbar table-filters">
          <label className="search-field">
            <Search size={16} />
            <input value={employeeQuery} onChange={(e) => setEmployeeQuery(e.target.value)} placeholder="بحث باسم الموظف" />
          </label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">كل الحالات</option>
            <option value="none">لم يسجل</option>
            <option value="present">حاضر</option>
            <option value="late">متأخر</option>
            <option value="pending">معلق</option>
            <option value="leave">أجازة</option>
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>الموظف</th><th>الحالة</th><th>حضور</th><th>انصراف</th><th>خصم</th><th>ملاحظات</th><th>إجراء</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan="7">جاري التحميل...</td></tr>}
              {!loading && filteredEmployees.length === 0 && <tr><td colSpan="7">لا توجد نتائج مطابقة.</td></tr>}
              {!loading && filteredEmployees.map((emp) => {
                const rec = recs.get(emp.id);
                return (
                  <tr key={emp.id}>
                    <td>{emp.name}</td>
                    <td>{rec ? <StatusBadge status={rec.status} /> : "لم يسجل"}</td>
                    <td dir="ltr">{rec?.check_in?.slice(0, 5) || "-"}</td>
                    <td dir="ltr">{rec?.check_out?.slice(0, 5) || "-"}</td>
                    <td>{rec?.deduction_days || 0} يوم</td>
                    <td>
                      <AdminNoteCell empId={emp.id} rec={rec} reportDate={reportDate} onToast={onToast} onSaved={loadAdmin} />
                    </td>
                    <td>{context.role === "owner" && rec ? <button className="danger-link" onClick={() => reset(emp.id)}>تراجع</button> : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid two">
        <section className="panel">
          <div className="panel-title"><QrCode size={20} /><h2>QR اليوم</h2></div>
          <div className="qr-stack">
            <QrDisplay label="اليوم" code={qr.today} date={todayIso()} onToast={onToast} />
            <QrDisplay label="بكرة" code={qr.tomorrow} date={addDays(todayIso(), 1)} muted onToast={onToast} />
          </div>
          <p className="muted">الكود بيتولد ويتبعت تلقائيًا للفريق مرة واحدة يوميًا. اللوحة هنا للعرض والطباعة فقط.</p>
        </section>
        <form className="panel form" onSubmit={submitHoliday}>
          <div className="panel-title"><CalendarDays size={20} /><h2>أجازة رسمية</h2></div>
          <div className="form-grid">
            <label>من<input type="date" value={holiday.date} onChange={(e) => setHoliday((h) => ({ ...h, date: e.target.value }))} /></label>
            <label>إلى<input type="date" value={holiday.to} onChange={(e) => setHoliday((h) => ({ ...h, to: e.target.value }))} /></label>
          </div>
          <label>السبب<input value={holiday.label} onChange={(e) => setHoliday((h) => ({ ...h, label: e.target.value }))} placeholder="مثال: عيد رسمي" /></label>
          <button className="primary">تسجيل أجازة رسمية</button>
        </form>
      </div>

      <Approvals title="أذونات معلقة" rows={permissions} type="permission" canApprove={canApprove} onPermission={decidePermission} />
      <Approvals title="أجازات معلقة" rows={leaves} type="leave" canApprove={canApprove} onLeave={decideLeave} />
    </div>
  );
}

function AdminNoteCell({ empId, rec, reportDate, onToast, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(rec?.hr_note || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValue(rec?.hr_note || "");
    setEditing(false);
  }, [rec?.hr_note, reportDate, empId]);

  async function save() {
    setBusy(true);
    const { data, error } = await supabase.rpc("set_attendance_note_v1", {
      p_employee_id: empId,
      p_date: reportDate,
      p_note: value.trim() || null,
    });
    setBusy(false);
    if (error || data?.error) {
      onToast(data?.message || "تعذر حفظ الملاحظة.");
      return;
    }
    onToast("تم حفظ الملاحظة.");
    setEditing(false);
    onSaved();
  }

  return (
    <div className="note-cell">
      {rec?.employee_note && (
        <p className="note-emp" title="ملاحظة الموظف">
          <MessageSquare size={13} /> {rec.employee_note}
        </p>
      )}
      {editing ? (
        <div className="note-edit">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="ملاحظة الإدارة (مثال: تأخير)"
            maxLength={280}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                setValue(rec?.hr_note || "");
                setEditing(false);
              }
            }}
          />
          <button className="link" onClick={save} disabled={busy}>{busy ? "..." : "حفظ"}</button>
          <button className="link-muted" onClick={() => { setValue(rec?.hr_note || ""); setEditing(false); }}>إلغاء</button>
        </div>
      ) : (
        <button className="note-hr" onClick={() => setEditing(true)} title="اكتب ملاحظة للإدارة">
          {rec?.hr_note ? rec.hr_note : <span className="muted">+ ملاحظة</span>}
        </button>
      )}
    </div>
  );
}

function Approvals({ title, rows, type, canApprove, onPermission, onLeave }) {
  return (
    <section className="panel">
      <div className="panel-title"><Bell size={20} /><h2>{title}</h2></div>
      <div className="list">
        {rows.length === 0 && <p className="muted">لا توجد طلبات معلقة.</p>}
        {rows.map((row) => (
          <div className="approval-row" key={row.id}>
            <div>
              <strong>{row.employees?.name || `موظف #${row.employee_id}`}</strong>
              <span>{type === "permission" ? `${row.perm_date} · ${row.hours_requested || row.hours} ساعة` : `${row.from_date} → ${row.to_date}`}</span>
              {type === "leave" && row.cover?.name && <span>Cover: {row.cover.name}</span>}
              <p>{row.reason || "بدون سبب"}</p>
            </div>
            <div className="approval-actions">
              {!canApprove && <span className="badge">قرار Owner فقط</span>}
              {canApprove && type === "permission" && (
                <>
                  <button onClick={() => onPermission(row.id, true, 1)}>موافقة ساعة</button>
                  <button onClick={() => onPermission(row.id, true, 2)}>موافقة ساعتين</button>
                  <button className="danger-link" onClick={() => onPermission(row.id, false, null)}>رفض</button>
                </>
              )}
              {canApprove && type === "leave" && (
                <>
                  <button onClick={() => onLeave(row.id, true)}>موافقة</button>
                  <button className="danger-link" onClick={() => onLeave(row.id, false)}>رفض</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function QrDisplay({ label, code, date, muted, onToast }) {
  const [image, setImage] = useState("");

  useEffect(() => {
    if (!code) {
      setImage("");
      return;
    }
    QRCodeLib.toDataURL(code, {
      width: 190,
      margin: 2,
      color: {
        dark: muted ? "#667085" : "#071224",
        light: "#ffffff",
      },
    }).then(setImage).catch(() => setImage(""));
  }, [code, muted]);

  async function copyCode() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    onToast?.(`تم نسخ كود ${label}.`);
  }

  return (
    <div className={cls("qr-card", muted && "muted")}>
      <div>
        <span>{label}</span>
        {date && <small>{date}</small>}
      </div>
      {image ? <img src={image} alt={`QR ${label}`} /> : <div className="qr-placeholder">QR</div>}
      <div className="qr-code">{code || "-"}</div>
      <div className="qr-actions">
        <button className="secondary" type="button" onClick={copyCode} disabled={!code}>
          <Clipboard size={15} /> نسخ
        </button>
        <button className="secondary" type="button" onClick={() => window.print()} disabled={!code}>
          <Printer size={15} /> طباعة
        </button>
      </div>
    </div>
  );
}

function OwnerDashboard({ onToast }) {
  const [rows, setRows] = useState([]);
  const [salaries, setSalaries] = useState({});
  const [employees, setEmployees] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [period, setPeriod] = useState("month");
  const [reportDate, setReportDate] = useState(todayIso());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const range = useMemo(() => dateRangeForPeriod(period, reportDate), [period, reportDate]);

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([
      supabase.from("attendance").select("*").gte("work_date", range.from).lte("work_date", range.to),
      supabase.from("salaries").select("employee_id,monthly_salary"),
      supabase.from("employees").select("id,name,active").eq("active", true).order("id"),
      supabase.from("official_holidays").select("holiday_date,label").gte("holiday_date", range.from).lte("holiday_date", range.to),
    ]).then(([att, sal, emp, hol]) => {
      const failed = [att, sal, emp, hol].find((item) => item.error);
      if (failed) throw failed.error;
      setRows(att.data || []);
      setSalaries(Object.fromEntries((sal.data || []).map((s) => [s.employee_id, Number(s.monthly_salary || 0)])));
      setEmployees(emp.data || []);
      setHolidays(hol.data || []);
      setLoading(false);
    }).catch((err) => {
      setError(err.message || "تعذر تحميل تقارير الـ Owner.");
      setLoading(false);
    });
  }, [range.from, range.to]);

  const stats = useMemo(() => {
    const holidaySet = new Set(holidays.map((item) => item.holiday_date));
    const workDates = datesBetween(range.from, range.to).filter((day) => {
      const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
      return dow !== 5 && !holidaySet.has(day);
    });
    const expected = employees.length * workDates.length;
    const employeeMap = new Map(employees.map((emp) => [emp.id, emp.name]));
    const total = rows.length;
    const checkedIn = rows.filter((r) => r.check_in).length;
    const absent = rows.filter((r) => r.status === "absent").length;
    const late = rows.filter((r) => r.status === "late").length;
    const leave = rows.filter((r) => ["leave", "mission", "sick"].includes(r.status)).length;
    const missingCheckout = rows.filter((r) => r.check_in && !r.check_out && ["present", "late"].includes(r.status)).length;
    const deductionDays = rows.reduce((sum, r) => sum + Number(r.deduction_days || 0) + (r.status === "absent" ? 1 : 0), 0);
    const deductions = rows.reduce((sum, r) => {
      const days = Number(r.deduction_days || 0) + (r.status === "absent" ? 1 : 0);
      return sum + days * ((salaries[r.employee_id] || 0) / 30);
    }, 0);
    const lateByEmployee = rows.reduce((acc, row) => {
      if (row.status !== "late") return acc;
      const current = acc.get(row.employee_id) || { employee_id: row.employee_id, name: employeeMap.get(row.employee_id) || `#${row.employee_id}`, count: 0, minutes: 0 };
      current.count += 1;
      current.minutes += Number(row.late_minutes || 0);
      acc.set(row.employee_id, current);
      return acc;
    }, new Map());
    const rowsByEmployee = rows.reduce((acc, row) => {
      const list = acc.get(row.employee_id) || [];
      list.push(row);
      acc.set(row.employee_id, list);
      return acc;
    }, new Map());
    const payrollRows = employees.map((emp) => {
      const employeeRows = rowsByEmployee.get(emp.id) || [];
      const salary = salaries[emp.id] || 0;
      const empDeductionDays = employeeRows.reduce((sum, row) => (
        sum + Number(row.deduction_days || 0) + (row.status === "absent" ? 1 : 0)
      ), 0);
      const empDeductionAmount = empDeductionDays * (salary / 30);
      return {
        employee_id: emp.id,
        name: emp.name,
        salary,
        deductionDays: empDeductionDays,
        deductionAmount: empDeductionAmount,
        netSalary: Math.max(0, salary - empDeductionAmount),
        late: employeeRows.filter((row) => row.status === "late").length,
        absent: employeeRows.filter((row) => row.status === "absent").length,
        missingCheckout: employeeRows.filter((row) => row.check_in && !row.check_out && ["present", "late"].includes(row.status)).length,
      };
    }).sort((a, b) => b.deductionAmount - a.deductionAmount || a.name.localeCompare(b.name, "ar"));
    return {
      total,
      expected,
      checkedIn,
      absent,
      late,
      leave,
      missingCheckout,
      deductionDays,
      deductions,
      attendanceRate: expected ? Math.round(((checkedIn + leave) / expected) * 100) : 0,
      lateByEmployee: [...lateByEmployee.values()].sort((a, b) => b.count - a.count || b.minutes - a.minutes).slice(0, 5),
      payrollRows,
    };
  }, [rows, salaries, employees, holidays, range.from, range.to]);

  function exportCsv() {
    const employeeMap = new Map(employees.map((emp) => [emp.id, emp.name]));
    const header = ["التاريخ", "الموظف", "الحالة", "حضور", "انصراف", "تأخير", "خصم أيام"];
    const lines = rows.map((row) => [
      row.work_date,
      employeeMap.get(row.employee_id) || row.employee_id,
      statusLabels[row.status] || row.status,
      row.check_in || "",
      row.check_out || "",
      row.late_minutes || 0,
      row.deduction_days || 0,
    ].map(csvCell).join(","));
    downloadTextFile(`aoa-attendance-${range.from}-${range.to}.csv`, `\ufeff${header.map(csvCell).join(",")}\n${lines.join("\n")}`);
  }

  function exportPayrollCsv() {
    const header = ["الموظف", "المرتب الشهري", "خصم أيام", "قيمة الخصم", "الصافي التقديري", "تأخير", "غياب", "بدون انصراف"];
    const lines = stats.payrollRows.map((row) => [
      row.name,
      row.salary,
      row.deductionDays.toFixed(2),
      row.deductionAmount.toFixed(2),
      row.netSalary.toFixed(2),
      row.late,
      row.absent,
      row.missingCheckout,
    ].map(csvCell).join(","));
    downloadTextFile(`aoa-payroll-${range.from}-${range.to}.csv`, `\ufeff${header.map(csvCell).join(",")}\n${lines.join("\n")}`);
  }

  return (
    <div className="stack">
      {error && <div className="setup-banner">{error}</div>}
      <section className="panel">
        <div className="panel-title between">
          <div><Download size={20} /><h2>تقارير وتحليلات</h2></div>
          <div className="toolbar">
            <div className="tabs compact-tabs no-margin">
              <button className={cls(period === "day" && "active")} onClick={() => setPeriod("day")}>يومي</button>
              <button className={cls(period === "week" && "active")} onClick={() => setPeriod("week")}>أسبوعي</button>
              <button className={cls(period === "month" && "active")} onClick={() => setPeriod("month")}>شهري</button>
            </div>
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
            <button className="secondary" onClick={exportCsv} disabled={loading || rows.length === 0}>CSV</button>
            <button className="secondary" onClick={() => window.print()}>PDF</button>
          </div>
        </div>
        <p className="muted">الفترة: {range.from} إلى {range.to}</p>
      </section>
      <div className="stats-grid">
        <Metric label="معدل التغطية" value={`${stats.attendanceRate}%`} />
        <Metric label={`سجلات ${range.label}`} value={`${stats.total}/${stats.expected}`} />
        <Metric label="تأخيرات" value={stats.late} tone="warn" />
        <Metric label="بدون انصراف" value={stats.missingCheckout} tone="danger" />
        <Metric label="خصم أيام" value={stats.deductionDays.toFixed(2)} tone="warn" />
        <Metric label="خصومات تقديرية" value={`${money(stats.deductions)} ج`} tone="gold" />
      </div>
      <section className="panel">
        <div className="panel-title between">
          <div><Download size={20} /><h2>تحليل سريع</h2></div>
        </div>
        <Bar label="الحضور" value={stats.checkedIn + stats.leave} max={Math.max(stats.expected, 1)} />
        <Bar label="التأخير" value={stats.late} max={Math.max(stats.total, 1)} tone="warn" />
        <Bar label="غياب مسجل" value={stats.absent} max={Math.max(stats.total, 1)} tone="danger" />
        <Bar label="بدون انصراف" value={stats.missingCheckout} max={Math.max(stats.total, 1)} tone="danger" />
      </section>
      <section className="panel">
        <div className="panel-title between">
          <div><Banknote size={20} /><h2>المرتبات والخصومات</h2></div>
          <button className="secondary" onClick={exportPayrollCsv} disabled={loading || stats.payrollRows.length === 0}>CSV مرتبات</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الموظف</th>
                <th>المرتب الشهري</th>
                <th>خصم أيام</th>
                <th>قيمة الخصم</th>
                <th>الصافي التقديري</th>
                <th>مؤشرات</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="6">جاري التحميل...</td></tr>}
              {!loading && stats.payrollRows.length === 0 && <tr><td colSpan="6">لا توجد بيانات مرتبات.</td></tr>}
              {!loading && stats.payrollRows.map((row) => (
                <tr key={row.employee_id}>
                  <td>{row.name}</td>
                  <td>{money(row.salary)} ج</td>
                  <td>{row.deductionDays.toFixed(2)} يوم</td>
                  <td>{money(row.deductionAmount)} ج</td>
                  <td><strong>{money(row.netSalary)} ج</strong></td>
                  <td>{row.late} تأخير · {row.absent} غياب · {row.missingCheckout} بدون انصراف</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <div className="panel-title"><Clock3 size={20} /><h2>أعلى التأخيرات</h2></div>
        <div className="list">
          {stats.lateByEmployee.length === 0 && <p className="muted">لا توجد تأخيرات في الفترة.</p>}
          {stats.lateByEmployee.map((item) => (
            <div className="list-row compact-row" key={item.employee_id}>
              <div><strong>{item.name}</strong><span>{item.count} مرة · {item.minutes} دقيقة</span></div>
            </div>
          ))}
        </div>
      </section>
      <AccountManager onToast={onToast} />
    </div>
  );
}

function AccountManager({ onToast }) {
  const [employees, setEmployees] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({ employeeId: "", email: "", role: "employee" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    const [emp, acc] = await Promise.all([
      supabase.from("employees").select("id,name,active").eq("active", true).order("id"),
      supabase.rpc("owner_list_employee_accounts_v1"),
    ]);
    setEmployees(emp.data || []);
    setAccounts(acc.data || []);
    if (!form.employeeId && emp.data?.[0]) {
      setForm((current) => ({ ...current, employeeId: String(emp.data[0].id) }));
    }
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("owner_link_employee_account_v1", {
      p_employee_id: Number(form.employeeId),
      p_email: form.email,
      p_role: form.role,
    });
    setBusy(false);
    if (error || data?.error) {
      onToast(data?.message || "تعذر ربط الحساب.");
      return;
    }
    setForm((current) => ({ ...current, email: "" }));
    onToast("تم ربط حساب الموظف.");
    loadAccounts();
  }

  return (
    <section className="panel">
      <div className="panel-title"><UserPlus size={20} /><h2>حسابات الموظفين</h2></div>
      <form className="form account-form" onSubmit={submit}>
        <label>الموظف<select value={form.employeeId} onChange={(e) => setForm((current) => ({ ...current, employeeId: e.target.value }))}>{employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}</select></label>
        <label>إيميل الحساب<input dir="ltr" type="email" value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} required placeholder="employee@airocean.com" /></label>
        <label>الدور<select value={form.role} onChange={(e) => setForm((current) => ({ ...current, role: e.target.value }))}>{roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
        <button className="primary" disabled={busy}>{busy ? "جاري الربط..." : "ربط الحساب"}</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>الموظف</th><th>الإيميل</th><th>الدور</th><th>الحالة</th></tr></thead>
          <tbody>
            {accounts.map((row) => (
              <tr key={row.employee_id}>
                <td>{row.employee_name}</td>
                <td dir="ltr">{row.email || "-"}</td>
                <td>{roleNames[row.admin_role || row.role] || row.admin_role || row.role || "-"}</td>
                <td>{row.user_id ? <StatusBadge status="approved" /> : "غير مربوط"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function NotificationsView({ context, onToast }) {
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [message, setMessage] = useState({ scope: "team", employeeId: "", title: "", body: "" });
  const [busy, setBusy] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const role = context?.role || "employee";
  const isAdmin = role === "hr" || role === "owner";

  useEffect(() => {
    loadNotifications();
    if (isAdmin) {
      supabase.from("employees").select("id,name,active").eq("active", true).order("id").then(({ data }) => {
        setEmployees(data || []);
        if (!message.employeeId && data?.[0]) {
          setMessage((current) => ({ ...current, employeeId: String(data[0].id) }));
        }
      });
    }
  }, [context?.role]);

  async function loadNotifications() {
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("id,title,body,category,priority,read_at,created_at,created_by,group_id")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) onToast?.("تعذر تحميل الإشعارات.");
    setRows(data || []);
    setLoading(false);
  }

  async function sendMessage(event) {
    event.preventDefault();
    setBusy("send");
    const { data, error } = await supabase.rpc("send_admin_message_v1", {
      p_scope: message.scope,
      p_employee_id: message.scope === "employee" ? Number(message.employeeId) : null,
      p_title: message.title,
      p_body: message.body,
    });
    setBusy("");
    if (error || data?.error) {
      onToast?.(data?.message || "تعذر إرسال الإشعار.");
      return;
    }
    setMessage((current) => ({ ...current, title: "", body: "" }));
    onToast?.(`تم إرسال الإشعار إلى ${data.count || 0} مستلم.`);
    loadNotifications();
  }

  async function markRead(id) {
    await supabase.rpc("mark_notification_read_v1", { p_id: id });
    loadNotifications();
  }

  async function markAllRead() {
    setBusy("read-all");
    const { data, error } = await supabase.rpc("mark_all_notifications_read_v1");
    setBusy("");
    if (error || data?.error) {
      onToast?.(data?.message || "تعذر تحديث الإشعارات.");
      return;
    }
    onToast?.(`تم تعليم ${data.count || 0} إشعار كمقروء.`);
    loadNotifications();
  }

  async function deleteForAll(id) {
    const ok = confirm("تحذف الإشعار ده من عند كل المستلمين؟");
    if (!ok) return;
    const { data, error } = await supabase.rpc("owner_delete_notification_v1", { p_id: id });
    if (error || data?.error) {
      onToast?.(data?.message || "تعذر حذف الإشعار.");
      return;
    }
    onToast?.(`تم حذف الإشعار من ${data.count || 0} مستلم.`);
    loadNotifications();
  }

  const unread = rows.filter((row) => !row.read_at).length;
  const visibleRows = rows.filter((row) => filter === "all" || !row.read_at);

  return (
    <div className="stack">
      {isAdmin && (
        <section className="panel">
          <div className="panel-title"><Send size={20} /><h2>إرسال إشعار</h2></div>
          <form className="form message-form" onSubmit={sendMessage}>
            <label>المستلم<select value={message.scope} onChange={(e) => setMessage((current) => ({ ...current, scope: e.target.value }))}><option value="team">الفريق كله</option><option value="employee">موظف معين</option></select></label>
            {message.scope === "employee" && (
              <label>الموظف<select value={message.employeeId} onChange={(e) => setMessage((current) => ({ ...current, employeeId: e.target.value }))}>{employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}</select></label>
            )}
            <label>العنوان<input value={message.title} onChange={(e) => setMessage((current) => ({ ...current, title: e.target.value }))} required placeholder="عنوان مختصر" /></label>
            <label>الرسالة<textarea value={message.body} onChange={(e) => setMessage((current) => ({ ...current, body: e.target.value }))} required placeholder="نص الإشعار" /></label>
            <button className="primary" disabled={busy === "send"}><Send size={17} /> {busy === "send" ? "جاري الإرسال..." : "إرسال"}</button>
          </form>
        </section>
      )}

      <section className="panel">
          <div className="panel-title between">
          <div><Bell size={20} /><h2>الإشعارات</h2></div>
          <div className="toolbar">
            <span className="badge">{unread} غير مقروء</span>
            <div className="tabs compact-tabs no-margin">
              <button className={cls(filter === "all" && "active")} onClick={() => setFilter("all")}>الكل</button>
              <button className={cls(filter === "unread" && "active")} onClick={() => setFilter("unread")}>غير مقروء</button>
            </div>
            <button className="secondary" onClick={markAllRead} disabled={busy === "read-all" || unread === 0}>
              <CheckCheck size={16} /> تعليم الكل
            </button>
            <button className="secondary" onClick={loadNotifications}>تحديث</button>
          </div>
        </div>
        <div className="list">
          {loading && <p className="muted">جاري تحميل الإشعارات...</p>}
          {!loading && visibleRows.length === 0 && <p className="muted">لا توجد إشعارات بعد.</p>}
          {!loading && visibleRows.map((item) => (
            <div className={cls("list-row notification-row", !item.read_at && "unread")} key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <span>{fmtDateTime(item.created_at)} · {notificationCategoryLabels[item.category] || item.category || "النظام"}</span>
              </div>
              <p>{item.body}</p>
              <div className="notification-actions">
                {!item.read_at && <button className="secondary" onClick={() => markRead(item.id)}>تمت القراءة</button>}
                {role === "owner" && <button className="danger-link" onClick={() => deleteForAll(item.id)}><Trash2 size={15} /> حذف من الكل</button>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatusBadge({ status }) {
  return <span className={cls("status-badge", status)}>{statusLabels[status] || status}</span>;
}

function Metric({ label, value, tone }) {
  return (
    <div className={cls("metric", tone)}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Bar({ label, value, max, tone }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="bar-row">
      <span>{label}</span>
      <div className="bar"><i className={tone} style={{ width: `${pct}%` }} /></div>
      <strong>{pct}%</strong>
    </div>
  );
}

export default App;

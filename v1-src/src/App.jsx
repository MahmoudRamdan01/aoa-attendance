import { useEffect, useMemo, useRef, useState } from "react";
import QRCodeLib from "qrcode";
import {
  Activity,
  AlertTriangle,
  Banknote,
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  CheckCheck,
  ChevronLeft,
  Clipboard,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  History,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  Moon,
  PieChart as PieChartIcon,
  Printer,
  QrCode,
  Receipt,
  RefreshCcw,
  Scale,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Wallet,
  TrendingUp,
  UserCheck,
  UserPlus,
  UserCog,
  Users,
  UserX,
  WifiOff,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar as ReBar,
  BarChart as ReBarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart as RePieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
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
  active: "ساري",
  voided: "ملغي",
  confirmed: "مؤكد",
  open: "مفتوح",
  partial: "سداد جزئي",
  settled: "مُسدد",
};
const notificationCategoryLabels = {
  admin_message: "رسالة إدارية",
  approval: "موافقة مطلوبة",
  qr: "QR يومي",
  system: "النظام",
};
const deductionCategoryLabels = {
  damage: "تلفيات",
  penalty: "جزاء",
  uniform: "زي",
  other: "أخرى",
};
const expenseCategoryLabels = {
  water: "مياه",
  electricity: "كهرباء",
  gas: "غاز",
  internet: "إنترنت",
  rent: "إيجار",
  maintenance: "صيانة",
  stationery: "قرطاسية",
  other: "أخرى",
};
const partnerKindLabels = {
  invoice: "فاتورة",
  loan: "سلفة",
  deal: "صفقة",
  other: "أخرى",
};
const partnerDirectionLabels = {
  owed_to_us: "لنا عندهم",
  owed_by_us: "علينا ليهم",
};
const roleOptions = [
  { value: "employee", label: "موظف" },
  { value: "hr", label: "HR" },
  { value: "owner", label: "Owner" },
];

// KPI-style navigation: Arabic primary label + small English secondary label.
const MENU = [
  { id: "today", ar: "اليوم", en: "Today", icon: Clock3, kind: "employee" },
  { id: "month", ar: "سجلي", en: "My Record", icon: History, kind: "employee" },
  { id: "requests", ar: "الطلبات", en: "Requests", icon: CalendarDays, kind: "employee" },
  { id: "notifications", ar: "الإشعارات", en: "Alerts", icon: Bell, kind: "all" },
  { id: "training", ar: "التدريب", en: "Training", icon: GraduationCap, kind: "all" },
  { id: "assistant", ar: "المساعد الذكي", en: "AI Assistant", icon: Sparkles, kind: "all" },
  { id: "deductions", ar: "الاستقطاعات", en: "Deductions", icon: Banknote, kind: "all" },
  { id: "expenses", ar: "المصروفات", en: "Expenses", icon: Receipt, kind: "admin" },
  { id: "partner", ar: "مديونية Air Ocean", en: "Partner Ledger", icon: Scale, kind: "admin" },
  { id: "admin", ar: "الإدارة", en: "Admin", icon: UserCog, kind: "admin" },
  { id: "owner", ar: "لوحة Owner", en: "Owner", icon: ShieldCheck, kind: "owner" },
  { id: "ownerbook", ar: "دفتر شخصي", en: "Owner Book", icon: Wallet, kind: "owner" },
];

const CHART_COLORS = ["#FCC107", "#F59E0B", "#10B981", "#EF4444", "#8B5CF6", "#64748B"];

// نموذج التقييم يظهر فقط لهذه السجلات (أبرار = 1، ندى = 2) بالإضافة إلى الـ Owner.
const EVALUATION_VIEWER_EMPLOYEE_IDS = [1, 2];

function getInitialTheme() {
  try {
    const saved = localStorage.getItem("aol-theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyTheme(theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem("aol-theme", theme);
  } catch {
    /* private mode */
  }
}

function ThemeToggle() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <button
      className="icon-btn"
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      title={theme === "dark" ? "الوضع الفاتح" : "الوضع الغامق"}
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

// Two-tone "ding" via WebAudio — no asset needed. Best-effort: browsers may
// block audio before the first user gesture, so failures are swallowed.
function playNotificationSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const play = (freq, start, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration + 0.05);
    };
    play(880, 0, 0.18);
    play(1174.66, 0.12, 0.22);
    setTimeout(() => ctx.close(), 900);
  } catch {
    /* autoplay restrictions */
  }
}

function nameInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "AO";
  return parts.slice(0, 2).map((part) => part[0]).join("");
}

function BrandLogo({ large }) {
  return (
    <div className={cls("brand-mark", large && "large")}>
      <img src="./logo.png" alt="Air Ocean Line" />
    </div>
  );
}

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
  const [sideOpen, setSideOpen] = useState(() => {
    try {
      return localStorage.getItem("aol-side") !== "closed";
    } catch {
      return true;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unread, setUnread] = useState(0);

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
    if (isAdminOnly && ["today", "month", "requests"].includes(activeView)) {
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

  // Unread notifications counter for the topbar bell (head-count only, RLS-scoped).
  useEffect(() => {
    if (!session || !context || context.migration_required) return;
    let cancelled = false;
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null)
      .then(({ count }) => {
        if (!cancelled) setUnread(count || 0);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, context?.role, activeView]);

  // Realtime: any new notification for me → red badge + toast + ding, instantly.
  useEffect(() => {
    if (!session || !context || context.migration_required) return;
    const channel = supabase
      .channel(`notifications-${session.user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${session.user.id}` },
        (payload) => {
          setUnread((count) => count + 1);
          const title = payload.new?.title || "إشعار جديد";
          const body = payload.new?.body || "";
          setToast(`🔔 ${title}${body ? " — " + body : ""}`);
          playNotificationSound();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, context?.migration_required]);

  if (loading) return <Splash />;
  if (!session) return <LoginScreen />;

  const role = context?.role || "employee";
  const isAdmin = role === "hr" || role === "owner";
  const hasEmployeePortal = !!context?.employee;

  const menuItems = MENU.filter(
    (item) =>
      item.kind === "all" ||
      (item.kind === "employee" && hasEmployeePortal) ||
      (item.kind === "admin" && isAdmin) ||
      (item.kind === "owner" && role === "owner")
  );
  const activeItem = menuItems.find((item) => item.id === activeView) || menuItems[0];
  const displayName = context?.employee?.name || context?.admin_name || session.user.email;

  function toggleSide() {
    setSideOpen((open) => {
      try {
        localStorage.setItem("aol-side", open ? "closed" : "open");
      } catch {
        /* private mode */
      }
      return !open;
    });
  }

  function go(id) {
    setActiveView(id);
    setMobileOpen(false);
  }

  return (
    <div className={cls("app-shell", !sideOpen && "side-collapsed")}>
      <aside className="side">
        <div className="side-head">
          <div className="brand">
            <BrandLogo />
            <div className="brand-text">
              <p>Air Ocean Line</p>
              <strong>الموارد البشرية</strong>
            </div>
          </div>
          <button className="icon-btn" type="button" onClick={toggleSide} title={sideOpen ? "طي القائمة" : "فتح القائمة"}>
            {sideOpen ? <X size={17} /> : <Menu size={17} />}
          </button>
        </div>

        <nav className="nav">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button key={item.id} className={cls(isActive && "active")} onClick={() => go(item.id)} title={item.ar}>
                <Icon size={19} />
                <span className="nav-labels">
                  <b>{item.ar}</b>
                  <span className="nav-en">{item.en}</span>
                </span>
                {isActive && <ChevronLeft className="active-arrow" size={16} />}
              </button>
            );
          })}
        </nav>

        <div className="side-status">
          <p>
            <span className="dot" /> النظام شغّال
          </p>
          <small>Quick · Reliable · Delivered</small>
        </div>

        <button className="logout" onClick={signOut}>
          <LogOut size={18} /> <span>خروج</span>
        </button>
      </aside>

      <div className="mobile-top">
        <div className="m-brand">
          <BrandLogo />
          <strong>Air Ocean Line</strong>
        </div>
        <div className="top-actions">
          <button className="icon-btn" type="button" onClick={() => setMobileOpen((open) => !open)} title="القائمة">
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div className="mobile-menu">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={cls(activeView === item.id && "active")} onClick={() => go(item.id)}>
                <Icon size={19} /> {item.ar}
              </button>
            );
          })}
          <button className="logout" onClick={signOut}>
            <LogOut size={18} /> <span>خروج</span>
          </button>
        </div>
      )}

      <main className="main">
        <header className="top">
          <div>
            <span className="eyebrow">
              {fmtDate(new Date())} · أهلًا، {displayName}
            </span>
            <h1>{activeItem?.ar || "لوحة التحكم"}</h1>
          </div>
          <div className="top-actions">
            <span className="badge">{roleNames[role] || role}</span>
            <button className="icon-btn" onClick={loadContext} title="تحديث">
              <RefreshCcw size={18} />
            </button>
            <ThemeToggle />
            <button className="icon-btn" onClick={() => go("notifications")} title="الإشعارات">
              <Bell size={18} />
              {unread > 0 && <span className="bell-dot">{unread > 99 ? "99+" : unread}</span>}
            </button>
            <div className="avatar" title={displayName}>
              {nameInitials(displayName)}
            </div>
          </div>
        </header>

        <div className="content">
          {context?.migration_required && <SetupBanner message={context.setup_message} />}
          {toast && <div className="toast">{toast}</div>}

          <div className="view-anim" key={activeView}>
            {activeView === "today" && hasEmployeePortal && (
              <EmployeeToday context={context} session={session} onToast={setToast} />
            )}
            {activeView === "month" && hasEmployeePortal && (
              <MyMonthView context={context} onToast={setToast} />
            )}
            {activeView === "requests" && hasEmployeePortal && (
              <RequestsView context={context} session={session} onToast={setToast} />
            )}
            {activeView === "notifications" && <NotificationsView context={context} onToast={setToast} />}
            {activeView === "training" && <TrainingView context={context} />}
            {activeView === "assistant" && <AssistantView context={context} />}
            {activeView === "deductions" && <DeductionsView context={context} onToast={setToast} />}
            {activeView === "expenses" && isAdmin && <ExpensesView context={context} onToast={setToast} />}
            {activeView === "partner" && isAdmin && <PartnerLedgerView context={context} onToast={setToast} />}
            {activeView === "admin" && isAdmin && (
              <AdminDashboard context={context} onToast={setToast} />
            )}
            {activeView === "owner" && role === "owner" && <OwnerDashboard onToast={setToast} />}
            {activeView === "ownerbook" && role === "owner" && <OwnerLedgerView onToast={setToast} />}
          </div>
        </div>
      </main>
    </div>
  );
}

function Splash() {
  return (
    <div className="splash">
      <BrandLogo large />
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
          <BrandLogo />
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

function weekdayName(date) {
  return new Intl.DateTimeFormat("ar-EG", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

function Sparkline({ data, width = 120, height = 28 }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const points = data
    .map((value, index) => {
      const x = data.length > 1 ? (index / (data.length - 1)) * width : width / 2;
      const y = height - (value / max) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} style={{ direction: "ltr", flex: "0 0 auto" }}>
      <polyline fill="none" stroke="#F59E0B" strokeWidth="2" points={points} />
    </svg>
  );
}

function MyMonthView({ context, onToast }) {
  const employee = context?.employee;
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => {
    const [year, mon] = month.split("-").map(Number);
    return {
      from: `${month}-01`,
      to: new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10),
    };
  }, [month]);

  useEffect(() => {
    if (!employee?.id) return;
    setLoading(true);
    supabase
      .from("attendance")
      .select("*")
      .eq("employee_id", employee.id)
      .gte("work_date", range.from)
      .lte("work_date", range.to)
      .order("work_date")
      .then(({ data, error }) => {
        if (error) onToast?.("تعذر تحميل سجل الشهر.");
        setRows(data || []);
        setLoading(false);
      });
  }, [employee?.id, range.from, range.to]);

  const summary = useMemo(() => {
    const present = rows.filter((row) => row.check_in).length;
    const lateRows = rows.filter((row) => row.status === "late");
    const absent = rows.filter((row) => row.status === "absent").length;
    const leave = rows.filter((row) => ["leave", "mission", "sick"].includes(row.status)).length;
    const lateMinutes = lateRows.reduce((sum, row) => sum + Number(row.late_minutes || 0), 0);
    const deductions = rows.reduce(
      (sum, row) => sum + Number(row.deduction_days || 0) + (row.status === "absent" ? 1 : 0),
      0
    );
    return { present, lateCount: lateRows.length, lateMinutes, absent, leave, deductions };
  }, [rows]);

  const spark = useMemo(() => rows.map((row) => Number(row.late_minutes || 0)), [rows]);

  function exportMonthCsv() {
    const header = ["التاريخ", "اليوم", "الحالة", "حضور", "انصراف", "دقائق تأخير", "خصم أيام", "ملاحظتي"];
    const lines = rows.map((row) =>
      [
        row.work_date,
        weekdayName(row.work_date),
        statusLabels[row.status] || row.status,
        row.check_in || "",
        row.check_out || "",
        row.late_minutes || 0,
        row.deduction_days || 0,
        row.employee_note || "",
      ].map(csvCell).join(",")
    );
    downloadTextFile(`my-month-${month}.csv`, "\ufeff" + `${header.map(csvCell).join(",")}\n${lines.join("\n")}`);
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-title between">
          <div><History size={20} /><h2>سجلي الشهري</h2></div>
          <div className="toolbar">
            <input type="month" value={month} max={todayIso().slice(0, 7)} onChange={(e) => setMonth(e.target.value)} />
            <button className="secondary" onClick={exportMonthCsv} disabled={loading || rows.length === 0}>
              <FileSpreadsheet size={16} /> Excel
            </button>
          </div>
        </div>
        <div className="stats-grid compact-stats">
          <Metric label="أيام حضور" value={summary.present} tone="ok" icon={UserCheck} />
          <Metric label="تأخير" value={summary.lateCount} sub={`${summary.lateMinutes} دقيقة إجمالًا`} tone="warn" icon={Clock3} />
          <Metric label="غياب" value={summary.absent} tone="danger" icon={UserX} />
          <Metric label="أجازة/مأمورية" value={summary.leave} tone="info" icon={CalendarDays} />
          <Metric label="خصومات" value={summary.deductions.toFixed(2)} sub="يوم" tone="gold" icon={Banknote} />
        </div>
        {employee?.leave_balance != null && (
          <p className="muted">رصيد أجازاتك المتبقي: {employee.leave_balance} يوم</p>
        )}
        {spark.some((value) => value > 0) && (
          <p className="muted">
            اتجاه دقائق التأخير خلال الشهر: <Sparkline data={spark} />
          </p>
        )}
      </section>

      <section className="panel">
        <div className="panel-title"><CalendarDays size={20} /><h2>تفاصيل الأيام</h2></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>التاريخ</th><th>اليوم</th><th>الحالة</th><th>حضور</th><th>انصراف</th><th>تأخير</th><th>خصم</th><th>ملاحظتي</th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="8">جاري التحميل...</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan="8">لا توجد سجلات في الشهر ده.</td></tr>}
              {!loading && rows.map((row) => (
                <tr key={row.id || row.work_date}>
                  <td dir="ltr">{row.work_date}</td>
                  <td>{weekdayName(row.work_date)}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td dir="ltr">{row.check_in?.slice(0, 5) || "-"}</td>
                  <td dir="ltr">{row.check_out?.slice(0, 5) || "-"}</td>
                  <td>{row.late_minutes || 0} د</td>
                  <td>{row.deduction_days || 0}</td>
                  <td className="note-cell">{row.employee_note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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
        supabase.from("employees").select("id,name,leave_balance,active,attendance_exempt").order("id"),
        supabase.from("attendance").select("*").eq("work_date", reportDate),
        supabase.from("permissions").select("*, employees(name)").eq("status", "pending").order("perm_date"),
        supabase.from("leave_requests").select("*, employees!leave_requests_employee_id_fkey(name), cover:employees!leave_requests_cover_employee_id_fkey(name)").eq("status", "pending").order("from_date"),
        supabase.rpc("get_daily_qr_v1"),
        supabase.rpc("get_qr_for_date_v1", { p_date: addDays(todayIso(), 1) }),
      ]);
      const failed = [emp, att, perm, leave, qrData, tomorrowQr].find((item) => item.error);
      if (failed) throw failed.error;
      // Payroll-only employees (attendance_exempt) never appear on the attendance board.
      setEmployees((emp.data || []).filter((e) => !e.attendance_exempt));
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
  const donutData = useMemo(() => {
    const active = employees.filter((emp) => emp.active !== false);
    const count = (statuses) => active.filter((emp) => statuses.includes(recs.get(emp.id)?.status)).length;
    const registered = active.filter((emp) => recs.get(emp.id)).length;
    return [
      { name: "حاضر", value: count(["present"]), color: "#10B981" },
      { name: "متأخر", value: count(["late"]), color: "#F59E0B" },
      { name: "معلّق", value: count(["pending"]), color: "#FCC107" },
      { name: "أجازة/مأمورية", value: count(["leave", "mission", "sick"]), color: "#8B5CF6" },
      { name: "غياب", value: count(["absent"]), color: "#EF4444" },
      { name: "لم يسجل", value: Math.max(0, active.length - registered), color: "#94A3B8" },
    ].filter((item) => item.value > 0);
  }, [employees, recs]);
  const canApprove = context.role === "owner";

  function exportDayCsv() {
    const header = ["الموظف", "الحالة", "حضور", "انصراف", "دقائق تأخير", "خصم أيام", "ملاحظة الموظف", "ملاحظة HR"];
    const lines = filteredEmployees.map((emp) => {
      const rec = recs.get(emp.id);
      return [
        emp.name,
        rec ? statusLabels[rec.status] || rec.status : "لم يسجل",
        rec?.check_in || "",
        rec?.check_out || "",
        rec?.late_minutes || 0,
        rec?.deduction_days || 0,
        rec?.employee_note || "",
        rec?.hr_note || "",
      ].map(csvCell).join(",");
    });
    downloadTextFile(`attendance-${reportDate}.csv`, `\ufeff${header.map(csvCell).join(",")}\n${lines.join("\n")}`);
  }

  return (
    <div className="stack">
      {error && <div className="setup-banner">{error}</div>}
      <section className="panel">
        <div className="panel-title between">
          <div><Users size={20} /><h2>جدول الحضور</h2></div>
          <div className="toolbar">
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
            <button className="secondary" onClick={exportDayCsv} disabled={loading}>
              <FileSpreadsheet size={16} /> Excel
            </button>
            <button className="secondary" onClick={markMissingCheckouts}>مراجعة الانصراف</button>
            <button className="secondary" onClick={loadAdmin}>تحديث</button>
          </div>
        </div>
        <div className="stats-grid compact-stats">
          <Metric label="الموظفون" value={adminStats.active} icon={Users} />
          <Metric label="سجلوا حضور" value={adminStats.checkedIn} tone="ok" icon={UserCheck} />
          <Metric label="لم يسجلوا" value={adminStats.notRegistered} tone="danger" icon={UserX} />
          <Metric label="تأخير" value={adminStats.late} tone="warn" icon={Clock3} />
          <Metric label="بدون انصراف" value={adminStats.missingCheckout} tone="gold" icon={AlertTriangle} />
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
        <section className="panel">
          <div className="panel-title"><PieChartIcon size={20} /><h2>توزيع حالات اليوم</h2></div>
          {donutData.length > 0 ? (
            <StatusDonut data={donutData} />
          ) : (
            <p className="muted">لا توجد بيانات لليوم بعد.</p>
          )}
        </section>
      </div>

      <form className="panel form" onSubmit={submitHoliday}>
        <div className="panel-title"><CalendarDays size={20} /><h2>أجازة رسمية</h2></div>
        <div className="form-grid">
          <label>من<input type="date" value={holiday.date} onChange={(e) => setHoliday((h) => ({ ...h, date: e.target.value }))} /></label>
          <label>إلى<input type="date" value={holiday.to} onChange={(e) => setHoliday((h) => ({ ...h, to: e.target.value }))} /></label>
        </div>
        <label>السبب<input value={holiday.label} onChange={(e) => setHoliday((h) => ({ ...h, label: e.target.value }))} placeholder="مثال: عيد رسمي" /></label>
        <button className="primary">تسجيل أجازة رسمية</button>
      </form>

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
  const [finRows, setFinRows] = useState([]);
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
      supabase.from("employees").select("id,name,active,attendance_exempt").eq("active", true).order("id"),
      supabase.from("official_holidays").select("holiday_date,label").gte("holiday_date", range.from).lte("holiday_date", range.to),
      // Financial deductions in range. !inner is required so voided loans are excluded.
      supabase.from("emp_loan_installments")
        .select("employee_id,amount,due_month,loan:emp_loans!inner(status)")
        .gte("due_month", range.from.slice(0, 7)).lte("due_month", range.to.slice(0, 7))
        .eq("loan.status", "active"),
      supabase.from("canteen_entries").select("employee_id,amount")
        .eq("status", "active").gte("entry_date", range.from).lte("entry_date", range.to),
      supabase.from("other_deductions").select("employee_id,amount")
        .eq("status", "active").gte("entry_date", range.from).lte("entry_date", range.to),
    ]).then(([att, sal, emp, hol, inst, cant, other]) => {
      const failed = [att, sal, emp, hol, inst, cant, other].find((item) => item.error);
      if (failed) throw failed.error;
      setRows(att.data || []);
      setSalaries(Object.fromEntries((sal.data || []).map((s) => [s.employee_id, Number(s.monthly_salary || 0)])));
      setEmployees(emp.data || []);
      setHolidays(hol.data || []);
      setFinRows([...(inst.data || []), ...(cant.data || []), ...(other.data || [])]);
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
    // Exempt (payroll-only) employees don't count toward expected attendance.
    const attendanceEmployees = employees.filter((emp) => !emp.attendance_exempt);
    const expected = attendanceEmployees.length * workDates.length;
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
    // Financial deductions (loan installments + canteen + other) summed per employee.
    const finByEmployee = finRows.reduce((acc, row) => {
      acc.set(row.employee_id, (acc.get(row.employee_id) || 0) + Number(row.amount || 0));
      return acc;
    }, new Map());
    const financialTotal = [...finByEmployee.values()].reduce((sum, value) => sum + value, 0);
    const payrollRows = employees.map((emp) => {
      const employeeRows = rowsByEmployee.get(emp.id) || [];
      const salary = salaries[emp.id] || 0;
      const empDeductionDays = employeeRows.reduce((sum, row) => (
        sum + Number(row.deduction_days || 0) + (row.status === "absent" ? 1 : 0)
      ), 0);
      const empDeductionAmount = empDeductionDays * (salary / 30);
      const financialDeduction = finByEmployee.get(emp.id) || 0;
      return {
        employee_id: emp.id,
        name: emp.name,
        exempt: !!emp.attendance_exempt,
        salary,
        deductionDays: empDeductionDays,
        deductionAmount: empDeductionAmount,
        financialDeduction,
        netSalary: Math.max(0, salary - empDeductionAmount - financialDeduction),
        present: employeeRows.filter((row) => row.check_in).length,
        late: employeeRows.filter((row) => row.status === "late").length,
        absent: employeeRows.filter((row) => row.status === "absent").length,
        missingCheckout: employeeRows.filter((row) => row.check_in && !row.check_out && ["present", "late"].includes(row.status)).length,
      };
    }).sort((a, b) => (b.deductionAmount + b.financialDeduction) - (a.deductionAmount + a.financialDeduction) || a.name.localeCompare(b.name, "ar"));
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
      financialTotal,
      attendanceRate: expected ? Math.round(((checkedIn + leave) / expected) * 100) : 0,
      lateByEmployee: [...lateByEmployee.values()].sort((a, b) => b.count - a.count || b.minutes - a.minutes).slice(0, 5),
      payrollRows,
    };
  }, [rows, salaries, employees, holidays, finRows, range.from, range.to]);

  // Daily series for the trend chart (skips Fridays; empty workdays render as zeros).
  const dailyData = useMemo(() => {
    const byDate = new Map();
    rows.forEach((row) => {
      const entry = byDate.get(row.work_date) || { present: 0, late: 0, absent: 0 };
      if (row.check_in) entry.present += 1;
      if (row.status === "late") entry.late += 1;
      if (row.status === "absent") entry.absent += 1;
      byDate.set(row.work_date, entry);
    });
    return datesBetween(range.from, range.to)
      .filter((day) => new Date(`${day}T00:00:00Z`).getUTCDay() !== 5)
      .map((day) => ({
        day: `${day.slice(8)}/${day.slice(5, 7)}`,
        ...(byDate.get(day) || { present: 0, late: 0, absent: 0 }),
      }));
  }, [rows, range.from, range.to]);

  const employeeBars = useMemo(
    () =>
      stats.payrollRows
        .filter((row) => !row.exempt)
        .sort((a, b) => b.present - a.present || a.name.localeCompare(b.name, "ar"))
        .map((row) => ({ name: row.name, حضور: row.present, تأخير: row.late, غياب: row.absent })),
    [stats.payrollRows]
  );

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
    const header = ["الموظف", "المرتب الشهري", "خصم أيام", "قيمة الخصم", "استقطاعات مالية", "الصافي التقديري", "تأخير", "غياب", "بدون انصراف"];
    const lines = stats.payrollRows.map((row) => [
      row.name,
      row.salary,
      row.deductionDays.toFixed(2),
      row.deductionAmount.toFixed(2),
      row.financialDeduction.toFixed(2),
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
            <button className="secondary" onClick={exportCsv} disabled={loading || rows.length === 0}>
              <FileSpreadsheet size={16} /> Excel
            </button>
            <button className="secondary" onClick={() => window.print()}>PDF</button>
          </div>
        </div>
        <p className="muted">الفترة: {range.from} إلى {range.to}</p>
      </section>
      <div className="stats-grid">
        <Metric label="معدل التغطية" value={`${stats.attendanceRate}%`} tone="ok" icon={Activity} />
        <Metric label={`سجلات ${range.label}`} value={`${stats.total}/${stats.expected}`} icon={CalendarDays} />
        <Metric label="تأخيرات" value={stats.late} tone="warn" icon={Clock3} />
        <Metric label="بدون انصراف" value={stats.missingCheckout} tone="danger" icon={AlertTriangle} />
        <Metric label="خصم أيام" value={stats.deductionDays.toFixed(2)} tone="warn" icon={TrendingUp} />
        <Metric label="خصومات تقديرية" value={`${money(stats.deductions)} ج`} tone="gold" icon={Banknote} />
        <Metric label="استقطاعات مالية" value={`${money(stats.financialTotal)} ج`} tone="gold" icon={Wallet} />
      </div>
      <div className="grid two">
        <section className="panel">
          <div className="panel-title"><TrendingUp size={20} /><h2>اتجاه الحضور اليومي</h2></div>
          {dailyData.length > 0 ? (
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                  <ChartTooltip />
                  <Area type="monotone" dataKey="present" name="حضور" stroke="#FCC107" fill="#FCC107" fillOpacity={0.2} strokeWidth={2.2} />
                  <Area type="monotone" dataKey="late" name="تأخير" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.12} strokeWidth={2} />
                  <Area type="monotone" dataKey="absent" name="غياب" stroke="#EF4444" fill="#EF4444" fillOpacity={0.1} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="muted">لا توجد بيانات في الفترة.</p>
          )}
        </section>
        <section className="panel">
          <div className="panel-title"><BarChart3 size={20} /><h2>تحليل سريع</h2></div>
          <Bar label="الحضور" value={stats.checkedIn + stats.leave} max={Math.max(stats.expected, 1)} />
          <Bar label="التأخير" value={stats.late} max={Math.max(stats.total, 1)} tone="warn" />
          <Bar label="غياب مسجل" value={stats.absent} max={Math.max(stats.total, 1)} tone="danger" />
          <Bar label="بدون انصراف" value={stats.missingCheckout} max={Math.max(stats.total, 1)} tone="danger" />
        </section>
      </div>
      <section className="panel">
        <div className="panel-title"><Users size={20} /><h2>حضور الموظفين ({range.label})</h2></div>
        {employeeBars.length > 0 ? (
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={Math.max(180, employeeBars.length * 34 + 40)}>
              <ReBarChart data={employeeBars} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" orientation="right" width={92} tick={{ fontSize: 12 }} />
                <ChartTooltip />
                <ReBar dataKey="حضور" fill="#FCC107" radius={[0, 6, 6, 0]} barSize={12} />
                <ReBar dataKey="تأخير" fill="#F59E0B" radius={[0, 6, 6, 0]} barSize={12} />
                <ReBar dataKey="غياب" fill="#EF4444" radius={[0, 6, 6, 0]} barSize={12} />
              </ReBarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="muted">لا توجد بيانات موظفين في الفترة.</p>
        )}
      </section>
      <section className="panel">
        <div className="panel-title between">
          <div><Banknote size={20} /><h2>المرتبات والخصومات</h2></div>
          <button className="secondary" onClick={exportPayrollCsv} disabled={loading || stats.payrollRows.length === 0}>
            <FileSpreadsheet size={16} /> Excel مرتبات
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الموظف</th>
                <th>المرتب الشهري</th>
                <th>خصم أيام</th>
                <th>قيمة الخصم</th>
                <th>استقطاعات مالية</th>
                <th>الصافي التقديري</th>
                <th>مؤشرات</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="7">جاري التحميل...</td></tr>}
              {!loading && stats.payrollRows.length === 0 && <tr><td colSpan="7">لا توجد بيانات مرتبات.</td></tr>}
              {!loading && stats.payrollRows.map((row) => (
                <tr key={row.employee_id}>
                  <td>{row.name}</td>
                  <td>{money(row.salary)} ج</td>
                  <td>{row.deductionDays.toFixed(2)} يوم</td>
                  <td>{money(row.deductionAmount)} ج</td>
                  <td>{money(row.financialDeduction)} ج</td>
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

function TrainingView({ context }) {
  const role = context?.role || "employee";
  const canSeeEvaluation =
    role === "owner" || EVALUATION_VIEWER_EMPLOYEE_IDS.includes(context?.employee?.id);

  const docs = [
    {
      file: "./training/training-plan.pdf",
      title: "خطة تدريب الموظف الجديد",
      en: "New Employee Training Plan",
      desc: "تعليمات وخطة التدريب الكاملة — متاحة لكل الفريق.",
      restricted: false,
    },
    ...(canSeeEvaluation
      ? [
          {
            file: "./training/evaluation-form.pdf",
            title: "نموذج تقييم الموظف",
            en: "Employee Evaluation Form",
            desc: "نموذج التقييم الرسمي المستخدم أثناء وبعد فترة التدريب.",
            restricted: true,
          },
        ]
      : []),
  ];

  return (
    <div className="grid two">
      {docs.map((doc) => (
        <section className="panel" key={doc.file}>
          <div className="panel-title">
            <FileText size={20} />
            <h2>{doc.title}</h2>
          </div>
          <p className="muted">{doc.en}</p>
          <p>{doc.desc}</p>
          {doc.restricted && (
            <p className="muted">
              <ShieldCheck size={15} /> متاح لأبرار وندى والـ Owner فقط.
            </p>
          )}
          <div className="actions-row">
            <a className="primary" href={doc.file} target="_blank" rel="noreferrer">
              <FileText size={17} /> عرض PDF
            </a>
            <a className="secondary" href={doc.file} download>
              <Download size={17} /> تنزيل
            </a>
          </div>
          <div className="pdf-frame">
            <iframe src={doc.file} title={doc.title} loading="lazy" />
          </div>
        </section>
      ))}
    </div>
  );
}

// ===================== AI Assistant =====================

const ASSISTANT_STORAGE_KEY = "aoa:v1:assistantChat";

function loadChat() {
  try {
    return JSON.parse(sessionStorage.getItem(ASSISTANT_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

// Inline formatting: **bold** → <strong>, `code` → <code>.
function renderInline(text, keyPrefix) {
  const nodes = [];
  const regex = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let match;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] != null) nodes.push(<strong key={`${keyPrefix}-b${i}`}>{match[1]}</strong>);
    else nodes.push(<code key={`${keyPrefix}-c${i}`}>{match[2]}</code>);
    last = match.index + match[0].length;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// Lightweight markdown → React (headings, tables, bullet lists, bold). Enough
// for the assistant's replies; avoids pulling in a full markdown dependency.
function renderMarkdown(md) {
  const lines = String(md || "").split("\n");
  const blocks = [];
  let i = 0;
  let key = 0;

  const isTableSep = (line) => /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");
  const splitRow = (line) =>
    line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i];

    // Table: a `|` header row followed by a separator row.
    if (line.trim().startsWith("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push(
        <div className="chat-table-wrap" key={`t${key++}`}>
          <table>
            <thead>
              <tr>{header.map((h, hi) => <th key={hi}>{renderInline(h, `h${key}-${hi}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>{header.map((_, ci) => <td key={ci}>{renderInline(r[ci] ?? "", `d${key}-${ri}-${ci}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Heading.
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      blocks.push(<p className="chat-heading" key={`hd${key++}`}>{renderInline(h[2], `hd${key}`)}</p>);
      i += 1;
      continue;
    }

    // Bullet list.
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ul className="chat-list" key={`ul${key++}`}>
          {items.map((it, ii) => <li key={ii}>{renderInline(it, `li${key}-${ii}`)}</li>)}
        </ul>
      );
      continue;
    }

    // Horizontal rule → skip (used as a visual divider in replies).
    if (/^\s*-{3,}\s*$/.test(line)) {
      blocks.push(<hr key={`hr${key++}`} />);
      i += 1;
      continue;
    }

    // Blank line.
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Paragraph: gather consecutive plain lines.
    const para = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("|") &&
      !/^(#{1,4})\s/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*-{3,}\s*$/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={`p${key++}`}>
        {para.map((pl, pi) => (
          <span key={pi}>
            {renderInline(pl, `p${key}-${pi}`)}
            {pi < para.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  }

  return blocks;
}

function AssistantView({ context }) {
  const role = context?.role || "employee";
  const isAdmin = role === "hr" || role === "owner";
  const [messages, setMessages] = useState(loadChat);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(ASSISTANT_STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      /* storage full */
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const suggestions = isAdmin
    ? ["مين اتأخر النهارده؟", "إيه المعلقات اللي محتاجة قرار؟", "ملخص مصروفات الشهر", "ملخص مديونية Air Ocean"]
    : ["سجلت حضور النهارده؟", "ملخص حضوري الشهر ده", "كام استقطاعاتي الشهر ده؟", "إيه حالة طلباتي؟"];

  async function callAssistant(payload) {
    const { data, error } = await supabase.functions.invoke("assistant", { body: payload });
    if (error) {
      let message = "تعذر الوصول للمساعد — حاول تاني.";
      try {
        const body = await error.context?.json?.();
        if (body?.reply) message = body.reply;
      } catch {
        /* keep default */
      }
      return { reply: message, actions: [], proposals: [], failed: true };
    }
    return data || { reply: "رد فاضي.", actions: [], proposals: [] };
  }

  async function send(text) {
    const question = (text ?? input).trim();
    if (!question || busy) return;
    setInput("");
    const nextMessages = [...messages, { role: "user", content: question }];
    setMessages(nextMessages);
    setBusy(true);
    const apiMessages = nextMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));
    const data = await callAssistant({ messages: apiMessages });
    setMessages((current) => [
      ...current,
      {
        role: "assistant",
        content: data.reply || "",
        actions: data.actions || [],
        proposals: (data.proposals || []).map((p) => ({ ...p, state: "pending" })),
      },
    ]);
    setBusy(false);
  }

  async function confirmProposal(messageIndex, proposalIndex) {
    const proposal = messages[messageIndex]?.proposals?.[proposalIndex];
    if (!proposal || proposal.state !== "pending" || busy) return;
    setBusy(true);
    const data = await callAssistant({ confirm_action: { name: proposal.name, args: proposal.args } });
    const failed = data.failed || data.result?.error;
    setMessages((current) => {
      const copy = current.map((m, i) =>
        i === messageIndex
          ? { ...m, proposals: m.proposals.map((p, j) => (j === proposalIndex ? { ...p, state: failed ? "failed" : "done" } : p)) }
          : m
      );
      return [
        ...copy,
        {
          role: "assistant",
          content: failed
            ? `❌ ${data.result?.message || data.result?.error || "فشل التنفيذ."}`
            : `✅ تم التنفيذ: ${data.summary || proposal.summary}`,
          actions: [],
          proposals: [],
        },
      ];
    });
    setBusy(false);
  }

  function dismissProposal(messageIndex, proposalIndex) {
    setMessages((current) =>
      current.map((m, i) =>
        i === messageIndex
          ? { ...m, proposals: m.proposals.map((p, j) => (j === proposalIndex ? { ...p, state: "dismissed" } : p)) }
          : m
      )
    );
  }

  function clearChat() {
    if (!confirm("تمسح المحادثة؟")) return;
    setMessages([]);
    try {
      sessionStorage.removeItem(ASSISTANT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="panel chat-panel">
      <div className="panel-title between">
        <div><Sparkles size={20} /><h2>المساعد الذكي</h2></div>
        <div className="toolbar">
          {messages.length > 0 && (
            <button className="secondary" onClick={clearChat}><Trash2 size={15} /> مسح</button>
          )}
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <Sparkles size={34} />
            <p>اسألني عن أي حاجة في السيستم — بجاوب من البيانات الحقيقية وأقدر أنفذ عمليات.</p>
            <div className="chat-suggestions">
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cls("chat-bubble", m.role)}>
            <div className="chat-content">{m.role === "assistant" ? renderMarkdown(m.content) : m.content}</div>
            {m.actions?.length > 0 && (
              <div className="chat-chips">
                {m.actions.map((a, j) => (
                  <span key={j} className={cls("chat-chip", a.ok === false && "failed")}>
                    {a.ok === false ? "✗" : "✓"} {a.name}
                  </span>
                ))}
              </div>
            )}
            {m.proposals?.map((p, j) => (
              <div key={j} className={cls("chat-proposal", p.state)}>
                <p><AlertTriangle size={15} /> {p.summary}</p>
                {p.state === "pending" && (
                  <div className="actions-row">
                    <button className="primary" disabled={busy} onClick={() => confirmProposal(i, j)}>تنفيذ</button>
                    <button className="secondary" onClick={() => dismissProposal(i, j)}>تجاهل</button>
                  </div>
                )}
                {p.state === "done" && <span className="status-badge confirmed">تم التنفيذ</span>}
                {p.state === "failed" && <span className="status-badge rejected">فشل</span>}
                {p.state === "dismissed" && <span className="status-badge voided">اتجاهلت</span>}
              </div>
            ))}
          </div>
        ))}
        {busy && (
          <div className="chat-bubble assistant">
            <div className="chat-typing"><span /><span /><span /></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="chat-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="اكتب سؤالك أو طلبك..."
          disabled={busy}
        />
        <button className="primary" disabled={busy || !input.trim()} type="submit">
          <Send size={17} />
        </button>
      </form>
    </section>
  );
}

// ===================== Financial modules =====================

function monthRangeFor(month) {
  const [year, mon] = month.split("-").map(Number);
  return { from: `${month}-01`, to: new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10) };
}

// Current auth uid — used to decide which rows HR can self-void (same-day rule).
function useUid() {
  const [uid, setUid] = useState(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id || null));
  }, []);
  return uid;
}

async function voidFinancial(kind, id, onToast, reload) {
  const reason = prompt("سبب الإلغاء؟ (إجباري — بيتسجل في السجل)");
  if (reason == null) return;
  if (!reason.trim()) {
    onToast("سبب الإلغاء إجباري.");
    return;
  }
  const { data, error } = await supabase.rpc("void_financial_v1", {
    p_kind: kind,
    p_id: id,
    p_reason: reason.trim(),
  });
  if (error || data?.error) onToast(data?.message || "تعذر الإلغاء.");
  else {
    onToast("تم الإلغاء.");
    reload();
  }
}

function DeductionsView({ context, onToast }) {
  const role = context?.role || "employee";
  const isAdmin = role === "hr" || role === "owner";
  if (isAdmin) return <DeductionsAdmin context={context} onToast={onToast} />;
  if (!context?.employee) return <p className="muted">لا يوجد ملف موظف مرتبط بحسابك.</p>;
  return <DeductionsEmployee context={context} />;
}

function DeductionsEmployee({ context }) {
  const empId = context.employee.id;
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [loans, setLoans] = useState([]);
  const [installments, setInstallments] = useState([]);
  const [canteen, setCanteen] = useState([]);
  const [others, setOthers] = useState([]);
  const [loading, setLoading] = useState(true);
  const range = useMemo(() => monthRangeFor(month), [month]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from("emp_loans").select("*").eq("employee_id", empId).order("created_at", { ascending: false }),
      supabase.from("emp_loan_installments").select("*").eq("employee_id", empId).order("due_month"),
      supabase.from("canteen_entries").select("*").eq("employee_id", empId).gte("entry_date", range.from).lte("entry_date", range.to).order("entry_date", { ascending: false }),
      supabase.from("other_deductions").select("*").eq("employee_id", empId).gte("entry_date", range.from).lte("entry_date", range.to).order("entry_date", { ascending: false }),
    ]).then(([l, i, c, o]) => {
      setLoans(l.data || []);
      setInstallments(i.data || []);
      setCanteen(c.data || []);
      setOthers(o.data || []);
      setLoading(false);
    });
  }, [empId, range.from, range.to]);

  const activeLoanIds = useMemo(() => new Set(loans.filter((l) => l.status === "active").map((l) => l.id)), [loans]);
  const summary = useMemo(() => {
    const monthInstallment = installments
      .filter((i) => activeLoanIds.has(i.loan_id) && i.due_month === month)
      .reduce((sum, i) => sum + Number(i.amount), 0);
    const canteenTotal = canteen.filter((c) => c.status === "active").reduce((sum, c) => sum + Number(c.amount), 0);
    const otherTotal = others.filter((o) => o.status === "active").reduce((sum, o) => sum + Number(o.amount), 0);
    const loanRemaining = loans
      .filter((l) => l.status === "active")
      .reduce((sum, l) => {
        const paid = installments
          .filter((i) => i.loan_id === l.id && i.due_month < todayIso().slice(0, 7))
          .reduce((s, i) => s + Number(i.amount), 0);
        return sum + Math.max(0, Number(l.amount) - paid);
      }, 0);
    return { monthInstallment, canteenTotal, otherTotal, loanRemaining, monthTotal: monthInstallment + canteenTotal + otherTotal };
  }, [loans, installments, canteen, others, activeLoanIds, month]);

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-title between">
          <div><Banknote size={20} /><h2>استقطاعاتي</h2></div>
          <div className="toolbar">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        </div>
        <div className="stats-grid compact-stats">
          <Metric label={`إجمالي استقطاعات ${month}`} value={`${money(summary.monthTotal)} ج`} tone="gold" icon={Banknote} />
          <Metric label="قسط السلفة" value={`${money(summary.monthInstallment)} ج`} tone="warn" icon={Wallet} />
          <Metric label="كانتين الشهر" value={`${money(summary.canteenTotal)} ج`} tone="info" icon={Receipt} />
          <Metric label="متبقي سلف" value={`${money(summary.loanRemaining)} ج`} tone="danger" icon={TrendingUp} />
        </div>
        <p className="muted">الاستقطاعات دي بتتخصم تلقائيًا من مرتب الشهر.</p>
      </section>

      <section className="panel">
        <div className="panel-title"><Wallet size={20} /><h2>سلفي</h2></div>
        <div className="list">
          {loading && <p className="muted">جاري التحميل...</p>}
          {!loading && loans.length === 0 && <p className="muted">لا توجد سلف مسجلة.</p>}
          {loans.map((loan) => {
            const schedule = installments.filter((i) => i.loan_id === loan.id);
            const paid = schedule.filter((i) => i.due_month < todayIso().slice(0, 7)).reduce((s, i) => s + Number(i.amount), 0);
            return (
              <div className="list-row" key={loan.id}>
                <div>
                  <strong>سلفة {money(loan.amount)} ج</strong>
                  <span>{loan.installments_count} قسط · بداية {loan.start_month}</span>
                </div>
                {loan.status === "active" ? (
                  <p>مسدد: {money(paid)} ج · متبقي: {money(Math.max(0, loan.amount - paid))} ج</p>
                ) : (
                  <p><StatusBadge status="voided" /> {loan.void_reason || ""}</p>
                )}
                {loan.note && <p className="muted">{loan.note}</p>}
                {loan.status === "active" && (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>الشهر</th><th>القسط</th><th>الحالة</th></tr></thead>
                      <tbody>
                        {schedule.map((i) => (
                          <tr key={i.id}>
                            <td dir="ltr">{i.due_month}</td>
                            <td>{money(i.amount)} ج</td>
                            <td><StatusBadge status={i.due_month < todayIso().slice(0, 7) ? "settled" : "pending"} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid two">
        <section className="panel">
          <div className="panel-title"><Receipt size={20} /><h2>كانتين {month}</h2></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>التاريخ</th><th>الصنف</th><th>المبلغ</th><th>الحالة</th></tr></thead>
              <tbody>
                {!loading && canteen.length === 0 && <tr><td colSpan="4">لا توجد مشتريات.</td></tr>}
                {canteen.map((row) => (
                  <tr key={row.id}>
                    <td dir="ltr">{row.entry_date}</td>
                    <td>{row.item}</td>
                    <td>{money(row.amount)} ج</td>
                    <td><StatusBadge status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <div className="panel-title"><Banknote size={20} /><h2>استقطاعات أخرى {month}</h2></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>ملاحظة</th><th>الحالة</th></tr></thead>
              <tbody>
                {!loading && others.length === 0 && <tr><td colSpan="5">لا توجد استقطاعات.</td></tr>}
                {others.map((row) => (
                  <tr key={row.id}>
                    <td dir="ltr">{row.entry_date}</td>
                    <td>{deductionCategoryLabels[row.category] || row.category}</td>
                    <td>{money(row.amount)} ج</td>
                    <td className="note-cell">{row.note || "-"}</td>
                    <td><StatusBadge status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function DeductionsAdmin({ context, onToast }) {
  const role = context?.role || "employee";
  const isOwner = role === "owner";
  const uid = useUid();
  const [tab, setTab] = useState(isOwner ? "loans" : "canteen");
  const [employees, setEmployees] = useState([]);
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [empFilter, setEmpFilter] = useState("all");
  const [loans, setLoans] = useState([]);
  const [installments, setInstallments] = useState([]);
  const [canteen, setCanteen] = useState([]);
  const [others, setOthers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loanForm, setLoanForm] = useState({ employeeId: "", amount: "", installments: 3, startMonth: todayIso().slice(0, 7), note: "" });
  const [canteenForm, setCanteenForm] = useState({ employeeId: "", item: "", amount: "", date: todayIso(), note: "" });
  const [otherForm, setOtherForm] = useState({ employeeId: "", category: "damage", amount: "", date: todayIso(), note: "" });
  const [busy, setBusy] = useState(false);
  const range = useMemo(() => monthRangeFor(month), [month]);

  useEffect(() => {
    supabase.from("employees").select("id,name,active").eq("active", true).order("id").then(({ data }) => {
      const list = data || [];
      setEmployees(list);
      if (list[0]) {
        const first = String(list[0].id);
        setLoanForm((f) => (f.employeeId ? f : { ...f, employeeId: first }));
        setCanteenForm((f) => (f.employeeId ? f : { ...f, employeeId: first }));
        setOtherForm((f) => (f.employeeId ? f : { ...f, employeeId: first }));
      }
    });
  }, []);

  useEffect(() => {
    loadData();
  }, [range.from, range.to, isOwner]);

  async function loadData() {
    setLoading(true);
    const queries = [
      supabase.from("canteen_entries").select("*").gte("entry_date", range.from).lte("entry_date", range.to).order("entry_date", { ascending: false }),
      supabase.from("other_deductions").select("*").gte("entry_date", range.from).lte("entry_date", range.to).order("entry_date", { ascending: false }),
    ];
    if (isOwner) {
      queries.push(supabase.from("emp_loans").select("*").order("created_at", { ascending: false }));
      queries.push(supabase.from("emp_loan_installments").select("*").order("due_month"));
    }
    const [c, o, l, i] = await Promise.all(queries);
    setCanteen(c.data || []);
    setOthers(o.data || []);
    if (isOwner) {
      setLoans(l?.data || []);
      setInstallments(i?.data || []);
    }
    setLoading(false);
  }

  const empName = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);
  const canVoid = (row) =>
    isOwner || (row.created_by === uid && row.entry_date === todayIso() && row.status === "active");

  async function submitLoan(event) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("add_loan_v1", {
      p_employee_id: Number(loanForm.employeeId),
      p_amount: Number(loanForm.amount),
      p_installments: Number(loanForm.installments),
      p_start_month: loanForm.startMonth,
      p_note: loanForm.note || null,
    });
    setBusy(false);
    if (error || data?.error) onToast(data?.message || "تعذر تسجيل السلفة.");
    else {
      onToast(`تم تسجيل السلفة — القسط الشهري ${money(data.installment)} ج${data.last_installment !== data.installment ? ` والأخير ${money(data.last_installment)} ج` : ""}.`);
      setLoanForm((f) => ({ ...f, amount: "", note: "" }));
      loadData();
    }
  }

  async function submitCanteen(event) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("add_canteen_entry_v1", {
      p_employee_id: Number(canteenForm.employeeId),
      p_item: canteenForm.item,
      p_amount: Number(canteenForm.amount),
      p_date: canteenForm.date,
      p_note: canteenForm.note || null,
    });
    setBusy(false);
    if (error || data?.error) onToast(data?.message || "تعذر تسجيل الكانتين.");
    else {
      onToast("تم تسجيل مشتريات الكانتين.");
      setCanteenForm((f) => ({ ...f, item: "", amount: "", note: "" }));
      loadData();
    }
  }

  async function submitOther(event) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("add_other_deduction_v1", {
      p_employee_id: Number(otherForm.employeeId),
      p_category: otherForm.category,
      p_amount: Number(otherForm.amount),
      p_date: otherForm.date,
      p_note: otherForm.note || null,
    });
    setBusy(false);
    if (error || data?.error) onToast(data?.message || "تعذر تسجيل الاستقطاع.");
    else {
      onToast("تم تسجيل الاستقطاع.");
      setOtherForm((f) => ({ ...f, amount: "", note: "" }));
      loadData();
    }
  }

  function exportRows(kind) {
    const source = kind === "canteen" ? canteen : others;
    const rows = source.filter((r) => empFilter === "all" || String(r.employee_id) === empFilter);
    const header = kind === "canteen"
      ? ["التاريخ", "الموظف", "الصنف", "المبلغ", "ملاحظة", "سجّله", "الحالة"]
      : ["التاريخ", "الموظف", "النوع", "المبلغ", "ملاحظة", "سجّله", "الحالة"];
    const lines = rows.map((r) => [
      r.entry_date,
      empName.get(r.employee_id) || r.employee_id,
      kind === "canteen" ? r.item : (deductionCategoryLabels[r.category] || r.category),
      r.amount,
      r.note || "",
      r.created_by_name || "",
      statusLabels[r.status] || r.status,
    ].map(csvCell).join(","));
    downloadTextFile(`${kind}-${month}.csv`, "Feff" + `${header.map(csvCell).join(",")}\n${lines.join("\n")}`);
  }

  const employeeSelect = (value, onChange) => (
    <select value={value} onChange={onChange} required>
      {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
    </select>
  );

  const filteredCanteen = canteen.filter((r) => empFilter === "all" || String(r.employee_id) === empFilter);
  const filteredOthers = others.filter((r) => empFilter === "all" || String(r.employee_id) === empFilter);
  const filteredLoans = loans.filter((r) => empFilter === "all" || String(r.employee_id) === empFilter);

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-title between">
          <div><Banknote size={20} /><h2>الاستقطاعات</h2></div>
          <div className="toolbar">
            <select value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}>
              <option value="all">كل الموظفين</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            <button className="secondary" onClick={loadData}><RefreshCcw size={16} /> تحديث</button>
          </div>
        </div>
        <div className="tabs compact-tabs">
          {isOwner && <button className={cls(tab === "loans" && "active")} onClick={() => setTab("loans")}>سلف</button>}
          <button className={cls(tab === "canteen" && "active")} onClick={() => setTab("canteen")}>كانتين</button>
          <button className={cls(tab === "other" && "active")} onClick={() => setTab("other")}>أخرى</button>
        </div>

        {tab === "loans" && isOwner && (
          <div className="stack">
            <form className="form" onSubmit={submitLoan}>
              <div className="form-grid">
                <label>الموظف{employeeSelect(loanForm.employeeId, (e) => setLoanForm((f) => ({ ...f, employeeId: e.target.value })))}</label>
                <label>المبلغ<input type="number" min="1" step="0.01" value={loanForm.amount} onChange={(e) => setLoanForm((f) => ({ ...f, amount: e.target.value }))} required placeholder="مثال: 3000" /></label>
              </div>
              <div className="form-grid">
                <label>عدد الأقساط<input type="number" min="1" max="60" value={loanForm.installments} onChange={(e) => setLoanForm((f) => ({ ...f, installments: e.target.value }))} required /></label>
                <label>شهر أول قسط<input type="month" value={loanForm.startMonth} onChange={(e) => setLoanForm((f) => ({ ...f, startMonth: e.target.value }))} required /></label>
              </div>
              <label>ملاحظة<input value={loanForm.note} onChange={(e) => setLoanForm((f) => ({ ...f, note: e.target.value }))} placeholder="اختياري" /></label>
              <button className="primary" disabled={busy}>{busy ? "جار التسجيل..." : "تسجيل سلفة"}</button>
              <p className="muted">القسط بيتخصم تلقائيًا من مرتب كل شهر بداية من شهر أول قسط.</p>
            </form>
            <div className="table-wrap">
              <table>
                <thead><tr><th>الموظف</th><th>الأصل</th><th>الأقساط</th><th>مسدد</th><th>متبقي</th><th>بداية</th><th>الحالة</th><th>إجراء</th></tr></thead>
                <tbody>
                  {loading && <tr><td colSpan="8">جاري التحميل...</td></tr>}
                  {!loading && filteredLoans.length === 0 && <tr><td colSpan="8">لا توجد سلف.</td></tr>}
                  {!loading && filteredLoans.map((loan) => {
                    const schedule = installments.filter((i) => i.loan_id === loan.id);
                    const paid = loan.status === "active"
                      ? schedule.filter((i) => i.due_month < todayIso().slice(0, 7)).reduce((s, i) => s + Number(i.amount), 0)
                      : 0;
                    return (
                      <tr key={loan.id}>
                        <td>{empName.get(loan.employee_id) || loan.employee_id}</td>
                        <td>{money(loan.amount)} ج</td>
                        <td>{loan.installments_count} × {money(schedule[0]?.amount || loan.amount / loan.installments_count)} ج</td>
                        <td>{money(paid)} ج</td>
                        <td><strong>{money(Math.max(0, loan.amount - paid))} ج</strong></td>
                        <td dir="ltr">{loan.start_month}</td>
                        <td><StatusBadge status={loan.status} /></td>
                        <td>{loan.status === "active" ? <button className="danger-link" onClick={() => voidFinancial("loan", loan.id, onToast, loadData)}>إلغاء</button> : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "canteen" && (
          <div className="stack">
            <form className="form" onSubmit={submitCanteen}>
              <div className="form-grid">
                <label>الموظف{employeeSelect(canteenForm.employeeId, (e) => setCanteenForm((f) => ({ ...f, employeeId: e.target.value })))}</label>
                <label>الصنف<input value={canteenForm.item} onChange={(e) => setCanteenForm((f) => ({ ...f, item: e.target.value }))} required placeholder="مثال: مياه + شيبسي" /></label>
              </div>
              <div className="form-grid">
                <label>المبلغ<input type="number" min="0.5" step="0.01" value={canteenForm.amount} onChange={(e) => setCanteenForm((f) => ({ ...f, amount: e.target.value }))} required /></label>
                <label>التاريخ<input type="date" value={canteenForm.date} onChange={(e) => setCanteenForm((f) => ({ ...f, date: e.target.value }))} required /></label>
              </div>
              <label>ملاحظة<input value={canteenForm.note} onChange={(e) => setCanteenForm((f) => ({ ...f, note: e.target.value }))} placeholder="اختياري" /></label>
              <button className="primary" disabled={busy}>{busy ? "جار التسجيل..." : "تسجيل كانتين"}</button>
            </form>
            <div className="toolbar">
              <button className="secondary" onClick={() => exportRows("canteen")} disabled={filteredCanteen.length === 0}>
                <FileSpreadsheet size={16} /> Excel
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>التاريخ</th><th>الموظف</th><th>الصنف</th><th>المبلغ</th><th>سجّله</th><th>الحالة</th><th>إجراء</th></tr></thead>
                <tbody>
                  {loading && <tr><td colSpan="7">جاري التحميل...</td></tr>}
                  {!loading && filteredCanteen.length === 0 && <tr><td colSpan="7">لا توجد مشتريات في {month}.</td></tr>}
                  {!loading && filteredCanteen.map((row) => (
                    <tr key={row.id}>
                      <td dir="ltr">{row.entry_date}</td>
                      <td>{empName.get(row.employee_id) || row.employee_id}</td>
                      <td>{row.item}</td>
                      <td>{money(row.amount)} ج</td>
                      <td>{row.created_by_name || "-"}</td>
                      <td><StatusBadge status={row.status} /></td>
                      <td>{row.status === "active" && canVoid(row) ? <button className="danger-link" onClick={() => voidFinancial("canteen", row.id, onToast, loadData)}>إلغاء</button> : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "other" && (
          <div className="stack">
            <form className="form" onSubmit={submitOther}>
              <div className="form-grid">
                <label>الموظف{employeeSelect(otherForm.employeeId, (e) => setOtherForm((f) => ({ ...f, employeeId: e.target.value })))}</label>
                <label>النوع<select value={otherForm.category} onChange={(e) => setOtherForm((f) => ({ ...f, category: e.target.value }))}>{Object.entries(deductionCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              </div>
              <div className="form-grid">
                <label>المبلغ<input type="number" min="0.5" step="0.01" value={otherForm.amount} onChange={(e) => setOtherForm((f) => ({ ...f, amount: e.target.value }))} required /></label>
                <label>التاريخ<input type="date" value={otherForm.date} onChange={(e) => setOtherForm((f) => ({ ...f, date: e.target.value }))} required /></label>
              </div>
              <label>ملاحظة<input value={otherForm.note} onChange={(e) => setOtherForm((f) => ({ ...f, note: e.target.value }))} placeholder="اكتب السبب بوضوح" /></label>
              <button className="primary" disabled={busy}>{busy ? "جار التسجيل..." : "تسجيل استقطاع"}</button>
            </form>
            <div className="toolbar">
              <button className="secondary" onClick={() => exportRows("other")} disabled={filteredOthers.length === 0}>
                <FileSpreadsheet size={16} /> Excel
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>التاريخ</th><th>الموظف</th><th>النوع</th><th>المبلغ</th><th>ملاحظة</th><th>سجّله</th><th>الحالة</th><th>إجراء</th></tr></thead>
                <tbody>
                  {loading && <tr><td colSpan="8">جاري التحميل...</td></tr>}
                  {!loading && filteredOthers.length === 0 && <tr><td colSpan="8">لا توجد استقطاعات في {month}.</td></tr>}
                  {!loading && filteredOthers.map((row) => (
                    <tr key={row.id}>
                      <td dir="ltr">{row.entry_date}</td>
                      <td>{empName.get(row.employee_id) || row.employee_id}</td>
                      <td>{deductionCategoryLabels[row.category] || row.category}</td>
                      <td>{money(row.amount)} ج</td>
                      <td className="note-cell">{row.note || "-"}</td>
                      <td>{row.created_by_name || "-"}</td>
                      <td><StatusBadge status={row.status} /></td>
                      <td>{row.status === "active" && canVoid(row) ? <button className="danger-link" onClick={() => voidFinancial("other", row.id, onToast, loadData)}>إلغاء</button> : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ExpensesView({ context, onToast }) {
  const role = context?.role || "employee";
  const isOwner = role === "owner";
  const uid = useUid();
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ date: todayIso(), category: "electricity", amount: "", description: "" });
  const range = useMemo(() => monthRangeFor(month), [month]);

  useEffect(() => {
    loadData();
  }, [range.from, range.to]);

  async function loadData() {
    setLoading(true);
    const { data } = await supabase
      .from("company_expenses")
      .select("*")
      .gte("expense_date", range.from)
      .lte("expense_date", range.to)
      .order("expense_date", { ascending: false });
    setRows(data || []);
    setLoading(false);
  }

  const summary = useMemo(() => {
    const active = rows.filter((r) => r.status === "active");
    const total = active.reduce((sum, r) => sum + Number(r.amount), 0);
    const unconfirmed = active.filter((r) => !r.confirmed_at).length;
    const byCategory = active.reduce((acc, r) => {
      acc.set(r.category, (acc.get(r.category) || 0) + Number(r.amount));
      return acc;
    }, new Map());
    return { total, unconfirmed, byCategory };
  }, [rows]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("add_company_expense_v1", {
      p_date: form.date,
      p_category: form.category,
      p_amount: Number(form.amount),
      p_description: form.description || null,
    });
    setBusy(false);
    if (error || data?.error) onToast(data?.message || "تعذر تسجيل المصروف.");
    else {
      onToast(data.confirmed ? "تم تسجيل المصروف وتأكيده." : "تم تسجيل المصروف — في انتظار تأكيد الـ Owner.");
      setForm((f) => ({ ...f, amount: "", description: "" }));
      loadData();
    }
  }

  async function confirmExpense(id) {
    const { data, error } = await supabase.rpc("confirm_expense_v1", { p_id: id });
    if (error || data?.error) onToast(data?.message || "تعذر التأكيد.");
    else {
      onToast("تم تأكيد المصروف.");
      loadData();
    }
  }

  function exportCsvFile() {
    const header = ["التاريخ", "البند", "المبلغ", "الوصف", "سجّله", "مؤكد", "الحالة"];
    const lines = rows.map((r) => [
      r.expense_date,
      expenseCategoryLabels[r.category] || r.category,
      r.amount,
      r.description || "",
      r.created_by_name || "",
      r.confirmed_at ? "نعم" : "لا",
      statusLabels[r.status] || r.status,
    ].map(csvCell).join(","));
    downloadTextFile(`expenses-${month}.csv`, "Feff" + `${header.map(csvCell).join(",")}\n${lines.join("\n")}`);
  }

  const canVoid = (row) =>
    isOwner || (row.created_by === uid && row.expense_date === todayIso() && !row.confirmed_at && row.status === "active");

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-title between">
          <div><Receipt size={20} /><h2>المصروفات</h2></div>
          <div className="toolbar">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            <button className="secondary" onClick={exportCsvFile} disabled={rows.length === 0}>
              <FileSpreadsheet size={16} /> Excel
            </button>
            <button className="secondary" onClick={loadData}><RefreshCcw size={16} /> تحديث</button>
          </div>
        </div>
        <div className="stats-grid compact-stats">
          <Metric label={`إجمالي ${month}`} value={`${money(summary.total)} ج`} tone="gold" icon={Banknote} />
          <Metric label="غير مؤكد" value={summary.unconfirmed} tone={summary.unconfirmed ? "warn" : "ok"} icon={AlertTriangle} />
          <Metric label="عدد المصروفات" value={rows.filter((r) => r.status === "active").length} icon={Receipt} />
        </div>
        {summary.byCategory.size > 0 && (
          <div className="stack">
            {[...summary.byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([category, value]) => (
              <Bar key={category} label={expenseCategoryLabels[category] || category} value={value} max={Math.max(summary.total, 1)} />
            ))}
          </div>
        )}
      </section>

      <form className="panel form" onSubmit={submit}>
        <div className="panel-title"><Receipt size={20} /><h2>تسجيل مصروف</h2></div>
        <div className="form-grid">
          <label>التاريخ<input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required /></label>
          <label>البند<select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>{Object.entries(expenseCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <div className="form-grid">
          <label>المبلغ<input type="number" min="0.5" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required /></label>
          <label>الوصف<input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="مثال: فاتورة كهرباء يوليو" /></label>
        </div>
        <button className="primary" disabled={busy}>{busy ? "جار التسجيل..." : "تسجيل مصروف"}</button>
        {!isOwner && <p className="muted">المصروف بيتسجل فورًا وبيظهر للـ Owner لتأكيده.</p>}
      </form>

      <section className="panel">
        <div className="panel-title"><FileSpreadsheet size={20} /><h2>مصروفات {month}</h2></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>التاريخ</th><th>البند</th><th>المبلغ</th><th>الوصف</th><th>سجّله</th><th>الحالة</th><th>إجراء</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan="7">جاري التحميل...</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan="7">لا توجد مصروفات في {month}.</td></tr>}
              {!loading && rows.map((row) => (
                <tr key={row.id}>
                  <td dir="ltr">{row.expense_date}</td>
                  <td>{expenseCategoryLabels[row.category] || row.category}</td>
                  <td>{money(row.amount)} ج</td>
                  <td className="note-cell">{row.description || "-"}</td>
                  <td>{row.created_by_name || "-"}</td>
                  <td>
                    {row.status === "voided" ? <StatusBadge status="voided" /> : row.confirmed_at ? <StatusBadge status="confirmed" /> : <StatusBadge status="pending" />}
                  </td>
                  <td>
                    <span className="approval-actions">
                      {row.status === "active" && !row.confirmed_at && (
                        isOwner
                          ? <button onClick={() => confirmExpense(row.id)}>تأكيد</button>
                          : <span className="badge">قرار Owner فقط</span>
                      )}
                      {row.status === "active" && canVoid(row) && (
                        <button className="danger-link" onClick={() => voidFinancial("expense", row.id, onToast, loadData)}>إلغاء</button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PartnerLedgerView({ context, onToast }) {
  const role = context?.role || "employee";
  const isOwner = role === "owner";
  const [entries, setEntries] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [directionFilter, setDirectionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ direction: "owed_to_us", kind: "invoice", amount: "", date: todayIso(), description: "", dueDate: "" });
  const [settleFor, setSettleFor] = useState(null);
  const [settleForm, setSettleForm] = useState({ amount: "", date: todayIso(), note: "" });
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [e, s] = await Promise.all([
      supabase.from("partner_ledger_entries").select("*").order("entry_date", { ascending: false }).order("id", { ascending: false }),
      supabase.from("partner_settlements").select("*").order("created_at", { ascending: false }),
    ]);
    setEntries(e.data || []);
    setSettlements(s.data || []);
    setLoading(false);
  }

  const enriched = useMemo(() => {
    const byEntry = settlements.reduce((acc, s) => {
      const list = acc.get(s.entry_id) || [];
      list.push(s);
      acc.set(s.entry_id, list);
      return acc;
    }, new Map());
    return entries.map((entry) => {
      const list = byEntry.get(entry.id) || [];
      const paid = list.filter((s) => s.status === "confirmed").reduce((sum, s) => sum + Number(s.amount), 0);
      const remaining = Math.max(0, Number(entry.amount) - paid);
      const derived = entry.status === "voided" ? "voided" : remaining <= 0 ? "settled" : paid > 0 ? "partial" : "open";
      return { ...entry, settlements: list, paid, remaining, derived };
    });
  }, [entries, settlements]);

  const totals = useMemo(() => {
    const active = enriched.filter((e) => e.status === "active");
    const toUs = active.filter((e) => e.direction === "owed_to_us").reduce((sum, e) => sum + e.remaining, 0);
    const byUs = active.filter((e) => e.direction === "owed_by_us").reduce((sum, e) => sum + e.remaining, 0);
    return { toUs, byUs, net: toUs - byUs };
  }, [enriched]);

  const pendingSettlements = useMemo(() => {
    const nameByEntry = new Map(entries.map((e) => [e.id, e.description]));
    return settlements
      .filter((s) => s.status === "pending")
      .map((s) => ({ ...s, entryDescription: nameByEntry.get(s.entry_id) || `قيد #${s.entry_id}` }));
  }, [settlements, entries]);

  const visible = enriched.filter((entry) => {
    const matchesDirection = directionFilter === "all" || entry.direction === directionFilter;
    const matchesStatus = statusFilter === "all" || entry.derived === statusFilter;
    const matchesSearch = !search.trim() || (entry.description || "").toLowerCase().includes(search.trim().toLowerCase());
    return matchesDirection && matchesStatus && matchesSearch;
  });

  async function submitEntry(event) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("add_partner_entry_v1", {
      p_direction: form.direction,
      p_kind: form.kind,
      p_amount: Number(form.amount),
      p_date: form.date,
      p_description: form.description,
      p_due_date: form.dueDate || null,
    });
    setBusy(false);
    if (error || data?.error) onToast(data?.message || "تعذر تسجيل القيد.");
    else {
      onToast("تم تسجيل القيد.");
      setForm((f) => ({ ...f, amount: "", description: "", dueDate: "" }));
      loadData();
    }
  }

  async function submitSettlement(event, entryId) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("add_partner_settlement_v1", {
      p_entry_id: entryId,
      p_amount: Number(settleForm.amount),
      p_date: settleForm.date,
      p_note: settleForm.note || null,
    });
    setBusy(false);
    if (error || data?.error) onToast(data?.message || "تعذر تسجيل السداد.");
    else {
      onToast(data.confirmed ? "تم تسجيل السداد وتأكيده." : "تم تسجيل السداد — في انتظار تأكيد الـ Owner.");
      setSettleFor(null);
      setSettleForm({ amount: "", date: todayIso(), note: "" });
      loadData();
    }
  }

  async function decideSettlement(id, approve) {
    const { data, error } = await supabase.rpc("decide_partner_settlement_v1", {
      p_id: id,
      p_approve: approve,
      p_note: approve ? "تم التأكيد" : "تم الرفض",
    });
    if (error || data?.error) onToast(data?.message || "تعذر البت في السداد.");
    else {
      onToast(approve ? "تم تأكيد السداد." : "تم رفض السداد.");
      loadData();
    }
  }

  function exportEntries() {
    const header = ["التاريخ", "الاتجاه", "النوع", "الوصف", "الأصل", "مسدد", "متبقي", "الحالة", "استحقاق", "سجّله"];
    const lines = enriched.map((e) => [
      e.entry_date,
      partnerDirectionLabels[e.direction],
      partnerKindLabels[e.kind],
      e.description,
      e.amount,
      e.paid.toFixed(2),
      e.remaining.toFixed(2),
      statusLabels[e.derived] || e.derived,
      e.due_date || "",
      e.created_by_name || "",
    ].map(csvCell).join(","));
    downloadTextFile(`partner-ledger-${todayIso()}.csv`, "Feff" + `${header.map(csvCell).join(",")}\n${lines.join("\n")}`);
  }

  function exportSettlements() {
    const nameByEntry = new Map(entries.map((e) => [e.id, e.description]));
    const header = ["التاريخ", "القيد", "المبلغ", "الحالة", "ملاحظة", "سجّله"];
    const lines = settlements.map((s) => [
      s.settle_date,
      nameByEntry.get(s.entry_id) || s.entry_id,
      s.amount,
      statusLabels[s.status] || s.status,
      s.note || "",
      s.created_by_name || "",
    ].map(csvCell).join(","));
    downloadTextFile(`partner-settlements-${todayIso()}.csv`, "Feff" + `${header.map(csvCell).join(",")}\n${lines.join("\n")}`);
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-title between">
          <div><Scale size={20} /><h2>مديونية Air Ocean</h2></div>
          <div className="toolbar">
            <button className="secondary" onClick={exportEntries} disabled={entries.length === 0}><FileSpreadsheet size={16} /> القيود</button>
            <button className="secondary" onClick={exportSettlements} disabled={settlements.length === 0}><FileSpreadsheet size={16} /> السدادات</button>
            <button className="secondary" onClick={loadData}><RefreshCcw size={16} /> تحديث</button>
          </div>
        </div>
        <div className="stats-grid compact-stats">
          <Metric label="لنا عندهم" value={`${money(totals.toUs)} ج`} tone="ok" icon={TrendingUp} />
          <Metric label="علينا ليهم" value={`${money(totals.byUs)} ج`} tone="danger" icon={Banknote} />
          <Metric label="الصافي" value={`${money(Math.abs(totals.net))} ج ${totals.net >= 0 ? "لنا" : "علينا"}`} tone={totals.net >= 0 ? "ok" : "warn"} icon={Scale} />
          <Metric label="سدادات معلقة" value={pendingSettlements.length} tone={pendingSettlements.length ? "warn" : "ok"} icon={Bell} />
        </div>
        <p className="muted">كل القيود والسدادات محفوظة بالكامل — مفيش حاجة بتتحذف، والإلغاء بيتسجل بأسبابه.</p>
      </section>

      {pendingSettlements.length > 0 && (
        <section className="panel">
          <div className="panel-title"><Bell size={20} /><h2>سدادات تحتاج تأكيد</h2></div>
          <div className="list">
            {pendingSettlements.map((s) => (
              <div className="approval-row" key={s.id}>
                <div>
                  <strong>{money(s.amount)} ج</strong>
                  <span>{s.entryDescription} · {s.settle_date}</span>
                  {s.note && <p>{s.note}</p>}
                  <p className="muted">سجله: {s.created_by_name || "-"}</p>
                </div>
                <div className="approval-actions">
                  {!isOwner && <span className="badge">قرار Owner فقط</span>}
                  {isOwner && (
                    <>
                      <button onClick={() => decideSettlement(s.id, true)}>تأكيد</button>
                      <button className="danger-link" onClick={() => decideSettlement(s.id, false)}>رفض</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <form className="panel form" onSubmit={submitEntry}>
        <div className="panel-title"><Scale size={20} /><h2>تسجيل قيد جديد</h2></div>
        <div className="form-grid">
          <label>الاتجاه<select value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}>{Object.entries(partnerDirectionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>النوع<select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>{Object.entries(partnerKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <div className="form-grid">
          <label>المبلغ<input type="number" min="0.5" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required /></label>
          <label>التاريخ<input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required /></label>
        </div>
        <label>الوصف<input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} required placeholder="مثال: فاتورة شحن يوليو / سلفة نقدية" /></label>
        <label>تاريخ استحقاق (اختياري)<input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} /></label>
        <button className="primary" disabled={busy}>{busy ? "جار التسجيل..." : "تسجيل القيد"}</button>
      </form>

      <section className="panel">
        <div className="panel-title between">
          <div><FileSpreadsheet size={20} /><h2>القيود</h2></div>
          <div className="toolbar table-filters">
            <div className="tabs compact-tabs no-margin">
              <button className={cls(directionFilter === "all" && "active")} onClick={() => setDirectionFilter("all")}>الكل</button>
              <button className={cls(directionFilter === "owed_to_us" && "active")} onClick={() => setDirectionFilter("owed_to_us")}>لنا عندهم</button>
              <button className={cls(directionFilter === "owed_by_us" && "active")} onClick={() => setDirectionFilter("owed_by_us")}>علينا ليهم</button>
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">كل الحالات</option>
              <option value="open">مفتوح</option>
              <option value="partial">سداد جزئي</option>
              <option value="settled">مُسدد</option>
              <option value="voided">ملغي</option>
            </select>
            <label className="search-field">
              <Search size={16} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث في الوصف" />
            </label>
          </div>
        </div>
        <div className="list">
          {loading && <p className="muted">جاري التحميل...</p>}
          {!loading && visible.length === 0 && <p className="muted">لا توجد قيود مطابقة.</p>}
          {!loading && visible.map((entry) => (
            <div className="approval-row" key={entry.id}>
              <div>
                <strong>{entry.description}</strong>
                <span>{partnerDirectionLabels[entry.direction]} · {partnerKindLabels[entry.kind]} · {entry.entry_date}</span>
                <p>الأصل: {money(entry.amount)} ج · مسدد: {money(entry.paid)} ج · متبقي: <strong>{money(entry.remaining)} ج</strong></p>
                {entry.due_date && <p className="muted">استحقاق: {entry.due_date}</p>}
                {entry.status === "voided" && <p className="muted">سبب الإلغاء: {entry.void_reason || "-"}</p>}
                {expanded === entry.id && entry.settlements.length > 0 && (
                  <div className="list">
                    {entry.settlements.map((s) => (
                      <div className="list-row compact-row" key={s.id}>
                        <div>
                          <strong>{money(s.amount)} ج</strong>
                          <span>{s.settle_date} · {s.created_by_name || "-"}</span>
                        </div>
                        <StatusBadge status={s.status} />
                      </div>
                    ))}
                  </div>
                )}
                {settleFor === entry.id && (
                  <form className="form" onSubmit={(e) => submitSettlement(e, entry.id)}>
                    <div className="form-grid">
                      <label>مبلغ السداد<input type="number" min="0.5" step="0.01" max={entry.remaining} value={settleForm.amount} onChange={(e) => setSettleForm((f) => ({ ...f, amount: e.target.value }))} required /></label>
                      <label>التاريخ<input type="date" value={settleForm.date} onChange={(e) => setSettleForm((f) => ({ ...f, date: e.target.value }))} required /></label>
                    </div>
                    <label>ملاحظة<input value={settleForm.note} onChange={(e) => setSettleForm((f) => ({ ...f, note: e.target.value }))} placeholder="اختياري" /></label>
                    <div className="actions-row">
                      <button className="primary" disabled={busy}>{busy ? "جار التسجيل..." : "تسجيل السداد"}</button>
                      <button type="button" className="secondary" onClick={() => setSettleFor(null)}>إلغاء</button>
                    </div>
                  </form>
                )}
              </div>
              <div className="approval-actions">
                <StatusBadge status={entry.derived} />
                {entry.settlements.length > 0 && (
                  <button className="secondary" type="button" onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>
                    {expanded === entry.id ? "إخفاء السدادات" : `السدادات (${entry.settlements.length})`}
                  </button>
                )}
                {entry.status === "active" && entry.remaining > 0 && settleFor !== entry.id && (
                  <button type="button" onClick={() => { setSettleFor(entry.id); setSettleForm({ amount: String(entry.remaining), date: todayIso(), note: "" }); }}>سداد</button>
                )}
                {entry.status === "active" && isOwner && (
                  <button className="danger-link" type="button" onClick={() => voidFinancial("partner_entry", entry.id, onToast, loadData)}>إلغاء القيد</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function OwnerLedgerView({ onToast }) {
  const [entries, setEntries] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ person: "", direction: "lent", amount: "", date: todayIso(), note: "" });
  const [payFor, setPayFor] = useState(null);
  const [payForm, setPayForm] = useState({ amount: "", date: todayIso(), note: "" });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [e, p] = await Promise.all([
      supabase.from("owner_ledger_entries").select("*").order("entry_date", { ascending: false }).order("id", { ascending: false }),
      supabase.from("owner_ledger_payments").select("*").order("pay_date", { ascending: false }),
    ]);
    setEntries(e.data || []);
    setPayments(p.data || []);
    setLoading(false);
  }

  const enriched = useMemo(() => {
    const byEntry = payments.reduce((acc, p) => {
      const list = acc.get(p.entry_id) || [];
      list.push(p);
      acc.set(p.entry_id, list);
      return acc;
    }, new Map());
    return entries.map((entry) => {
      const list = byEntry.get(entry.id) || [];
      const paid = list.reduce((sum, p) => sum + Number(p.amount), 0);
      return { ...entry, payments: list, paid, remaining: Math.max(0, Number(entry.amount) - paid) };
    });
  }, [entries, payments]);

  const byPerson = useMemo(() => {
    const map = new Map();
    enriched.forEach((entry) => {
      const list = map.get(entry.person) || [];
      list.push(entry);
      map.set(entry.person, list);
    });
    return [...map.entries()];
  }, [enriched]);

  const totals = useMemo(() => {
    const lent = enriched.filter((e) => e.direction === "lent").reduce((sum, e) => sum + e.remaining, 0);
    const borrowed = enriched.filter((e) => e.direction === "borrowed").reduce((sum, e) => sum + e.remaining, 0);
    return { lent, borrowed, net: lent - borrowed };
  }, [enriched]);

  async function submitEntry(event) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("owner_ledger_entries").insert({
      person: form.person.trim(),
      direction: form.direction,
      amount: Number(form.amount),
      entry_date: form.date,
      note: form.note.trim() || null,
    });
    setBusy(false);
    if (error) onToast("تعذر التسجيل: " + error.message);
    else {
      onToast("تم التسجيل في الدفتر.");
      setForm((f) => ({ ...f, person: "", amount: "", note: "" }));
      loadData();
    }
  }

  async function submitPayment(event, entryId) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("owner_ledger_payments").insert({
      entry_id: entryId,
      amount: Number(payForm.amount),
      pay_date: payForm.date,
      note: payForm.note.trim() || null,
    });
    setBusy(false);
    if (error) onToast("تعذر تسجيل الدفعة: " + error.message);
    else {
      onToast("تم تسجيل الدفعة.");
      setPayFor(null);
      setPayForm({ amount: "", date: todayIso(), note: "" });
      loadData();
    }
  }

  async function removeEntry(id) {
    if (!confirm("تحذف القيد ده وكل دفعاته نهائيًا؟")) return;
    const { error } = await supabase.from("owner_ledger_entries").delete().eq("id", id);
    if (error) onToast("تعذر الحذف: " + error.message);
    else {
      onToast("تم الحذف.");
      loadData();
    }
  }

  async function removePayment(id) {
    if (!confirm("تحذف الدفعة دي؟")) return;
    const { error } = await supabase.from("owner_ledger_payments").delete().eq("id", id);
    if (error) onToast("تعذر الحذف: " + error.message);
    else {
      onToast("تم حذف الدفعة.");
      loadData();
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-title between">
          <div><Wallet size={20} /><h2>الدفتر الشخصي</h2></div>
          <button className="secondary" onClick={loadData}><RefreshCcw size={16} /> تحديث</button>
        </div>
        <div className="stats-grid compact-stats">
          <Metric label="سلّفته لناس" value={`${money(totals.lent)} ج`} tone="ok" icon={TrendingUp} />
          <Metric label="عليّ لناس" value={`${money(totals.borrowed)} ج`} tone="danger" icon={Banknote} />
          <Metric label="الصافي" value={`${money(Math.abs(totals.net))} ج ${totals.net >= 0 ? "ليك" : "عليك"}`} tone={totals.net >= 0 ? "ok" : "warn"} icon={Wallet} />
        </div>
        <p className="muted">الدفتر ده شخصي — محدش بيشوفه غيرك حتى الـ HR.</p>
      </section>

      <form className="panel form" onSubmit={submitEntry}>
        <div className="panel-title"><Wallet size={20} /><h2>قيد جديد</h2></div>
        <div className="form-grid">
          <label>الاسم<input value={form.person} onChange={(e) => setForm((f) => ({ ...f, person: e.target.value }))} required placeholder="اسم الشخص" /></label>
          <label>الاتجاه<select value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}><option value="lent">سلّفته فلوس</option><option value="borrowed">استلفت منه</option></select></label>
        </div>
        <div className="form-grid">
          <label>المبلغ<input type="number" min="0.5" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required /></label>
          <label>التاريخ<input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required /></label>
        </div>
        <label>ملاحظة<input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="اختياري" /></label>
        <button className="primary" disabled={busy}>{busy ? "جار التسجيل..." : "تسجيل"}</button>
      </form>

      {loading && <p className="muted">جاري التحميل...</p>}
      {!loading && byPerson.length === 0 && (
        <section className="panel"><p className="muted">الدفتر فاضي — سجّل أول قيد.</p></section>
      )}
      {byPerson.map(([person, personEntries]) => {
        const personRemaining = personEntries.reduce((sum, e) => sum + (e.direction === "lent" ? e.remaining : -e.remaining), 0);
        return (
          <section className="panel" key={person}>
            <div className="panel-title between">
              <div><Wallet size={20} /><h2>{person}</h2></div>
              <span className="badge">{personRemaining >= 0 ? `ليك ${money(personRemaining)} ج` : `عليك ${money(-personRemaining)} ج`}</span>
            </div>
            <div className="list">
              {personEntries.map((entry) => (
                <div className="list-row" key={entry.id}>
                  <div>
                    <strong>{entry.direction === "lent" ? "سلّفته" : "استلفت"} {money(entry.amount)} ج</strong>
                    <span>{entry.entry_date}{entry.note ? ` · ${entry.note}` : ""}</span>
                  </div>
                  <p>سدد: {money(entry.paid)} ج · متبقي: <strong>{money(entry.remaining)} ج</strong> {entry.remaining <= 0 && <StatusBadge status="settled" />}</p>
                  {entry.payments.length > 0 && (
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>التاريخ</th><th>المبلغ</th><th>ملاحظة</th><th>إجراء</th></tr></thead>
                        <tbody>
                          {entry.payments.map((p) => (
                            <tr key={p.id}>
                              <td dir="ltr">{p.pay_date}</td>
                              <td>{money(p.amount)} ج</td>
                              <td className="note-cell">{p.note || "-"}</td>
                              <td><button className="danger-link" onClick={() => removePayment(p.id)}>حذف</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {payFor === entry.id ? (
                    <form className="form" onSubmit={(e) => submitPayment(e, entry.id)}>
                      <div className="form-grid">
                        <label>المبلغ<input type="number" min="0.5" step="0.01" value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))} required /></label>
                        <label>التاريخ<input type="date" value={payForm.date} onChange={(e) => setPayForm((f) => ({ ...f, date: e.target.value }))} required /></label>
                      </div>
                      <label>ملاحظة<input value={payForm.note} onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))} placeholder="اختياري" /></label>
                      <div className="actions-row">
                        <button className="primary" disabled={busy}>تسجيل الدفعة</button>
                        <button type="button" className="secondary" onClick={() => setPayFor(null)}>إلغاء</button>
                      </div>
                    </form>
                  ) : (
                    <div className="actions-row">
                      {entry.remaining > 0 && (
                        <button className="secondary" type="button" onClick={() => { setPayFor(entry.id); setPayForm({ amount: String(entry.remaining), date: todayIso(), note: "" }); }}>
                          تسجيل دفعة
                        </button>
                      )}
                      <button className="danger-link" type="button" onClick={() => removeEntry(entry.id)}>حذف القيد</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }) {
  return <span className={cls("status-badge", status)}>{statusLabels[status] || status}</span>;
}

function Metric({ label, value, tone, icon: Icon, sub }) {
  return (
    <div className={cls("metric", tone)}>
      <div className="metric-head">
        <div>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
        {Icon && (
          <div className="metric-icon">
            <Icon size={19} />
          </div>
        )}
      </div>
      {sub && <span className="metric-sub">{sub}</span>}
    </div>
  );
}

function StatusDonut({ data }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return (
    <>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height={220}>
          <RePieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={88}
              paddingAngle={4}
            >
              {data.map((item) => (
                <Cell key={item.name} fill={item.color} />
              ))}
            </Pie>
            <ChartTooltip />
          </RePieChart>
        </ResponsiveContainer>
      </div>
      <div className="donut-legend">
        {data.map((item) => (
          <div key={item.name}>
            <span>
              <i style={{ background: item.color }} />
              {item.name}
            </span>
            <b>
              {item.value}
              {total ? ` · ${Math.round((item.value / total) * 100)}%` : ""}
            </b>
          </div>
        ))}
      </div>
    </>
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

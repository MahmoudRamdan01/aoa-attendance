import { Component, lazy, Suspense, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import AppShell from "./app/AppShell";
import { allowedViews, canAccessView, createViewRegistry, getFallbackView } from "./app/registry";
import { useHashRouter } from "./app/router";
import { Skeleton, Toast } from "./ui/primitives";
import EmployeeToday from "./features/home";
import MyMonthView from "./features/myrecord/MyMonthView";
import RequestsView from "./features/requests/RequestsView";
import NotificationsView from "./features/system/NotificationsView";
import TrainingView from "./features/training/TrainingView";
import DeductionsView from "./features/finance/DeductionsView";
import { LoginScreen, SetupBanner, Splash } from "./features/system/AuthScreens";

// A view chunk that fails to download is almost always a stale client: a new
// build replaced the hashed filenames this page was built against. Reloading
// pulls a fresh index.html pointing at chunks that exist. The timestamp guard
// stops it from looping if the chunk is genuinely unreachable (e.g. offline).
const RELOAD_KEY = "aoa:chunk-reload-at";

function lazyView(loader) {
  return lazy(() =>
    loader().catch((error) => {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      if (Date.now() - last > 10000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
        return new Promise(() => {}); // the reload takes over; never resolve
      }
      throw error;
    })
  );
}

const AssistantView = lazyView(() => import("./features/assistant/AssistantView"));
const EmployeesView = lazyView(() => import("./features/people/EmployeesView"));
const AdminDashboard = lazyView(() => import("./features/attendance/AdminDashboard"));
const OwnerDashboard = lazyView(() => import("./features/payroll/OwnerDashboard"));
const ExpensesView = lazyView(() => import("./features/finance/ExpensesView"));
const PartnerLedgerView = lazyView(() => import("./features/finance/PartnerLedgerView"));
const OwnerLedgerView = lazyView(() => import("./features/private-ledger/OwnerLedgerView"));

// Without this, a failed chunk import leaves Suspense pending forever and the
// screen just hangs on the skeleton.
class ViewErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="panel">
        <h2>فيه تحديث جديد للنظام</h2>
        <p className="muted">اقفل الصفحة وافتحها تاني عشان تحمّل النسخة الجديدة.</p>
        <button className="primary" type="button" onClick={() => window.location.reload()}>
          تحديث الصفحة
        </button>
      </section>
    );
  }
}

function ViewSkeleton() {
  return (
    <div className="ops-view-loading" role="status" aria-label="جاري تحميل الصفحة">
      <div className="ops-view-loading-head">
        <Skeleton width="34%" height={30} radius={10} />
        <Skeleton width="56%" height={13} radius={8} />
      </div>
      <div className="ops-view-loading-grid">
        <Skeleton height={116} radius={16} />
        <Skeleton height={116} radius={16} />
        <Skeleton height={116} radius={16} />
      </div>
      <Skeleton height={280} radius={18} />
      <span className="sr-only">جاري تحميل الصفحة…</span>
    </div>
  );
}

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

function App() {
  const [session, setSession] = useState(null);
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [unread, setUnread] = useState(0);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const { activeView, navigate, routeParams, routeParam } = useHashRouter("today");
  const viewRegistry = useMemo(
    () => createViewRegistry({
      today: EmployeeToday,
      month: MyMonthView,
      requests: RequestsView,
      notifications: NotificationsView,
      training: TrainingView,
      assistant: AssistantView,
      deductions: DeductionsView,
      expenses: ExpensesView,
      partner: PartnerLedgerView,
      team: EmployeesView,
      admin: AdminDashboard,
      owner: OwnerDashboard,
      ownerbook: OwnerLedgerView,
    }),
    [],
  );

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
    const requested = viewRegistry.find((view) => view.id === activeView);
    if (!requested || !canAccessView(requested, context)) {
      navigate(getFallbackView(viewRegistry, context), [], { replace: true });
      return;
    }
    if (!window.location.hash) {
      navigate(activeView, [], { replace: true });
    }
  }, [context?.role, context?.employee?.id, activeView, navigate, viewRegistry]);

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
    if (!session || !context || context.migration_required) {
      setRealtimeConnected(false);
      return;
    }
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
      .subscribe((status) => setRealtimeConnected(status === "SUBSCRIBED"));
    return () => {
      setRealtimeConnected(false);
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, context?.migration_required]);

  if (loading) return <Splash />;
  if (!session) return <LoginScreen />;
  if (!context) return <Splash />;

  const visibleViews = allowedViews(viewRegistry, context);
  const activeItem = visibleViews.find((view) => view.id === activeView);
  const ActiveComponent = activeItem?.component;

  return (
    <>
      <AppShell
        session={session}
        context={context}
        views={visibleViews}
        activeView={activeView}
        routeParams={routeParams}
        onNavigate={navigate}
        onSignOut={signOut}
        onRefresh={loadContext}
        unread={unread}
        setUnread={setUnread}
        realtimeConnected={realtimeConnected}
        onToast={setToast}
      >
        {context.migration_required ? <SetupBanner message={context.setup_message} /> : null}
        {ActiveComponent ? (
          <ViewErrorBoundary key={`${activeView}/${routeParams.join("/")}`}>
            <Suspense fallback={<ViewSkeleton />}>
              <ActiveComponent
                context={context}
                session={session}
                onToast={setToast}
                onNavigate={navigate}
                routeParam={routeParam}
              />
            </Suspense>
          </ViewErrorBoundary>
        ) : null}
      </AppShell>
      <Toast toast={toast} onDismiss={() => setToast("")} />
    </>
  );
}

export default App;

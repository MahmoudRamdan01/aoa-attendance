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
const CONTEXT_CACHE_PREFIX = "aoa:context:v1:";
const CONTEXT_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
const EMPLOYEES_CACHE_PREFIX = "aoa:employees:";

const VIEW_LOADERS = {
  assistant: () => import("./features/assistant/AssistantView"),
  team: () => import("./features/people/EmployeesView"),
  admin: () => import("./features/attendance/AdminDashboard"),
  security: () => import("./features/system/SecuritySettings"),
  owner: () => import("./features/payroll/OwnerDashboard"),
  expenses: () => import("./features/finance/ExpensesView"),
  treasury: () => import("./features/finance/TreasuryView"),
  partner: () => import("./features/finance/PartnerLedgerView"),
  ownerbook: () => import("./features/private-ledger/OwnerLedgerView"),
};

const viewPromises = new Map();

function preloadView(viewId) {
  const loader = VIEW_LOADERS[viewId];
  if (!loader) return Promise.resolve(null);
  if (!viewPromises.has(viewId)) {
    const promise = loader().catch((error) => {
      viewPromises.delete(viewId);
      throw error;
    });
    viewPromises.set(viewId, promise);
  }
  return viewPromises.get(viewId);
}

function readCachedContext(userId) {
  if (!userId) return null;
  try {
    const cached = JSON.parse(localStorage.getItem(`${CONTEXT_CACHE_PREFIX}${userId}`) || "null");
    // Identity stamp: a cached context is only valid for the exact user it was
    // saved for — never let one account render another's cached data.
    if (!cached?.value || cached.userId !== userId || Date.now() - Number(cached.savedAt || 0) > CONTEXT_CACHE_MAX_AGE) return null;
    return cached.value;
  } catch {
    return null;
  }
}

// Wipe every cached user's data from this browser (context + employees lists).
// Called on sign-out so the next person on a shared device starts clean.
function clearAllAppCaches() {
  try {
    for (const store of [localStorage, sessionStorage]) {
      for (const key of Object.keys(store)) {
        if (key.startsWith(CONTEXT_CACHE_PREFIX) || key.startsWith(EMPLOYEES_CACHE_PREFIX)) store.removeItem(key);
      }
    }
  } catch {
    /* no-op */
  }
}

function writeCachedContext(userId, value) {
  if (!userId || !value) return;
  try {
    localStorage.setItem(`${CONTEXT_CACHE_PREFIX}${userId}`, JSON.stringify({ savedAt: Date.now(), userId, value }));
  } catch {
    /* Storage may be disabled; the live request still works. */
  }
}


function lazyView(viewId) {
  return lazy(() =>
    preloadView(viewId).catch((error) => {
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

const AssistantView = lazyView("assistant");
const EmployeesView = lazyView("team");
const AdminDashboard = lazyView("admin");
const SecuritySettings = lazyView("security");
const OwnerDashboard = lazyView("owner");
const ExpensesView = lazyView("expenses");
const TreasuryView = lazyView("treasury");
const PartnerLedgerView = lazyView("partner");
const OwnerLedgerView = lazyView("ownerbook");

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
        <p className="muted">أغلق الصفحة وأعد فتحها لتحميل النسخة الجديدة.</p>
        <button className="primary" type="button" onClick={() => window.location.reload()}>
          تحديث الصفحة
        </button>
      </section>
    );
  }
}

function ViewSkeleton() {
  return (
    <div className="ops-view-loading" role="status" aria-label="جارٍ تحميل الصفحة">
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
      <span className="sr-only">جارٍ تحميل الصفحة…</span>
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
  const [mountedViews, setMountedViews] = useState([]);
  const { activeView, navigate, routeParams } = useHashRouter("today");
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
      treasury: TreasuryView,
      partner: PartnerLedgerView,
      team: EmployeesView,
      admin: AdminDashboard,
      security: SecuritySettings,
      owner: OwnerDashboard,
      ownerbook: OwnerLedgerView,
    }),
    [],
  );

  useEffect(() => {
    let currentUserId = null;
    const applySession = (nextSession) => {
      const nextUserId = nextSession?.user?.id || null;
      if (nextUserId !== currentUserId) {
        setContext(readCachedContext(nextUserId));
        currentUserId = nextUserId;
      }
      setSession(nextSession);
    };

    supabase.auth.getSession().then(({ data }) => {
      applySession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setContext(null);
      return;
    }
    let cancelled = false;
    const cached = readCachedContext(session.user.id);
    if (cached) setContext((current) => current || cached);
    loadContext(session, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    setMountedViews([]);
  }, [session?.user?.id]);

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

  // Download the small view chunks while the browser is idle. Heavy face
  // recognition files remain on-demand so they never compete with navigation.
  useEffect(() => {
    if (!context) return undefined;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || "")) return undefined;

    let cancelled = false;
    const preloadAllowedViews = async () => {
      const ids = allowedViews(viewRegistry, context)
        .map((view) => view.id)
        .filter((id) => VIEW_LOADERS[id] && id !== activeView);
      for (const id of ids) {
        if (cancelled) break;
        await preloadView(id).catch(() => {});
      }
    };

    let timer;
    let idleId;
    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(preloadAllowedViews, { timeout: 1800 });
    } else {
      timer = window.setTimeout(preloadAllowedViews, 400);
    }
    return () => {
      cancelled = true;
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [context?.role, context?.employee?.id, activeView, viewRegistry]);

  // Keep pages already opened mounted. Returning to a page is instant and its
  // fetched data, filters and scrollable content do not reset on every click.
  const routeSignature = routeParams.join("/");
  useEffect(() => {
    if (!context || !viewRegistry.some((view) => view.id === activeView)) return;
    setMountedViews((current) => {
      const nextRoute = { id: activeView, params: [...routeParams] };
      const index = current.findIndex((item) => item.id === activeView);
      if (index === -1) return [...current, nextRoute];
      if (current[index].params.join("/") === routeSignature) return current;
      return current.map((item, itemIndex) => (itemIndex === index ? nextRoute : item));
    });
  }, [activeView, routeSignature, context?.role, context?.employee?.id, viewRegistry]);

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

  async function loadContext(activeSession = session, isCancelled = () => false) {
    if (!activeSession) return;
    const { data, error } = await supabase.rpc("get_my_context_v1");
    if (isCancelled()) return;
    if (!error && data) {
      setContext(data);
      writeCachedContext(activeSession.user.id, data);
      return;
    }

    const uid = activeSession.user.id;
    const { data: admin, error: adminError } = await supabase
      .from("app_admins")
      .select("role,name")
      .eq("user_id", uid)
      .maybeSingle();
    if (isCancelled()) return;
    // When the device is temporarily offline, keep the last verified context
    // instead of replacing it with a misleading migration warning.
    if (adminError && readCachedContext(uid)) return;
    const fallbackContext = {
      role: admin?.role || "employee",
      admin_name: admin?.name || activeSession.user.email,
      employee: null,
      migration_required: true,
      setup_message:
        "شغّل ترحيل قاعدة البيانات (v1) لتفعيل بوابة الموظف وتحديد الموقع والإشعارات بالكامل.",
    };
    setContext(fallbackContext);
    writeCachedContext(uid, fallbackContext);
  }

  async function signOut() {
    clearAllAppCaches();
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
  const visibleMountedViews = mountedViews.filter((item) => visibleViews.some((view) => view.id === item.id));
  const routesToRender = activeItem && !visibleMountedViews.some((item) => item.id === activeView)
    ? [...visibleMountedViews, { id: activeView, params: [...routeParams] }]
    : visibleMountedViews;

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
        onRefresh={() => loadContext(session)}
        onViewIntent={(viewId) => preloadView(viewId).catch(() => {})}
        unread={unread}
        setUnread={setUnread}
        realtimeConnected={realtimeConnected}
        onToast={setToast}
      >
        {context.migration_required ? <SetupBanner message={context.setup_message} /> : null}
        {routesToRender.map((mountedView) => {
          const view = visibleViews.find((item) => item.id === mountedView.id);
          const ViewComponent = view?.component;
          const isActive = mountedView.id === activeView;
          const params = isActive ? routeParams : mountedView.params;
          if (!ViewComponent) return null;
          return (
            <div className="ops-mounted-view" key={mountedView.id} hidden={!isActive} aria-hidden={!isActive || undefined}>
              <ViewErrorBoundary>
                <Suspense fallback={<ViewSkeleton />}>
                  <ViewComponent
                    context={context}
                    session={session}
                    onToast={setToast}
                    onNavigate={navigate}
                    routeParam={params[0] || null}
                  />
                </Suspense>
              </ViewErrorBoundary>
            </div>
          );
        })}
      </AppShell>
      <Toast toast={toast} onDismiss={() => setToast("")} />
    </>
  );
}

export default App;

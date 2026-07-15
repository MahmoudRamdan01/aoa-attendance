import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CheckCheck,
  ChevronLeft,
  LockKeyhole,
  LogOut,
  Menu,
  MoreHorizontal,
  Moon,
  RefreshCcw,
  Search,
  Sun,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import CommandPalette from "../ui/CommandPalette";
import { EmptyState, PageHeader, Skeleton } from "../ui/primitives";
import {
  allowedViews,
  createQuickActions,
  getFallbackView,
  groupViewsBySection,
} from "./registry";
import { useTheme } from "./theme";

const roleNames = { employee: "موظف", hr: "HR", owner: "Owner" };
const notificationCategoryLabels = {
  admin_message: "رسالة إدارية",
  approval: "موافقة مطلوبة",
  qr: "QR يومي",
  system: "النظام",
};

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "AO";
  return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatDate(value, options) {
  try {
    return new Intl.DateTimeFormat("ar-EG-u-nu-latn", options).format(value);
  } catch {
    return "-";
  }
}

function focusableElements(container) {
  if (!container) return [];
  return [...container.querySelectorAll(
    'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.getClientRects().length > 0);
}

function ThemeButton({ theme, onToggle, mobile = false }) {
  const Icon = theme === "dark" ? Sun : Moon;
  return (
    <button
      className={mobile ? "" : "ops-icon-btn ops-theme-top"}
      type="button"
      onClick={onToggle}
      title={theme === "dark" ? "الوضع الفاتح" : "الوضع الغامق"}
      aria-label={theme === "dark" ? "تشغيل الوضع الفاتح" : "تشغيل الوضع الغامق"}
    >
      <Icon size={18} aria-hidden="true" />
      {mobile ? <span>{theme === "dark" ? "الوضع الفاتح" : "الوضع الغامق"}</span> : null}
    </button>
  );
}

function InboxPopover({
  id,
  open,
  onClose,
  unread,
  setUnread,
  onNavigate,
  onToast,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    supabase
      .from("notifications")
      .select("id,title,body,category,priority,read_at,created_at,created_by,group_id")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) onToast?.("تعذر تحميل الإشعارات.");
        setRows(data || []);
        setLoadError(Boolean(error));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setRows([]);
        setLoadError(true);
        setLoading(false);
        onToast?.("تعذر تحميل الإشعارات.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, unread, onToast]);

  if (!open) return null;

  const markRead = async (id) => {
    const row = rows.find((item) => item.id === id);
    if (!row || row.read_at) return;
    setBusy(String(id));
    const { error } = await supabase.rpc("mark_notification_read_v1", { p_id: id });
    setBusy("");
    if (error) {
      onToast?.("تعذر تحديث الإشعار.");
      return;
    }
    setRows((items) => items.map((item) => (item.id === id ? { ...item, read_at: new Date().toISOString() } : item)));
    setUnread?.((count) => Math.max(0, count - 1));
  };

  const markAllRead = async () => {
    setBusy("all");
    const { data, error } = await supabase.rpc("mark_all_notifications_read_v1");
    setBusy("");
    if (error || data?.error) {
      onToast?.(data?.message || "تعذر تحديث الإشعارات.");
      return;
    }
    setRows((items) => items.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
    setUnread?.(0);
    onToast?.(`تم تعليم ${data?.count || 0} إشعار كمقروء.`);
  };

  return (
    <section
      className="ops-inbox"
      id={id}
      role="dialog"
      aria-labelledby={`${id}-title`}
      aria-busy={loading || undefined}
    >
      <header className="ops-inbox-head">
        <div>
          <h2 id={`${id}-title`}>صندوق الإشعارات</h2>
          <span className="ui-page-eyebrow">
            <bdi dir="ltr">{unread}</bdi>
            <span>غير مقروء</span>
          </span>
        </div>
        <button
          className="ops-icon-btn"
          type="button"
          onClick={markAllRead}
          disabled={!unread || busy === "all"}
          aria-label="تعليم كل الإشعارات كمقروء"
          title="تعليم الكل كمقروء"
        >
          <CheckCheck size={17} aria-hidden="true" />
        </button>
      </header>

      <div className="ops-inbox-list">
        {loading ? (
          <div className="ops-inbox-loading" role="status" aria-label="جاري تحميل الإشعارات">
            {[0, 1, 2].map((item) => (
              <div className="ops-inbox-loading-row" key={item}>
                <Skeleton width={8} height={8} radius="50%" />
                <span>
                  <Skeleton width="48%" height={12} />
                  <Skeleton width="86%" height={9} />
                  <Skeleton width="32%" height={8} />
                </span>
              </div>
            ))}
          </div>
        ) : loadError ? (
          <EmptyState
            title="تعذر تحميل الإشعارات"
            description="اقفل الصندوق وافتحه تاني بعد ما تتأكد من الاتصال."
            compact
          />
        ) : rows.length ? (
          rows.slice(0, 8).map((item) => (
            <button
              className={`ops-inbox-item${item.read_at ? "" : " is-unread"}`}
              type="button"
              key={item.id}
              disabled={busy === String(item.id)}
              onClick={() => markRead(item.id)}
            >
              <span className="ops-inbox-item-dot" aria-hidden="true" />
              <span className="ops-inbox-item-copy">
                <strong>{item.title}</strong>
                <span>{item.body}</span>
                <time dateTime={item.created_at}>
                  <bdi dir="ltr">{formatDate(new Date(item.created_at), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</bdi>
                  {" · "}{notificationCategoryLabels[item.category] || item.category || "النظام"}
                </time>
              </span>
            </button>
          ))
        ) : (
          <EmptyState title="مفيش إشعارات بعد" description="أي تحديث جديد هيظهر هنا فورًا." compact />
        )}
      </div>

      <footer className="ops-inbox-foot">
        <button
          className="ui-action"
          type="button"
          onClick={() => {
            onNavigate?.("notifications");
            onClose?.();
          }}
        >
          فتح كل الإشعارات
        </button>
        <button className="ui-action" type="button" onClick={onClose}>إغلاق</button>
      </footer>
    </section>
  );
}

export default function AppShell({
  session,
  context,
  views = [],
  activeView,
  routeParams = [],
  onNavigate,
  onSignOut,
  onRefresh,
  unread = 0,
  setUnread,
  realtimeConnected = false,
  onToast,
  onViewIntent,
  children,
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const paletteTriggerRef = useRef(null);
  const inboxTriggerRef = useRef(null);
  const inboxWrapRef = useRef(null);
  const mainRef = useRef(null);
  const previousRouteRef = useRef(`${activeView}/${routeParams.join("/")}`);
  const mobileMoreRef = useRef(null);
  const mobileMoreTriggerRef = useRef(null);
  const mobileMoreRestoreFocusRef = useRef(null);
  const { theme, toggleTheme } = useTheme();
  const accessibleViews = useMemo(() => allowedViews(views, context), [views, context]);
  const activeItem = accessibleViews.find((view) => view.id === activeView) || accessibleViews[0];
  const navGroups = useMemo(() => groupViewsBySection(accessibleViews), [accessibleViews]);
  const quickActions = useMemo(() => createQuickActions(context), [context]);
  const displayName = context?.employee?.name || context?.admin_name || session?.user?.email || "مستخدم النظام";
  const role = context?.role || "employee";
  const isEmployeeMobileNav = role === "employee" && Boolean(context?.employee);
  const mobileTabs = accessibleViews.filter((view) => ["today", "record", "requests"].includes(view.mobileSlot));
  const moreViewIsActive = accessibleViews.some((view) => view.mobileSlot === "more" && view.id === activeView);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        if (event.repeat) return;
        setPaletteOpen((current) => {
          const next = !current;
          if (next) {
            setInboxOpen(false);
            setMobileMoreOpen(false);
          }
          return next;
        });
      }
      if (event.key === "Escape") {
        if (inboxOpen) {
          window.requestAnimationFrame(() => inboxTriggerRef.current?.focus());
        }
        setPaletteOpen(false);
        setInboxOpen(false);
        setMobileMoreOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inboxOpen]);

  useEffect(() => {
    const routeKey = `${activeView}/${routeParams.join("/")}`;
    if (previousRouteRef.current === routeKey) return undefined;
    previousRouteRef.current = routeKey;
    const frame = window.requestAnimationFrame(() => {
      mainRef.current?.focus({ preventScroll: true });
      mainRef.current?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeView, routeParams]);

  useEffect(() => {
    if (!inboxOpen) return undefined;
    const onPointerDown = (event) => {
      if (!inboxWrapRef.current?.contains(event.target)) setInboxOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [inboxOpen]);

  useEffect(() => {
    if (!mobileMoreOpen) return undefined;

    mobileMoreRestoreFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      focusableElements(mobileMoreRef.current)[0]?.focus();
    });
    const mobileQuery = window.matchMedia("(max-width: 820px)");
    const closeOnDesktop = (event) => {
      if (!event.matches) setMobileMoreOpen(false);
    };
    mobileQuery.addEventListener?.("change", closeOnDesktop);

    return () => {
      window.cancelAnimationFrame(frame);
      mobileQuery.removeEventListener?.("change", closeOnDesktop);
      document.body.style.overflow = previousOverflow;
      const restoreTarget = mobileMoreRestoreFocusRef.current?.isConnected
        ? mobileMoreRestoreFocusRef.current
        : mobileMoreTriggerRef.current;
      window.requestAnimationFrame(() => restoreTarget?.focus?.());
    };
  }, [mobileMoreOpen]);

  const handleMobileMoreKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setMobileMoreOpen(false);
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = focusableElements(mobileMoreRef.current);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const navigate = (view, params = []) => {
    onNavigate?.(view, params);
    setPaletteOpen(false);
    setInboxOpen(false);
    setMobileMoreOpen(false);
  };

  const openPalette = () => {
    setInboxOpen(false);
    setMobileMoreOpen(false);
    setPaletteOpen(true);
  };

  const openInbox = () => {
    setPaletteOpen(false);
    setMobileMoreOpen(false);
    setInboxOpen((current) => !current);
  };

  const openMore = () => {
    setPaletteOpen(false);
    setInboxOpen(false);
    setMobileMoreOpen(true);
  };

  return (
    <div
      className="ops-shell"
      data-section={activeItem?.accent || activeItem?.section || "home"}
      data-employee-tabs={isEmployeeMobileNav ? "true" : undefined}
    >
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
          mainRef.current?.scrollIntoView({ block: "start" });
        }}
      >
        تخطّي للقسم الرئيسي
      </a>

      <header className="ops-topbar">
        <div className="ops-topbar-inner">
          <button
            className="ops-brand"
            type="button"
            onClick={() => navigate(getFallbackView(accessibleViews, context))}
            aria-label="الرجوع للصفحة الرئيسية"
          >
            <span className="ops-brand-mark"><img src="./logo.png" alt="" /></span>
            <span className="ops-brand-copy">
              <strong lang="en" dir="ltr">AOI Ops Hub</strong>
              <span lang="en" dir="ltr">Air Ocean Line</span>
            </span>
          </button>

          <div className="ops-topbar-center">
            <button ref={paletteTriggerRef} className="ops-search-trigger" type="button" onClick={openPalette}>
              <Search size={17} aria-hidden="true" />
              <span>دور على صفحة، موظف، أو إجراء…</span>
              <span className="ops-kbd">Ctrl K</span>
            </button>
          </div>

          <div className="ops-topbar-actions">
            <button className="ops-icon-btn ops-mobile-only" type="button" onClick={openPalette} aria-label="فتح البحث السريع">
              <Search size={18} aria-hidden="true" />
            </button>
            {role !== "employee" ? (
              <button
                ref={mobileMoreTriggerRef}
                className="ops-icon-btn ops-mobile-only"
                type="button"
                onClick={openMore}
                aria-label="فتح قائمة النظام"
                aria-haspopup="dialog"
                aria-expanded={mobileMoreOpen}
                aria-controls="ops-mobile-more"
              >
                <Menu size={19} aria-hidden="true" />
              </button>
            ) : null}
            <button className="ops-icon-btn ops-refresh-top" type="button" onClick={onRefresh} title="تحديث بيانات الحساب">
              <RefreshCcw size={17} aria-hidden="true" />
            </button>
            <ThemeButton theme={theme} onToggle={toggleTheme} />
            <div className="ops-inbox-wrap" ref={inboxWrapRef}>
              <button
                ref={inboxTriggerRef}
                className="ops-icon-btn"
                type="button"
                onClick={openInbox}
                aria-label={unread > 0 ? `فتح صندوق الإشعارات، ${unread} غير مقروء` : "فتح صندوق الإشعارات"}
                aria-haspopup="dialog"
                aria-expanded={inboxOpen}
                aria-controls="ops-inbox"
              >
                <Bell size={18} aria-hidden="true" />
                {unread > 0 ? <bdi className="ops-unread-badge" dir="ltr">{unread > 99 ? "99+" : unread}</bdi> : null}
              </button>
              <InboxPopover
                id="ops-inbox"
                open={inboxOpen}
                onClose={() => setInboxOpen(false)}
                unread={unread}
                setUnread={setUnread}
                onNavigate={navigate}
                onToast={onToast}
              />
            </div>
            <div className="ops-user-chip" title={displayName}>
              <span className="ops-avatar">{initials(displayName)}</span>
              <span className="ops-user-copy">
                <strong>{displayName}</strong>
                <bdi dir={role === "employee" ? "rtl" : "ltr"}>{roleNames[role] || role}</bdi>
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="ops-layout">
        <aside className="ops-sidebar" aria-label="التنقل الرئيسي">
          <nav className="ops-sidebar-nav">
            {navGroups.map((group) => (
              <section className="ops-nav-section" key={group.id}>
                <h2 className="ops-nav-heading">
                  {group.private ? <LockKeyhole size={12} aria-hidden="true" /> : null}
                  {group.ar}
                </h2>
                <div className="ops-nav-list">
                  {group.items.map((view) => {
                    const Icon = view.icon;
                    const selected = view.id === activeView;
                    return (
                      <button
                        className="ops-nav-item"
                        type="button"
                        key={view.id}
                        onPointerEnter={() => onViewIntent?.(view.id)}
                        onFocus={() => onViewIntent?.(view.id)}
                        onClick={() => navigate(view.id)}
                        aria-current={selected ? "page" : undefined}
                      >
                        <Icon size={18} aria-hidden="true" />
                        <span className="ops-nav-label">
                          <strong>{view.ar}</strong>
                          <small lang="en" dir="ltr">{view.en}</small>
                        </span>
                        {view.private ? <LockKeyhole className="ops-private-lock" size={13} aria-hidden="true" /> : selected ? <ChevronLeft size={14} aria-hidden="true" /> : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </nav>

          <div className="ops-sidebar-foot">
            <div className="ops-connection" role="status" aria-live="polite">
              <span className="ops-live-dot" data-live={realtimeConnected ? "true" : undefined} />
              <span>{realtimeConnected ? "الإشعارات متصلة لحظيًا" : "النظام جاهز"}</span>
            </div>
            <button className="ops-nav-item ops-logout" type="button" onClick={onSignOut}>
              <LogOut size={18} aria-hidden="true" />
              <span className="ops-nav-label"><strong>خروج</strong><small lang="en" dir="ltr">Sign out</small></span>
            </button>
          </div>
        </aside>

        <main ref={mainRef} className="ops-main" id="main-content" tabIndex="-1">
          <div className="ops-main-inner">
            <PageHeader
              eyebrow={(
                <>
                  <bdi dir="ltr">{formatDate(new Date(), { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</bdi>
                  <span>· أهلًا، {displayName}</span>
                </>
              )}
              title={activeItem?.ar || "لوحة التحكم"}
              description={activeItem?.private ? "مساحة خاصة ومحمية لحساب الـ Owner." : undefined}
              icon={activeItem?.icon}
            />
            <div className="ops-view">
              {children}
            </div>
          </div>
        </main>
      </div>

      {isEmployeeMobileNav ? (
        <nav className="ops-bottom-nav" aria-label="تنقل الموظف">
          {mobileTabs.map((view) => {
            const Icon = view.icon;
            const selected = view.id === activeView;
            return (
              <button className="ops-bottom-tab" type="button" key={view.id} onPointerEnter={() => onViewIntent?.(view.id)} onFocus={() => onViewIntent?.(view.id)} onClick={() => navigate(view.id)} aria-current={selected ? "page" : undefined}>
                <Icon size={20} aria-hidden="true" />
                <span>{view.mobileSlot === "today" ? "اليوم" : view.mobileSlot === "record" ? "سجلي" : "طلباتي"}</span>
              </button>
            );
          })}
          <button
            ref={mobileMoreTriggerRef}
            className="ops-bottom-tab"
            type="button"
            onClick={openMore}
            aria-current={moreViewIsActive ? "page" : undefined}
            aria-haspopup="dialog"
            aria-expanded={mobileMoreOpen}
            aria-controls="ops-mobile-more"
          >
            <MoreHorizontal size={21} aria-hidden="true" />
            <span>المزيد</span>
          </button>
        </nav>
      ) : null}

      {mobileMoreOpen ? (
        <div className="ops-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMobileMoreOpen(false); }}>
          <section
            ref={mobileMoreRef}
            className="ops-mobile-more"
            id="ops-mobile-more"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ops-mobile-more-title"
            onKeyDown={handleMobileMoreKeyDown}
          >
            <span className="ops-mobile-more-handle" aria-hidden="true" />
            <header className="ops-mobile-more-head">
              <h2 id="ops-mobile-more-title">{isEmployeeMobileNav ? "المزيد" : "قائمة النظام"}</h2>
              <button className="ops-mobile-more-close" type="button" onClick={() => setMobileMoreOpen(false)} aria-label="إغلاق القائمة">
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            {(isEmployeeMobileNav
              ? accessibleViews.filter((view) => view.mobileSlot === "more")
              : accessibleViews.filter((view) => view.nav !== false)
            ).map((view) => {
              const Icon = view.icon;
              return (
                <button type="button" key={view.id} onPointerEnter={() => onViewIntent?.(view.id)} onFocus={() => onViewIntent?.(view.id)} onClick={() => navigate(view.id)}>
                  <Icon size={19} aria-hidden="true" />
                  <span>{view.ar}</span>
                </button>
              );
            })}
            <ThemeButton theme={theme} onToggle={toggleTheme} mobile />
            <button className="is-danger" type="button" onClick={onSignOut}>
              <LogOut size={19} aria-hidden="true" />
              <span>خروج</span>
            </button>
          </section>
        </div>
      ) : null}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        views={accessibleViews}
        actions={quickActions}
        context={context}
        onNavigate={navigate}
        triggerRef={paletteTriggerRef}
      />
    </div>
  );
}

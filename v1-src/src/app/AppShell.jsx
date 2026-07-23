import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cls } from "../lib/cls";
import { haptic } from "../lib/haptics";
import {
  Bell,
  ChevronLeft,
  LockKeyhole,
  LogOut,
  Menu,
  MoreHorizontal,
  Moon,
  RefreshCcw,
  ScanFace,
  Search,
  Sun,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { COMPANY } from "../lib/company";
import CommandPalette from "../ui/CommandPalette";
import FaceLoginSetup, { requestFaceSetup } from "../features/system/FaceLoginSetup";
import OfflineBanner from "../ui/OfflineBanner";
import { PageHeader } from "../ui/primitives";
import {
  allowedViews,
  createQuickActions,
  getFallbackView,
  groupViewsBySection,
} from "./registry";
import { useBackClose, useSheetDrag } from "./router";
import { useTheme } from "./theme";

const roleNames = { employee: "موظف", hr: "HR", owner: "مالك" };
// Primary mobile bottom-tab views per role (short labels below). Up to 4
// primary tabs; the last slot is always "المزيد" → full menu sheet. The owner
// with a linked employee record gets the employee portal tabs too (redesign
// spec A); without one they keep the ops-first set.
const MOBILE_PRIMARY = {
  employee: ["today", "month", "requests"],
  hr: ["admin", "deductions", "expenses"],
  owner: ["today", "owner", "month", "requests"],
  ownerNoEmployee: ["owner", "admin", "team"],
};
const MOBILE_TAB_MAX = 4;
const MOBILE_TAB_LABELS = {
  today: "اليوم", month: "سجلي", requests: "طلباتي",
  admin: "الحضور", team: "الفريق", owner: "الرواتب",
  deductions: "الخصومات", expenses: "المصروفات", partner: "المديونية",
  ownerbook: "الخاص", notifications: "الإشعارات", training: "التدريب", assistant: "المساعد",
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
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const paletteTriggerRef = useRef(null);
  const inboxTriggerRef = useRef(null);
  const mainRef = useRef(null);
  const previousRouteRef = useRef(`${activeView}/${routeParams.join("/")}`);
  const mobileMoreRef = useRef(null);
  const mobileMoreTriggerRef = useRef(null);
  const mobileMoreRestoreFocusRef = useRef(null);
  const { theme, toggleTheme } = useTheme();
  // Animated dismissal: mark the surface as closing, unmount after the exit
  // animation. Drag-to-dismiss finishes its own slide then unmounts directly.
  const [moreClosing, setMoreClosing] = useState(false);
  const closeMore = useCallback(() => {
    setMoreClosing((already) => {
      if (already) return already;
      window.setTimeout(() => {
        setMobileMoreOpen(() => false);
        setMoreClosing(() => false);
      }, 175);
      return true;
    });
  }, []);
  useSheetDrag(mobileMoreRef, () => setMobileMoreOpen(() => false), mobileMoreOpen);
  // Hardware Back closes open surfaces instead of leaving the app.
  useBackClose(mobileMoreOpen, () => closeMore());
  const accessibleViews = useMemo(() => allowedViews(views, context), [views, context]);
  const activeItem = accessibleViews.find((view) => view.id === activeView) || accessibleViews[0];
  const navGroups = useMemo(() => groupViewsBySection(accessibleViews), [accessibleViews]);
  const quickActions = useMemo(() => createQuickActions(context), [context]);
  const displayName = context?.employee?.name || context?.admin_name || session?.user?.email || "مستخدم النظام";
  const role = context?.role || "employee";
  // Every role gets the mobile bottom nav (not just employees). Primary tabs
  // are curated per role; the 4th is always "المزيد" → full menu sheet.
  const mobileTabs = useMemo(() => {
    const primaryKey = role === "owner" && !context?.employee ? "ownerNoEmployee" : role;
    const primary = MOBILE_PRIMARY[primaryKey] || [];
    const tabs = primary
      .map((viewId) => accessibleViews.find((view) => view.id === viewId))
      .filter(Boolean);
    for (const view of accessibleViews) {
      if (tabs.length >= MOBILE_TAB_MAX) break;
      if (view.nav === false || view.mobileSlot === "more") continue;
      if (!tabs.some((tab) => tab.id === view.id)) tabs.push(view);
    }
    return tabs.slice(0, MOBILE_TAB_MAX);
  }, [accessibleViews, role, context?.employee]);
  const showBottomNav = Boolean(context) && mobileTabs.length > 0;
  const moreViewIsActive = !mobileTabs.some((tab) => tab.id === activeView);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        if (event.repeat) return;
        setPaletteOpen((current) => {
          const next = !current;
          if (next) closeMore();
          return next;
        });
      }
      if (event.key === "Escape") {
        setPaletteOpen(false);
        closeMore();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
    if (!mobileMoreOpen) return undefined;

    mobileMoreRestoreFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      focusableElements(mobileMoreRef.current)[0]?.focus();
    });
    const mobileQuery = window.matchMedia("(max-width: 820px)");
    const closeOnDesktop = (event) => {
      if (!event.matches) closeMore();
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
      closeMore();
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
    closeMore();
  };

  const openPalette = () => {
    closeMore();
    setPaletteOpen(true);
  };

  const openMore = () => {
    setPaletteOpen(false);
    setMobileMoreOpen(true);
  };

  // Pull-to-refresh (touch devices): pulling down from the very top shows a
  // circular indicator; past the threshold it triggers the same full refresh
  // as the topbar button. DOM-driven (refs, no re-render per frame).
  const ptrRef = useRef(null);
  const ptrBusyRef = useRef(false);
  useEffect(() => {
    if (!window.matchMedia?.("(pointer: coarse)")?.matches) return undefined;
    const scroller = () => document.scrollingElement || document.documentElement;
    let startY = 0;
    let pull = 0;
    let pulling = false;
    const indicator = () => ptrRef.current;
    const setPull = (next) => {
      pull = next;
      const el = indicator();
      if (!el) return;
      el.style.opacity = String(Math.min(1, pull / 58));
      el.style.transform = `translateY(${Math.min(72, pull * 0.62)}px) rotate(${pull * 2.4}deg)`;
    };
    const onStart = (event) => {
      if (ptrBusyRef.current || scroller().scrollTop > 0) { pulling = false; return; }
      pulling = true;
      startY = event.touches[0].clientY;
      setPull(0);
    };
    const onMove = (event) => {
      if (!pulling) return;
      if (scroller().scrollTop > 0) { pulling = false; setPull(0); return; }
      const dy = event.touches[0].clientY - startY;
      setPull(Math.max(0, Math.min(110, dy * 0.5)));
    };
    const onEnd = () => {
      if (!pulling) return;
      pulling = false;
      const el = indicator();
      if (pull > 58 && !ptrBusyRef.current) {
        ptrBusyRef.current = true;
        haptic();
        el?.setAttribute("data-busy", "true");
        el && (el.style.opacity = "1", el.style.transform = "translateY(52px)");
        onRefresh?.();
        window.setTimeout(() => {
          ptrBusyRef.current = false;
          el?.removeAttribute("data-busy");
          setPull(0);
        }, 1100);
      } else {
        setPull(0);
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [onRefresh]);

  return (
    <div
      className="ops-shell"
      data-view={activeView}
      data-section={activeItem?.accent || activeItem?.section || "home"}
      data-employee-tabs={showBottomNav ? "true" : undefined}
    >
      <div ref={ptrRef} className="ops-ptr" aria-hidden="true">
        <RefreshCcw size={17} />
      </div>
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
          {/* Mobile greeting header (redesign spec G) — desktop keeps the brand. */}
          <div className="ops-mobile-greeting">
            <span className="ops-mobile-avatar" aria-hidden="true">{String(displayName).trim().charAt(0) || "A"}</span>
            <span className="ops-mobile-greet-copy">
              <span className="ops-mobile-greet-top">
                <strong>{new Date().getHours() < 12 ? "صباح الخير" : "مساء الخير"}، {String(displayName).trim().split(/\s+/)[0]}</strong>
                <i className="ops-role-chip">{roleNames[role] || role}</i>
              </span>
              <small>
                <span lang="en" dir="ltr">{COMPANY.name}</span>
                {" · "}
                {formatDate(new Date(), { weekday: "long", day: "numeric", month: "long" })}
              </small>
            </span>
          </div>
          <button
            className="ops-brand"
            type="button"
            onClick={() => navigate(getFallbackView(accessibleViews, context))}
            aria-label="الرجوع للصفحة الرئيسية"
          >
            <span className="ops-brand-mark"><img src="./logo.png" alt="" /></span>
            <span className="ops-brand-copy">
              <strong lang="en" dir="ltr">{COMPANY.opsTitle}</strong>
              <span lang="en" dir="ltr">{COMPANY.name}</span>
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
            {!showBottomNav ? (
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
            {/* Bell opens the full «الإشعارات والطلبات» screen (redesign)
                instead of the old popover. */}
            <button
              ref={inboxTriggerRef}
              className="ops-icon-btn"
              type="button"
              onClick={() => navigate("inbox")}
              aria-label={unread > 0 ? `فتح الإشعارات والطلبات، ${unread} غير مقروء` : "فتح الإشعارات والطلبات"}
            >
              <Bell size={18} aria-hidden="true" />
              {unread > 0 ? <bdi className="ops-unread-badge" dir="ltr">{unread > 99 ? "99+" : unread}</bdi> : null}
            </button>
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

      <OfflineBanner />

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
              description={activeItem?.private ? "مساحة خاصة ومحمية لحساب المالك." : undefined}
              icon={activeItem?.icon}
            />
            <div className="ops-view">
              {children}
            </div>
          </div>
        </main>
      </div>

      {showBottomNav ? (
        <nav className="ops-bottom-nav" aria-label="التنقل السريع">
          {mobileTabs.map((view) => {
            const Icon = view.icon;
            const selected = view.id === activeView;
            return (
              <button className="ops-bottom-tab" type="button" key={view.id} onPointerEnter={() => onViewIntent?.(view.id)} onFocus={() => onViewIntent?.(view.id)} onClick={() => navigate(view.id)} aria-current={selected ? "page" : undefined}>
                <Icon size={20} aria-hidden="true" />
                <span>{MOBILE_TAB_LABELS[view.id] || view.ar}</span>
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
        <div className={cls("ops-sheet-backdrop", moreClosing && "ops-closing")} onMouseDown={(event) => { if (event.target === event.currentTarget) closeMore(); }}>
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
              <h2 id="ops-mobile-more-title">المزيد</h2>
              <button className="ops-mobile-more-close" type="button" onClick={() => closeMore()} aria-label="إغلاق القائمة">
                <X size={18} aria-hidden="true" />
              </button>
            </header>

            {/* Profile card (design ref 08) */}
            <div className="more-profile">
              <span className="more-avatar" aria-hidden="true">{String(displayName).trim().charAt(0) || "A"}</span>
              <span className="more-profile-copy">
                <strong>{displayName}</strong>
                <bdi dir="ltr">{session?.user?.email || ""}</bdi>
              </span>
              <i className="more-role-chip">{roleNames[role] || role}</i>
            </div>

            {/* Grouped menu — sections with dot-rows exactly like the design */}
            {groupViewsBySection(
              accessibleViews.filter((view) => view.nav !== false && !mobileTabs.some((tab) => tab.id === view.id))
            ).map((group) => (
              <div key={group.id} className="more-group-wrap">
                <p className="more-section-label">{group.ar}</p>
                <div className="more-group">
                  {group.items.map((view) => (
                    <button
                      type="button"
                      className="more-row"
                      key={view.id}
                      onPointerEnter={() => onViewIntent?.(view.id)}
                      onFocus={() => onViewIntent?.(view.id)}
                      onClick={() => navigate(view.id)}
                    >
                      <span className="more-dot" data-section={view.accent || view.section} aria-hidden="true" />
                      <span className="more-row-label">{view.ar}</span>
                      <ChevronLeft size={14} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <p className="more-section-label">التطبيق</p>
            <div className="more-group">
              <button type="button" className="more-row" onClick={openPalette}>
                <Search size={16} aria-hidden="true" />
                <span className="more-row-label">بحث سريع</span>
                <ChevronLeft size={14} aria-hidden="true" />
              </button>
              <button type="button" className="more-row" onClick={() => { onRefresh?.(); closeMore(); }}>
                <RefreshCcw size={16} aria-hidden="true" />
                <span className="more-row-label">تحديث البيانات</span>
              </button>
              <button
                type="button"
                className="more-row"
                onClick={() => {
                  closeMore();
                  // The sheet's back-close consumes a history entry ~175ms
                  // after closing; opening the setup dialog before that would
                  // get it popped right back shut. The dialog needs no user
                  // gesture (the camera opens from ITS confirm tap).
                  window.setTimeout(requestFaceSetup, 230);
                }}
              >
                <ScanFace size={16} aria-hidden="true" />
                <span className="more-row-label">تسجيل بصمة الوجه للدخول</span>
                <ChevronLeft size={14} aria-hidden="true" />
              </button>
              <button type="button" className="more-row" onClick={toggleTheme}>
                {theme === "dark" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
                <span className="more-row-label">{theme === "dark" ? "الوضع الفاتح" : "الوضع الغامق"}</span>
              </button>
              <button type="button" className="more-row is-danger" onClick={onSignOut}>
                <LogOut size={16} aria-hidden="true" />
                <span className="more-row-label">تسجيل خروج</span>
              </button>
            </div>
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

      <FaceLoginSetup session={session} onToast={onToast} />
    </div>
  );
}

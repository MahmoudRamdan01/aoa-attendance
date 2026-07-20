import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readHash(defaultView) {
  const value = window.location.hash.replace(/^#\/?/, "");
  const parts = value.split("/").filter(Boolean).map(safeDecode);
  return {
    view: parts[0] || defaultView,
    params: parts.slice(1),
  };
}

export function buildHash(view, params = []) {
  const encoded = [view, ...params]
    .filter((part) => part !== undefined && part !== null && String(part) !== "")
    .map((part) => encodeURIComponent(String(part)));
  return `#/${encoded.join("/")}`;
}

// Make the hardware/browser Back button close an open overlay (sheet, dialog,
// palette, capture) instead of leaving the page or exiting the installed PWA.
// While `open`, one same-URL history entry is pushed; Back pops it → onClose.
// Closing any other way (X, Esc, backdrop) consumes that entry silently.
// The URL hash never changes, so useHashRouter's listeners see no route change.
export function useBackClose(open, onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    let pushed = true;
    window.history.pushState({ aoaOverlay: true }, "");
    const onPop = () => {
      pushed = false;
      onCloseRef.current?.();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Consume our entry only if it is still on top — if the app navigated
      // meanwhile (hash change pushed a new entry), going back would undo
      // that navigation instead of just removing the overlay entry.
      if (pushed && window.history.state?.aoaOverlay) window.history.back();
    };
  }, [open]);
}

// Commit a route change inside a View Transition (Chrome/Safari) so page
// switches cross-fade like a native app. flushSync makes React paint the new
// view inside the transition callback. Falls back to a plain state update
// (older browsers get the CSS re-entry animation from App.jsx instead).
function commitRoute(apply) {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (typeof document.startViewTransition === "function" && !reduced) {
    document.startViewTransition(() => {
      flushSync(apply);
    });
  } else {
    apply();
  }
}

function sameRoute(a, b) {
  return a.view === b.view && a.params.join("/") === b.params.join("/");
}

export function useHashRouter(defaultView = "today") {
  const [route, setRoute] = useState(() => readHash(defaultView));
  const routeRef = useRef(route);
  routeRef.current = route;

  useEffect(() => {
    const onHashChange = () => {
      const next = readHash(defaultView);
      // Overlay back-close pops re-fire popstate on the same URL — no route
      // change, so no transition (and no state churn).
      if (sameRoute(next, routeRef.current)) return;
      commitRoute(() => setRoute(next));
    };
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("popstate", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onHashChange);
    };
  }, [defaultView]);

  const navigate = useCallback((view, params = [], options = {}) => {
    const nextParams = Array.isArray(params) ? params : [params];
    const hash = buildHash(view, nextParams);
    const nextRoute = { view, params: nextParams.filter((part) => part !== undefined && part !== null && String(part) !== "").map(String) };

    if (window.location.hash === hash) {
      if (!sameRoute(nextRoute, routeRef.current)) commitRoute(() => setRoute(nextRoute));
      return;
    }

    if (options.replace) {
      window.history.replaceState(null, "", hash);
      commitRoute(() => setRoute(nextRoute));
      return;
    }

    window.location.hash = hash;
  }, []);

  const setActiveView = useCallback((view, options = {}) => {
    navigate(view, [], options);
  }, [navigate]);

  return {
    activeView: route.view,
    setActiveView,
    navigate,
    routeParams: route.params,
    routeParam: route.params[0] || null,
  };
}

// Uber-style bottom-sheet drag-to-dismiss: while the sheet is scrolled to the
// top, dragging down follows the finger (with resistance); a long or fast
// drag slides the sheet away and calls onDismissed, otherwise it springs
// back. Touch-only — desktop popovers are unaffected.
export function useSheetDrag(ref, onDismissed, enabled = true) {
  const dismissRef = useRef(onDismissed);
  dismissRef.current = onDismissed;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return undefined;
    // Sheets whose body scrolls independently mark a grab area with
    // [data-sheet-handle]; otherwise the whole sheet is draggable.
    const grab = el.querySelector("[data-sheet-handle]") || el;
    let startY = 0;
    let lastY = 0;
    let startTime = 0;
    let tracking = false;
    let dragging = false;

    const onTouchStart = (event) => {
      if (el.scrollTop > 2) return;
      tracking = true;
      dragging = false;
      startY = lastY = event.touches[0].clientY;
      startTime = Date.now();
    };

    const onTouchMove = (event) => {
      if (!tracking) return;
      lastY = event.touches[0].clientY;
      const dy = lastY - startY;
      if (!dragging) {
        if (dy < 8) { if (dy < -4) tracking = false; return; }
        dragging = true;
        el.style.transition = "none";
        el.parentElement?.classList.add("ops-dragging");
      }
      event.preventDefault();
      const pull = Math.max(0, dy);
      el.style.transform = `translateY(${pull * 0.85}px)`;
    };

    const onTouchEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (!dragging) return;
      dragging = false;
      const dy = lastY - startY;
      const velocity = dy / Math.max(1, Date.now() - startTime);
      // ops-dragging suppresses the entry animation's fill (which would beat
      // our inline transform) — keep it until the spring-back settles.
      if (dy > 90 || velocity > 0.55) {
        el.style.transition = "transform 170ms ease-in";
        el.style.transform = "translateY(105%)";
        el.parentElement?.classList.add("ops-closing");
        window.setTimeout(() => {
          dismissRef.current?.();
          el.style.transition = "";
          el.style.transform = "";
        }, 165);
      } else {
        el.style.transition = "transform 220ms var(--ease-emphasized, ease-out)";
        el.style.transform = "";
        window.setTimeout(() => {
          if (el.isConnected) el.style.transition = "";
          el.parentElement?.classList.remove("ops-dragging");
        }, 240);
      }
    };

    grab.addEventListener("touchstart", onTouchStart, { passive: true });
    grab.addEventListener("touchmove", onTouchMove, { passive: false });
    grab.addEventListener("touchend", onTouchEnd, { passive: true });
    grab.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      grab.removeEventListener("touchstart", onTouchStart);
      grab.removeEventListener("touchmove", onTouchMove);
      grab.removeEventListener("touchend", onTouchEnd);
      grab.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [ref, enabled]);
}

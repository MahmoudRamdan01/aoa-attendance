import { useCallback, useEffect, useRef, useState } from "react";

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

export function useHashRouter(defaultView = "today") {
  const [route, setRoute] = useState(() => readHash(defaultView));

  useEffect(() => {
    const onHashChange = () => setRoute(readHash(defaultView));
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
      setRoute(nextRoute);
      return;
    }

    if (options.replace) {
      window.history.replaceState(null, "", hash);
      setRoute(nextRoute);
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

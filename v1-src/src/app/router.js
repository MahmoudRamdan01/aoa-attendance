import { useCallback, useEffect, useState } from "react";

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

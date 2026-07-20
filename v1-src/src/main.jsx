import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/alexandria/arabic-600.css";
import "@fontsource/alexandria/latin-600.css";
import "@fontsource/alexandria/arabic-700.css";
import "@fontsource/alexandria/latin-700.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-400.css";
import "@fontsource/ibm-plex-sans-arabic/latin-400.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-600.css";
import "@fontsource/ibm-plex-sans-arabic/latin-600.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-700.css";
import "@fontsource/ibm-plex-sans-arabic/latin-700.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import App from "./App.jsx";
import { COMPANY } from "./lib/company";
import "./styles.css";

// Company theme hook: tokens.css scopes per-company palettes on this attribute.
document.documentElement.dataset.company = COMPANY.key;

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  // When a NEW service worker takes control after a deploy, reload once so an
  // installed PWA picks up the fresh build instead of serving a stale one
  // (this is what left the owner's home-screen app looking "old"). We skip the
  // very first claim (no previous controller) so first-time visitors don't bounce.
  let hadController = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) { hadController = true; return; }
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  window.addEventListener("load", () => {
    // Face-recognition models are intentionally not warmed here. They are more
    // than 10 MB and must never compete with normal page/API loading.
    navigator.serviceWorker.register("./sw.js").then((reg) => {
      reg.update?.();
      // Check for a newer worker whenever the app regains focus.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update?.();
      });
    }).catch(() => {});
  });
}

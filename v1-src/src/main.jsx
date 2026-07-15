import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/alexandria/arabic-600.css";
import "@fontsource/alexandria/latin-600.css";
import "@fontsource/alexandria/arabic-700.css";
import "@fontsource/alexandria/latin-700.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-400.css";
import "@fontsource/ibm-plex-sans-arabic/latin-400.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-500.css";
import "@fontsource/ibm-plex-sans-arabic/latin-500.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-600.css";
import "@fontsource/ibm-plex-sans-arabic/latin-600.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-700.css";
import "@fontsource/ibm-plex-sans-arabic/latin-700.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    // Face-recognition models are intentionally not warmed here. They are more
    // than 10 MB and must never compete with normal page/API loading.
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

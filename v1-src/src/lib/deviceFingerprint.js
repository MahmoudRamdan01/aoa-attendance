const DEVICE_ID_KEY = "aoa:v1:deviceId";

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function canvasSignature() {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 220;
    canvas.height = 40;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "top";
    ctx.font = "16px Arial";
    ctx.fillStyle = "#0c1722";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fcc107";
    ctx.fillText("AOA attendance · حضور", 6, 7);
    return canvas.toDataURL();
  } catch {
    return "";
  }
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function getDeviceFingerprint() {
  const screenInfo = typeof screen === "undefined"
    ? ""
    : [screen.width, screen.height, screen.colorDepth, window.devicePixelRatio || 1].join("x");
  const source = [
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    navigator.hardwareConcurrency || "",
    navigator.deviceMemory || "",
    screenInfo,
    Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    canvasSignature(),
  ].join("|");
  return `fp1-${fnv1a(source)}`;
}

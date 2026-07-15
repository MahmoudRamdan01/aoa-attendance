import { supabase, todayIso } from "./supabase";

const MAX_EDGE = 640;
const MAX_BYTES = 450 * 1024;

function canvasBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("تعذر تجهيز الصورة."))),
      "image/jpeg",
      quality,
    );
  });
}

export async function videoFrameToJpeg(video) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) throw new Error("الكاميرا لسه بتجهز. استنى لحظة وحاول تاني.");

  const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.drawImage(video, 0, 0, width, height);

  let blob = await canvasBlob(canvas, 0.82);
  if (blob.size > MAX_BYTES) blob = await canvasBlob(canvas, 0.68);
  if (blob.size > 500 * 1024) blob = await canvasBlob(canvas, 0.55);
  if (blob.size > 500 * 1024) throw new Error("حجم الصورة أكبر من المسموح. حاول في إضاءة أبسط.");
  return { blob, width, height };
}

function cairoTimeParts(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function capturePath(employeeId, kind, capturedAt = new Date()) {
  const parts = cairoTimeParts(capturedAt);
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}${parts.minute}${parts.second}`;
  return `${employeeId}/${date}-${kind}-${time}.jpg`;
}

export async function uploadAttendanceCapture({
  employeeId,
  kind,
  blob,
  capturedAt = new Date(),
  path = null,
}) {
  const objectPath = path || capturePath(employeeId, kind, capturedAt);
  const { error } = await supabase.storage
    .from("attendance-captures")
    .upload(objectPath, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });

  if (error) {
    const message = String(error.message || "").toLowerCase();
    const duplicate = error.statusCode === "409" || message.includes("already exists") || message.includes("duplicate");
    if (!duplicate) throw error;
  }
  return objectPath;
}

export function isCaptureFromToday(capturedAt) {
  return todayIso() === new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date(capturedAt));
}

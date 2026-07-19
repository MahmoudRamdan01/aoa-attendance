function money(value) {
  return Math.round(Number(value || 0)).toLocaleString("en-US");
}

// Normalize an Arabic name for grouping (merge spellings: فورة/فوره, أ/ا, ى/ي).
function normalizeArabicName(s) {
  return String(s || "")
    .replace(/[ً-ْ]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
    .replace(/\s+/g, " ").trim();
}

function fmtDate(date) {
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function fmtDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ar-EG-u-nu-latn", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Full submission stamp: weekday + date + time ("الأحد، 19/07/2026، 08:45 م").
function fmtSubmittedAt(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ar-EG-u-nu-latn", {
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// "17:46:00" → "5:46 م" — 12-hour clock for attendance times.
function fmtTime12(value) {
  if (!value) return null;
  const [h, m] = String(value).split(":");
  const hour = Number(h);
  if (Number.isNaN(hour) || m === undefined) return String(value);
  const suffix = hour < 12 ? "ص" : "م";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m} ${suffix}`;
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export { csvCell, downloadTextFile, fmtDate, fmtDateTime, fmtSubmittedAt, fmtTime12, money, normalizeArabicName };

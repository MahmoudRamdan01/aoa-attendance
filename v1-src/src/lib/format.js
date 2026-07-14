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

export { csvCell, downloadTextFile, fmtDate, fmtDateTime, money, normalizeArabicName };

const CAIRO_TIME_ZONE = "Africa/Cairo";

function timeToSeconds(value) {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(value || ""));
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function secondsInTimeZone(date = new Date(), timeZone = CAIRO_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hours = Number(parts.find((part) => part.type === "hour")?.value);
  const minutes = Number(parts.find((part) => part.type === "minute")?.value);
  const seconds = Number(parts.find((part) => part.type === "second")?.value);
  return hours * 3600 + minutes * 60 + seconds + date.getMilliseconds() / 1000;
}

function checkoutWindowState({ checkoutFrom, checkoutTo, now = new Date() }) {
  const from = timeToSeconds(checkoutFrom);
  const to = timeToSeconds(checkoutTo);
  // Attendance rows are keyed by Cairo calendar date, so overnight checkout
  // windows are intentionally invalid until cross-date shifts are supported.
  if (from === null || to === null || from > to) {
    return { configured: false, open: false, beforeOpen: false, afterClose: false };
  }

  const current = secondsInTimeZone(now);
  const open = current >= from && current <= to;
  return {
    configured: true,
    open,
    beforeOpen: current < from,
    afterClose: current > to,
  };
}

export { CAIRO_TIME_ZONE, checkoutWindowState, secondsInTimeZone, timeToSeconds };

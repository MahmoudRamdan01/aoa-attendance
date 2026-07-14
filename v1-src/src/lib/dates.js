import { COMPANY_LOCATION, todayIso } from "./supabase";

function addDays(date, days) {
  // Parse and compute in UTC. Parsing "${date}T00:00:00" as *local* time and then
  // reading it back via toISOString() (UTC) makes positive-offset timezones (e.g.
  // Africa/Cairo, UTC+2/+3) land on the same day — which made datesBetween() loop
  // forever and froze the Owner dashboard. UTC-only math avoids that entirely.
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function dateRangeForPeriod(period, anchor = todayIso()) {
  const day = new Date(`${anchor}T00:00:00Z`);
  if (period === "day") return { from: anchor, to: anchor, label: "اليوم" };
  if (period === "week") {
    const start = new Date(day);
    const dayIndex = start.getUTCDay();
    const diffToSaturday = (dayIndex + 1) % 7;
    start.setUTCDate(start.getUTCDate() - diffToSaturday);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
      label: "الأسبوع",
    };
  }
  return { from: `${anchor.slice(0, 7)}-01`, to: anchor, label: "الشهر" };
}

function datesBetween(from, to) {
  const dates = [];
  let cursor = from;
  // Safety cap (defense-in-depth): never iterate more than ~2 years of days.
  while (cursor <= to && dates.length < 800) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function getCompanyLocation(context) {
  const loc = context?.location;
  if (!loc?.lat || !loc?.lng) return COMPANY_LOCATION;
  return {
    label: loc.label || COMPANY_LOCATION.label,
    lat: Number(loc.lat),
    lng: Number(loc.lng),
    radiusMeters: Number(loc.radius_m || loc.radiusMeters || COMPANY_LOCATION.radiusMeters),
  };
}

function monthRangeFor(month) {
  const [year, mon] = month.split("-").map(Number);
  return { from: `${month}-01`, to: new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10) };
}

export { addDays, dateRangeForPeriod, datesBetween, getCompanyLocation, monthRangeFor };

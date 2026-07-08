import { COMPANY_LOCATION, todayIso, type CompanyLocation } from "@/lib/supabase"
import type { MyContext, QueuedAction } from "@/types/attendance"

// Keep the v1 storage keys so punches queued in v1 still sync from v2
// and the device identity survives the migration.
const QUEUE_KEY = "aoa:v1:offlineAttendanceQueue"
const DEVICE_KEY = "aoa:v1:deviceId"

export const roleNames: Record<string, string> = {
  employee: "موظف",
  hr: "HR",
  owner: "Owner",
}

export const statusLabels: Record<string, string> = {
  present: "حاضر",
  late: "متأخر",
  absent: "غياب",
  leave: "أجازة",
  mission: "مأمورية",
  sick: "مرضي",
  pending: "معلّق",
  approved: "مربوط",
  rejected: "مرفوض",
}

export const notificationCategoryLabels: Record<string, string> = {
  admin_message: "رسالة إدارية",
  approval: "موافقة مطلوبة",
  qr: "QR يومي",
  system: "النظام",
}

export const roleOptions = [
  { value: "employee", label: "موظف" },
  { value: "hr", label: "HR" },
  { value: "owner", label: "Owner" },
]

export function nameInitials(name: unknown) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "AO"
  return parts.slice(0, 2).map((part) => part[0]).join("")
}

export function addDays(date: string, days: number) {
  // Parse and compute in UTC. Parsing "${date}T00:00:00" as *local* time and then
  // reading it back via toISOString() (UTC) makes positive-offset timezones (e.g.
  // Africa/Cairo, UTC+2/+3) land on the same day — which made datesBetween() loop
  // forever and froze the Owner dashboard. UTC-only math avoids that entirely.
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

export function dateRangeForPeriod(period: "day" | "week" | "month", anchor = todayIso()) {
  const day = new Date(`${anchor}T00:00:00Z`)
  if (period === "day") return { from: anchor, to: anchor, label: "اليوم" }
  if (period === "week") {
    const start = new Date(day)
    const dayIndex = start.getUTCDay()
    const diffToSaturday = (dayIndex + 1) % 7
    start.setUTCDate(start.getUTCDate() - diffToSaturday)
    const end = new Date(start)
    end.setUTCDate(start.getUTCDate() + 6)
    return {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
      label: "الأسبوع",
    }
  }
  return { from: `${anchor.slice(0, 7)}-01`, to: anchor, label: "الشهر" }
}

export function datesBetween(from: string, to: string) {
  const dates: string[] = []
  let cursor = from
  // Safety cap (defense-in-depth): never iterate more than ~2 years of days.
  while (cursor <= to && dates.length < 800) {
    dates.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return dates
}

export function getCompanyLocation(context: MyContext | null): CompanyLocation {
  const loc = context?.location
  if (!loc?.lat || !loc?.lng) return COMPANY_LOCATION
  return {
    label: loc.label || COMPANY_LOCATION.label,
    lat: Number(loc.lat),
    lng: Number(loc.lng),
    radiusMeters: Number(loc.radius_m || loc.radiusMeters || COMPANY_LOCATION.radiusMeters),
  }
}

export function cls(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ")
}

export function getQueuedActions(): QueuedAction[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]")
  } catch {
    return []
  }
}

export function setQueuedActions(items: QueuedAction[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items))
}

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

export function getLocation(): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("المتصفح لا يدعم تحديد الموقع."))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 0),
        }),
      () => reject(new Error("لازم تسمح للموقع عشان التسجيل من الشركة.")),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 20000 }
    )
  })
}

export function money(value: unknown) {
  return Math.round(Number(value || 0)).toLocaleString("en-US")
}

export function fmtDate(date: Date) {
  return new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date)
}

export function fmtDateTime(value: string | null | undefined) {
  if (!value) return "-"
  return new Date(value).toLocaleString("ar-EG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function fmtTime(value: string | null | undefined) {
  if (!value) return "—"
  return new Date(value).toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function weekdayName(date: string) {
  return new Intl.DateTimeFormat("ar-EG", { weekday: "long" }).format(
    new Date(`${date}T00:00:00`)
  )
}

export function normalizeQr(value: string) {
  return value.trim().toUpperCase()
}

export function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function csvCell(value: unknown) {
  const text = String(value ?? "")
  return `"${text.replaceAll('"', '""')}"`
}

import { useEffect, useMemo, useState } from "react"
import {
  CheckCircle2,
  Clock3,
  LogOut,
  MapPin,
  MessageSquare,
  QrCode,
  WifiOff,
} from "lucide-react"
import { toast } from "sonner"
import { distanceMeters, supabase, todayIso } from "@/lib/supabase"
import {
  getCompanyLocation,
  getDeviceId,
  getLocation,
  getQueuedActions,
  normalizeQr,
  setQueuedActions,
  statusLabels,
} from "@/lib/attendance"
import { useAuthContext } from "@/providers/AuthProvider"
import type { AttendanceRow, RpcResult } from "@/types/attendance"
import Panel from "@/components/attendance/Panel"
import { btnPrimary, btnSecondary, btnWarning, inputCls, labelCls } from "@/components/attendance/styles"
import { cn } from "@/lib/utils"

function StatusDot({ done, label, value }: { done: boolean; label: string; value: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-4 flex-1",
        done ? "border-[var(--c-green-bg)] bg-[var(--c-green-bg2)]" : "border-[var(--c-line-soft)] bg-[var(--c-panel-soft)]"
      )}
    >
      <span
        className={cn(
          "w-3 h-3 rounded-full flex-shrink-0",
          done ? "bg-[var(--c-green)] shadow-[0_0_0_4px_var(--c-green-bg)]" : "bg-[var(--c-faint2)]"
        )}
      />
      <div className="min-w-0">
        <small className="block text-xs text-[var(--c-muted)]">{label}</small>
        <strong className="block text-lg font-bold text-[var(--c-ink)] font-mono" dir="ltr">
          {value}
        </strong>
      </div>
    </div>
  )
}

export default function TodayPage() {
  const { context } = useAuthContext()
  const [qr, setQr] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState("")
  const [locationState, setLocationState] = useState<{
    lat: number
    lng: number
    accuracy: number
    distance: number
  } | null>(null)
  const [todayRecord, setTodayRecord] = useState<AttendanceRow | null>(null)
  const [queued, setQueued] = useState(getQueuedActions().length)

  const employee = context?.employee
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const companyLocation = useMemo(() => getCompanyLocation(context), [context?.location])

  useEffect(() => {
    loadToday()
    setQueued(getQueuedActions().length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.id])

  async function loadToday() {
    if (!employee?.id) return
    const { data } = await supabase
      .from("attendance")
      .select("*")
      .eq("employee_id", employee.id)
      .eq("work_date", todayIso())
      .maybeSingle()
    setTodayRecord((data as AttendanceRow) || null)
  }

  async function submitAttendance(
    kind: "in" | "out",
    loc: { lat: number; lng: number; accuracy: number },
    qrValue: string,
    deviceId = getDeviceId(),
    noteValue = ""
  ): Promise<RpcResult> {
    const cleanQr = normalizeQr(qrValue)
    const cleanNote = (noteValue || "").trim()
    const distance = distanceMeters(loc, companyLocation)
    setLocationState({ ...loc, distance })
    if (distance > companyLocation.radiusMeters) {
      return {
        error: "outside",
        message: `أنت خارج نطاق الشركة (${Math.round(distance)} متر).`,
      }
    }

    const { data, error } = await supabase.rpc("employee_attendance_action_v1", {
      p_kind: kind,
      p_lat: loc.lat,
      p_lng: loc.lng,
      p_accuracy: loc.accuracy,
      p_qr_code: cleanQr,
      p_device_id: deviceId,
      p_note: cleanNote || null,
    })
    if (error) throw error
    return data as RpcResult
  }

  async function attendance(kind: "in" | "out") {
    if (!normalizeQr(qr)) {
      toast.warning("اكتب كود QR قبل تحديد الموقع.")
      return
    }
    setBusy(kind)
    let loc: { lat: number; lng: number; accuracy: number } | null = null
    try {
      loc = await getLocation()
      const data = await submitAttendance(kind, loc, qr, getDeviceId(), note)
      if (data?.error) {
        toast.error(data.message || "تعذر التسجيل.")
      } else {
        toast.success(data.label || (kind === "in" ? "تم تسجيل الحضور." : "تم تسجيل الانصراف."))
        setNote("")
        loadToday()
      }
    } catch (error) {
      if (!loc) {
        toast.error(error instanceof Error ? error.message : "تعذر تحديد الموقع.")
      } else {
        const nextQueue = [
          ...getQueuedActions(),
          {
            id: crypto.randomUUID(),
            kind,
            qr,
            note,
            location: loc,
            deviceId: getDeviceId(),
            at: new Date().toISOString(),
          },
        ]
        setQueuedActions(nextQueue)
        setQueued(nextQueue.length)
        toast.info("تم حفظ العملية Offline لحين عودة الاتصال.")
      }
    }
    setBusy("")
  }

  async function syncQueue() {
    const items = getQueuedActions()
    if (!items.length) return
    setBusy("sync")
    const remaining: typeof items = []
    for (const item of items) {
      try {
        const loc = item.location || (await getLocation())
        const data = await submitAttendance(item.kind, loc, item.qr || qr, item.deviceId, item.note || "")
        if (data?.error) remaining.push(item)
      } catch {
        remaining.push(item)
      }
    }
    setQueuedActions(remaining)
    setQueued(remaining.length)
    loadToday()
    toast(
      remaining.length
        ? `تمت مزامنة ${items.length - remaining.length} وباقي ${remaining.length}.`
        : "تمت مزامنة كل العمليات المحفوظة."
    )
    setBusy("")
  }

  const todayNote = todayRecord
    ? [
        statusLabels[todayRecord.status] || todayRecord.status,
        Number(todayRecord.late_minutes || 0) > 0 ? `${todayRecord.late_minutes} دقيقة تأخير` : "",
        Number(todayRecord.deduction_days || 0) > 0 ? `خصم ${todayRecord.deduction_days} يوم` : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : ""

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel icon={Clock3} title="تسجيل اليوم" subtitle={todayIso()}>
        <div className="flex gap-3 mb-5 flex-col sm:flex-row">
          <StatusDot
            done={!!todayRecord?.check_in}
            label="حضور"
            value={todayRecord?.check_in?.slice(0, 5) || "لم يسجل"}
          />
          <StatusDot
            done={!!todayRecord?.check_out}
            label="انصراف"
            value={todayRecord?.check_out?.slice(0, 5) || "لم يسجل"}
          />
        </div>

        <div className="space-y-4">
          <label className={labelCls}>
            كود QR اليومي
            <input
              dir="ltr"
              className={inputCls + " font-mono tracking-widest"}
              value={qr}
              onChange={(e) => setQr(e.target.value.toUpperCase())}
              placeholder="اكتب أو امسح كود اليوم"
              autoCapitalize="characters"
              autoComplete="one-time-code"
            />
          </label>
          <label className={labelCls}>
            ملاحظة (اختياري)
            <input
              className={inputCls}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="اكتب ملاحظة تظهر للإدارة (مثال: اتأخرت بسبب الزحمة)"
              maxLength={280}
            />
          </label>
        </div>

        {todayRecord?.employee_note && (
          <p className="flex items-center gap-1.5 text-sm text-[var(--c-muted)] mt-3">
            <MessageSquare className="w-4 h-4 flex-shrink-0" /> ملاحظتك المسجلة: {todayRecord.employee_note}
          </p>
        )}

        <div className="flex items-center gap-3 mt-5 flex-wrap">
          <button
            className={btnPrimary}
            disabled={!!busy || !!todayRecord?.check_in}
            onClick={() => attendance("in")}
          >
            <CheckCircle2 className="w-4 h-4" /> {busy === "in" ? "جاري..." : "تسجيل حضور"}
          </button>
          <button
            className={btnSecondary + " h-10"}
            disabled={!!busy || !todayRecord?.check_in || !!todayRecord?.check_out}
            onClick={() => attendance("out")}
          >
            <LogOut className="w-4 h-4" /> {busy === "out" ? "جاري..." : "تسجيل انصراف"}
          </button>
        </div>

        {locationState && (
          <p className="flex items-center gap-1.5 text-sm text-[var(--c-muted)] mt-3">
            <MapPin className="w-4 h-4 flex-shrink-0" /> المسافة عن الشركة: {Math.round(locationState.distance)} متر
            · دقة GPS {locationState.accuracy} متر
          </p>
        )}
        {todayNote && <p className="text-sm text-[var(--c-muted)] mt-2">{todayNote}</p>}

        {queued > 0 && (
          <button className={btnWarning + " mt-4"} onClick={syncQueue} disabled={busy === "sync"}>
            <WifiOff className="w-4 h-4" /> مزامنة {queued} عملية محفوظة Offline
          </button>
        )}
      </Panel>

      <Panel icon={QrCode} title="قواعد التسجيل">
        <ul className="space-y-3">
          {[
            "التسجيل مرة حضور ومرة انصراف يوميًا.",
            `لازم تكون داخل ${companyLocation.radiusMeters} متر من موقع الشركة.`,
            "كود QR يتغير يوميًا ويظهر عند HR/Owner.",
            "لو النت قطع، العملية تتحفظ وتتزامن عند رجوعه.",
          ].map((rule) => (
            <li key={rule} className="flex items-start gap-2 text-sm text-[var(--c-ink)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FCC10E] mt-2 flex-shrink-0" />
              {rule}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}

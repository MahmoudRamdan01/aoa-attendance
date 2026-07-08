import { useEffect, useState } from "react"
import { CalendarDays } from "lucide-react"
import { toast } from "sonner"
import { supabase, todayIso } from "@/lib/supabase"
import { addDays, fmtDateTime } from "@/lib/attendance"
import { useAuthContext } from "@/providers/AuthProvider"
import type { EmployeeRow, RpcResult } from "@/types/attendance"
import Panel from "@/components/attendance/Panel"
import StatusBadge from "@/components/attendance/StatusBadge"
import { btnPrimary, inputCls, labelCls, mutedText, selectCls } from "@/components/attendance/styles"
import { cn } from "@/lib/utils"

interface RequestListItem {
  type: string
  date: string
  sortDate: string
  status: string
  meta: string
  reason?: string | null
  decision?: string | null
  decidedAt?: string | null
}

function PermissionForm({ onDone }: { onDone: () => void }) {
  const [date, setDate] = useState(todayIso())
  const [hours, setHours] = useState(1)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    const { data, error } = await supabase.rpc("request_permission_v1", {
      p_date: date,
      p_hours_requested: hours,
      p_reason: reason,
    })
    setBusy(false)
    const result = data as RpcResult | null
    if (error || result?.error) toast.error(result?.message || "تعذر إرسال طلب الإذن.")
    else {
      setReason("")
      toast.success("تم إرسال طلب الإذن.")
      onDone()
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <h2 className="text-base font-semibold text-[var(--c-ink)]">طلب إذن</h2>
      <label className={labelCls}>
        اليوم
        <input
          type="date"
          className={inputCls}
          value={date}
          min={todayIso()}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <label className={labelCls}>
        المدة المطلوبة
        <select className={selectCls} value={hours} onChange={(e) => setHours(Number(e.target.value))}>
          <option value={1}>ساعة</option>
          <option value={2}>ساعتين</option>
        </select>
      </label>
      <label className={labelCls}>
        السبب
        <input
          className={inputCls}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          placeholder="اكتب السبب بوضوح"
        />
      </label>
      <button className={btnPrimary + " w-full"} disabled={busy}>
        {busy ? "جار الإرسال..." : "إرسال الطلب"}
      </button>
      <p className={mutedText}>الحد: 3 أذونات شهريًا، وغير مسموح بأيام متتالية.</p>
    </form>
  )
}

function LeaveForm({ onDone }: { onDone: () => void }) {
  const { context } = useAuthContext()
  const minLeaveDate = addDays(todayIso(), 1)
  const [from, setFrom] = useState(minLeaveDate)
  const [to, setTo] = useState(minLeaveDate)
  const [cover, setCover] = useState("")
  const [reason, setReason] = useState("")
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase
      .from("kiosk_employees")
      .select("id,name,active")
      .eq("active", true)
      .order("id")
      .then(({ data }) => {
        setEmployees(((data as EmployeeRow[]) || []).filter((emp) => emp.id !== context?.employee?.id))
      })
  }, [context?.employee?.id])

  function updateFrom(value: string) {
    setFrom(value)
    if (to < value) setTo(value)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    const { data, error } = await supabase.rpc("request_leave_v1", {
      p_from: from,
      p_to: to,
      p_cover: Number(cover),
      p_reason: reason,
    })
    setBusy(false)
    const result = data as RpcResult | null
    if (error || result?.error) toast.error(result?.message || "تعذر إرسال طلب الأجازة.")
    else {
      setReason("")
      toast.success("تم إرسال طلب الأجازة.")
      onDone()
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <h2 className="text-base font-semibold text-[var(--c-ink)]">طلب أجازة</h2>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          من
          <input
            type="date"
            className={inputCls}
            value={from}
            min={minLeaveDate}
            onChange={(e) => updateFrom(e.target.value)}
          />
        </label>
        <label className={labelCls}>
          إلى
          <input
            type="date"
            className={inputCls}
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <label className={labelCls}>
        الموظف البديل
        <select className={selectCls} value={cover} onChange={(e) => setCover(e.target.value)} required>
          <option value="">اختار Cover</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelCls}>
        السبب
        <input
          className={inputCls}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          placeholder="سبب الأجازة"
        />
      </label>
      <button className={btnPrimary + " w-full"} disabled={busy}>
        {busy ? "جار الإرسال..." : "إرسال الطلب"}
      </button>
      <p className={mutedText}>الحد: يومين شهريًا، غير متتاليين، وتخصم من الرصيد السنوي.</p>
    </form>
  )
}

function MyRequests({ refreshKey }: { refreshKey: number }) {
  const { context } = useAuthContext()
  const [rows, setRows] = useState<RequestListItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!context?.employee?.id) return
    setLoading(true)
    Promise.all([
      supabase
        .from("permissions")
        .select("id,perm_date,hours,hours_requested,hours_approved,reason,status,decision_note,decided_at")
        .eq("employee_id", context.employee.id)
        .order("perm_date", { ascending: false })
        .limit(10),
      supabase
        .from("leave_requests")
        .select("id,from_date,to_date,days,reason,status,decision_note,decided_at")
        .eq("employee_id", context.employee.id)
        .order("from_date", { ascending: false })
        .limit(10),
    ]).then(([p, l]) => {
      const nextRows: RequestListItem[] = [
        ...((p.data as Array<Record<string, unknown>>) || []).map((item) => ({
          type: "إذن",
          date: String(item.perm_date),
          sortDate: String(item.perm_date),
          status: String(item.status),
          meta: `${item.hours_requested || item.hours} ساعة مطلوبة${
            item.hours_approved ? ` · المعتمد ${item.hours_approved} ساعة` : ""
          }`,
          reason: item.reason as string | null,
          decision: item.decision_note as string | null,
          decidedAt: item.decided_at as string | null,
        })),
        ...((l.data as Array<Record<string, unknown>>) || []).map((item) => ({
          type: "أجازة",
          date: `${item.from_date} → ${item.to_date}`,
          sortDate: String(item.from_date),
          status: String(item.status),
          meta: `${item.days} يوم`,
          reason: item.reason as string | null,
          decision: item.decision_note as string | null,
          decidedAt: item.decided_at as string | null,
        })),
      ].sort((a, b) => b.sortDate.localeCompare(a.sortDate))
      setRows(nextRows)
      setLoading(false)
    })
  }, [context?.employee?.id, refreshKey])

  return (
    <Panel icon={CalendarDays} title="طلباتي">
      <div className="space-y-3">
        {loading && <p className={mutedText}>جاري تحميل الطلبات...</p>}
        {!loading && rows.length === 0 && <p className={mutedText}>لا توجد طلبات بعد.</p>}
        {rows.map((row, index) => (
          <div
            className="rounded-xl border border-[var(--c-line-soft)] bg-[var(--c-panel-soft)] p-4 space-y-1.5"
            key={`${row.type}-${row.date}-${index}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <strong className="text-sm font-semibold text-[var(--c-ink)]">{row.type}</strong>
                <span className="text-xs text-[var(--c-muted)]" dir="ltr">
                  {row.date}
                </span>
              </div>
              <StatusBadge status={row.status} />
            </div>
            <p className="text-sm text-[var(--c-ink)]">{row.meta}</p>
            {row.reason && <p className="text-sm text-[var(--c-muted)]">السبب: {row.reason}</p>}
            {row.decision && (
              <p className="text-sm text-[var(--c-muted)]">
                قرار الإدارة: {row.decision}
                {row.decidedAt ? ` · ${fmtDateTime(row.decidedAt)}` : ""}
              </p>
            )}
          </div>
        ))}
      </div>
    </Panel>
  )
}

export default function RequestsPage() {
  const [kind, setKind] = useState<"permission" | "leave">("permission")
  const [refreshKey, setRefreshKey] = useState(0)
  const refreshRequests = () => setRefreshKey((key) => key + 1)

  const tabCls = (active: boolean) =>
    cn(
      "h-9 px-4 rounded-full text-sm font-medium transition-colors",
      active ? "bg-[#FCC10E] text-[#383737]" : "text-[var(--c-muted)] hover:bg-[var(--c-page)]"
    )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      <Panel>
        <div className="flex items-center gap-2 mb-5 bg-[var(--c-panel-soft)] rounded-full p-1 w-fit">
          <button className={tabCls(kind === "permission")} onClick={() => setKind("permission")}>
            إذن
          </button>
          <button className={tabCls(kind === "leave")} onClick={() => setKind("leave")}>
            أجازة
          </button>
        </div>
        {kind === "permission" ? (
          <PermissionForm onDone={refreshRequests} />
        ) : (
          <LeaveForm onDone={refreshRequests} />
        )}
      </Panel>
      <MyRequests refreshKey={refreshKey} />
    </div>
  )
}

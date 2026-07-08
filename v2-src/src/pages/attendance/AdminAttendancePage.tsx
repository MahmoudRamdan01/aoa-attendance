import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  FileSpreadsheet,
  PieChart as PieChartIcon,
  QrCode,
  RefreshCcw,
  Search,
  Users,
  UserCheck,
  UserX,
} from "lucide-react"
import { toast } from "sonner"
import { supabase, todayIso } from "@/lib/supabase"
import { addDays, csvCell, datesBetween, downloadTextFile, nameInitials, statusLabels } from "@/lib/attendance"
import { useAuthContext } from "@/providers/AuthProvider"
import type { AttendanceRow, EmployeeRow, LeaveRow, PermissionRow, RpcResult } from "@/types/attendance"
import Panel from "@/components/attendance/Panel"
import KpiTile from "@/components/attendance/KpiTile"
import StatusBadge from "@/components/attendance/StatusBadge"
import StatusDonut from "@/components/attendance/StatusDonut"
import AdminNoteCell from "@/components/attendance/AdminNoteCell"
import Approvals from "@/components/attendance/Approvals"
import QrDisplay from "@/components/attendance/QrDisplay"
import {
  btnPrimary,
  btnSecondary,
  dangerLink,
  inputCls,
  labelCls,
  mutedText,
  selectCls,
  tdCls,
  thCls,
  trCls,
} from "@/components/attendance/styles"

export default function AdminAttendancePage() {
  const { context, role } = useAuthContext()
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [attendance, setAttendance] = useState<AttendanceRow[]>([])
  const [permissions, setPermissions] = useState<PermissionRow[]>([])
  const [leaves, setLeaves] = useState<LeaveRow[]>([])
  const [reportDate, setReportDate] = useState(todayIso())
  const [holiday, setHoliday] = useState({ date: todayIso(), to: todayIso(), label: "" })
  const [qr, setQr] = useState({ today: "", tomorrow: "" })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [employeeQuery, setEmployeeQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  useEffect(() => {
    loadAdmin()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportDate])

  async function loadAdmin() {
    setLoading(true)
    setError("")
    try {
      const [emp, att, perm, leave, qrData, tomorrowQr] = await Promise.all([
        supabase.from("employees").select("id,name,leave_balance,active").order("id"),
        supabase.from("attendance").select("*").eq("work_date", reportDate),
        supabase.from("permissions").select("*, employees(name)").eq("status", "pending").order("perm_date"),
        supabase
          .from("leave_requests")
          .select(
            "*, employees!leave_requests_employee_id_fkey(name), cover:employees!leave_requests_cover_employee_id_fkey(name)"
          )
          .eq("status", "pending")
          .order("from_date"),
        supabase.rpc("get_daily_qr_v1"),
        supabase.rpc("get_qr_for_date_v1", { p_date: addDays(todayIso(), 1) }),
      ])
      const failed = [emp, att, perm, leave, qrData, tomorrowQr].find((item) => item.error)
      if (failed) throw failed.error
      setEmployees((emp.data as EmployeeRow[]) || [])
      setAttendance((att.data as AttendanceRow[]) || [])
      setPermissions((perm.data as PermissionRow[]) || [])
      setLeaves((leave.data as LeaveRow[]) || [])
      setQr({
        today: (qrData.data as RpcResult | null)?.code || "",
        tomorrow: (tomorrowQr.data as RpcResult | null)?.code || "",
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل بيانات الإدارة.")
    }
    setLoading(false)
  }

  async function reset(empId: number) {
    const ok = confirm("تمسح سجل اليوم للموظف ده؟ العملية هتتسجل في Audit Log.")
    if (!ok) return
    const { data, error: rpcError } = await supabase.rpc("reset_attendance_day_v1", {
      p_employee_id: empId,
      p_date: reportDate,
      p_reason: "تصحيح سجل من لوحة v2",
    })
    const result = data as RpcResult | null
    if (rpcError || result?.error) toast.error(result?.message || "Owner فقط يقدر يمسح السجل.")
    else {
      toast.success("تم مسح سجل اليوم.")
      loadAdmin()
    }
  }

  async function decidePermission(id: number, approve: boolean, hoursApproved: number | null) {
    if (context?.role !== "owner") {
      toast.warning("الموافقة على الأذونات Owner فقط.")
      return
    }
    const { data, error: rpcError } = await supabase.rpc("decide_permission_v1", {
      p_id: id,
      p_approve: approve,
      p_hours_approved: hoursApproved,
      p_note: approve ? "تمت الموافقة" : "تم الرفض",
    })
    const result = data as RpcResult | null
    if (rpcError || result?.error) toast.error(result?.message || "تعذر تحديث الإذن.")
    else {
      toast.success("تم تحديث طلب الإذن.")
      loadAdmin()
    }
  }

  async function decideLeave(id: number, approve: boolean) {
    if (context?.role !== "owner") {
      toast.warning("الموافقة على الأجازات Owner فقط.")
      return
    }
    const { data, error: rpcError } = await supabase.rpc("decide_leave_v1", {
      p_id: id,
      p_approve: approve,
      p_note: approve ? "تمت الموافقة" : "تم الرفض",
    })
    const result = data as RpcResult | null
    if (rpcError || result?.error) toast.error(result?.message || "تعذر تحديث الأجازة.")
    else {
      toast.success("تم تحديث طلب الأجازة.")
      loadAdmin()
    }
  }

  async function submitHoliday(event: React.FormEvent) {
    event.preventDefault()
    const from = holiday.date <= holiday.to ? holiday.date : holiday.to
    const to = holiday.date <= holiday.to ? holiday.to : holiday.date
    let failed: string | null = null
    for (const day of datesBetween(from, to)) {
      const { data, error: rpcError } = await supabase.rpc("set_official_holiday_v1", {
        p_date: day,
        p_label: holiday.label || "أجازة رسمية",
      })
      const result = data as RpcResult | null
      if (rpcError || result?.error) {
        failed = result?.message || "تعذر تسجيل الأجازة الرسمية."
        break
      }
    }
    if (failed) toast.error(failed)
    else {
      toast.success("تم تسجيل الأجازة الرسمية.")
      setHoliday({ date: todayIso(), to: todayIso(), label: "" })
    }
  }

  async function markMissingCheckouts() {
    const { data, error: rpcError } = await supabase.rpc("mark_missing_checkouts_v1", {
      p_date: reportDate,
    })
    const result = data as RpcResult | null
    if (rpcError || result?.error) toast.error(result?.message || "تعذر مراجعة الانصراف.")
    else {
      toast.success(`تمت مراجعة ${result?.processed || 0} سجل بدون انصراف.`)
      loadAdmin()
    }
  }

  const recs = useMemo(() => new Map(attendance.map((row) => [row.employee_id, row])), [attendance])
  const adminStats = useMemo(() => {
    const active = employees.filter((emp) => emp.active !== false)
    const checkedIn = active.filter((emp) => recs.get(emp.id)?.check_in).length
    const late = active.filter((emp) => recs.get(emp.id)?.status === "late").length
    const missingCheckout = active.filter((emp) => {
      const rec = recs.get(emp.id)
      return rec?.check_in && !rec?.check_out && ["present", "late"].includes(rec.status)
    }).length
    return {
      active: active.length,
      checkedIn,
      notRegistered: Math.max(0, active.length - checkedIn),
      late,
      missingCheckout,
    }
  }, [employees, recs])

  const filteredEmployees = useMemo(() => {
    const query = employeeQuery.trim().toLowerCase()
    return employees.filter((emp) => {
      const rec = recs.get(emp.id)
      const status = rec?.status || "none"
      const matchesStatus = statusFilter === "all" || statusFilter === status
      const matchesQuery = !query || emp.name.toLowerCase().includes(query)
      return matchesStatus && matchesQuery
    })
  }, [employees, employeeQuery, statusFilter, recs])

  const donutData = useMemo(() => {
    const active = employees.filter((emp) => emp.active !== false)
    const count = (statuses: string[]) =>
      active.filter((emp) => statuses.includes(recs.get(emp.id)?.status || "")).length
    const registered = active.filter((emp) => recs.get(emp.id)).length
    return [
      { name: "حاضر", value: count(["present"]), color: "#22c55e" },
      { name: "متأخر", value: count(["late"]), color: "#f97316" },
      { name: "معلّق", value: count(["pending"]), color: "#FCC10E" },
      { name: "أجازة/مأمورية", value: count(["leave", "mission", "sick"]), color: "#8b5cf6" },
      { name: "غياب", value: count(["absent"]), color: "#ef4444" },
      { name: "لم يسجل", value: Math.max(0, active.length - registered), color: "#94a3b8" },
    ].filter((item) => item.value > 0)
  }, [employees, recs])

  const canApprove = role === "owner"

  function exportDayCsv() {
    const header = ["الموظف", "الحالة", "حضور", "انصراف", "دقائق تأخير", "خصم أيام", "ملاحظة الموظف", "ملاحظة HR"]
    const lines = filteredEmployees.map((emp) => {
      const rec = recs.get(emp.id)
      return [
        emp.name,
        rec ? statusLabels[rec.status] || rec.status : "لم يسجل",
        rec?.check_in || "",
        rec?.check_out || "",
        rec?.late_minutes || 0,
        rec?.deduction_days || 0,
        rec?.employee_note || "",
        rec?.hr_note || "",
      ]
        .map(csvCell)
        .join(",")
    })
    downloadTextFile(
      `attendance-${reportDate}.csv`,
      "﻿" + `${header.map(csvCell).join(",")}\n${lines.join("\n")}`
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border-r-4 border-[var(--c-red)] bg-[var(--c-red-bg2)] px-4 py-3 text-sm text-[var(--c-ink)]">
          <AlertTriangle className="w-4 h-4 text-[var(--c-red)] flex-shrink-0" />
          {error}
        </div>
      )}

      <Panel
        icon={Users}
        title="جدول الحضور"
        actions={
          <>
            <input
              type="date"
              className={inputCls + " w-auto h-9"}
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
            />
            <button className={btnSecondary} onClick={exportDayCsv} disabled={loading}>
              <FileSpreadsheet className="w-4 h-4" /> Excel
            </button>
            <button className={btnSecondary} onClick={markMissingCheckouts}>
              مراجعة الانصراف
            </button>
            <button className={btnSecondary} onClick={loadAdmin}>
              <RefreshCcw className="w-4 h-4" /> تحديث
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
          <KpiTile label="الموظفون" value={adminStats.active} icon={Users} index={0} />
          <KpiTile label="سجلوا حضور" value={adminStats.checkedIn} tone="ok" icon={UserCheck} index={1} />
          <KpiTile label="لم يسجلوا" value={adminStats.notRegistered} tone="danger" icon={UserX} index={2} />
          <KpiTile label="تأخير" value={adminStats.late} tone="warn" icon={Clock3} index={3} />
          <KpiTile label="بدون انصراف" value={adminStats.missingCheckout} tone="gold" icon={AlertTriangle} index={4} />
        </div>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-faint)]" />
            <input
              value={employeeQuery}
              onChange={(e) => setEmployeeQuery(e.target.value)}
              placeholder="بحث باسم الموظف"
              className="w-full h-9 pr-9 pl-4 rounded-full bg-[var(--c-page)] border-0 text-sm text-[var(--c-ink)] placeholder:text-[var(--c-faint)] focus:outline-none focus:ring-2 focus:ring-[#FCC10E]/30"
            />
          </div>
          <select
            className={selectCls + " w-auto h-9"}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">كل الحالات</option>
            <option value="none">لم يسجل</option>
            <option value="present">حاضر</option>
            <option value="late">متأخر</option>
            <option value="pending">معلق</option>
            <option value="leave">أجازة</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--c-line-soft)]">
                <th className={thCls}>الموظف</th>
                <th className={thCls}>الحالة</th>
                <th className={thCls}>حضور</th>
                <th className={thCls}>انصراف</th>
                <th className={thCls}>خصم</th>
                <th className={thCls}>ملاحظات</th>
                <th className={thCls}>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className={tdCls} colSpan={7}>
                    جاري التحميل...
                  </td>
                </tr>
              )}
              {!loading && filteredEmployees.length === 0 && (
                <tr>
                  <td className={tdCls} colSpan={7}>
                    لا توجد نتائج مطابقة.
                  </td>
                </tr>
              )}
              {!loading &&
                filteredEmployees.map((emp) => {
                  const rec = recs.get(emp.id)
                  return (
                    <tr key={emp.id} className={trCls}>
                      <td className={tdCls}>
                        <div className="flex items-center gap-2.5">
                          <span className="w-8 h-8 rounded-full bg-[#FCC10E] flex items-center justify-center text-[#383737] text-xs font-bold flex-shrink-0">
                            {nameInitials(emp.name)}
                          </span>
                          <span className="font-medium">{emp.name}</span>
                        </div>
                      </td>
                      <td className={tdCls}>{rec ? <StatusBadge status={rec.status} /> : "لم يسجل"}</td>
                      <td className={tdCls} dir="ltr">
                        {rec?.check_in?.slice(0, 5) || "-"}
                      </td>
                      <td className={tdCls} dir="ltr">
                        {rec?.check_out?.slice(0, 5) || "-"}
                      </td>
                      <td className={tdCls}>{rec?.deduction_days || 0} يوم</td>
                      <td className={tdCls}>
                        <AdminNoteCell empId={emp.id} rec={rec} reportDate={reportDate} onSaved={loadAdmin} />
                      </td>
                      <td className={tdCls}>
                        {role === "owner" && rec ? (
                          <button className={dangerLink} onClick={() => reset(emp.id)}>
                            تراجع
                          </button>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel icon={QrCode} title="QR اليوم">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <QrDisplay label="اليوم" code={qr.today} date={todayIso()} />
            <QrDisplay label="بكرة" code={qr.tomorrow} date={addDays(todayIso(), 1)} muted />
          </div>
          <p className={mutedText + " mt-3"}>
            الكود بيتولد ويتبعت تلقائيًا للفريق مرة واحدة يوميًا. اللوحة هنا للعرض والطباعة فقط.
          </p>
        </Panel>
        <Panel icon={PieChartIcon} title="توزيع حالات اليوم">
          {donutData.length > 0 ? (
            <StatusDonut data={donutData} />
          ) : (
            <p className={mutedText}>لا توجد بيانات لليوم بعد.</p>
          )}
        </Panel>
      </div>

      <Panel icon={CalendarDays} title="أجازة رسمية">
        <form className="space-y-4" onSubmit={submitHoliday}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className={labelCls}>
              من
              <input
                type="date"
                className={inputCls}
                value={holiday.date}
                onChange={(e) => setHoliday((h) => ({ ...h, date: e.target.value }))}
              />
            </label>
            <label className={labelCls}>
              إلى
              <input
                type="date"
                className={inputCls}
                value={holiday.to}
                onChange={(e) => setHoliday((h) => ({ ...h, to: e.target.value }))}
              />
            </label>
          </div>
          <label className={labelCls}>
            السبب
            <input
              className={inputCls}
              value={holiday.label}
              onChange={(e) => setHoliday((h) => ({ ...h, label: e.target.value }))}
              placeholder="مثال: عيد رسمي"
            />
          </label>
          <button className={btnPrimary}>تسجيل أجازة رسمية</button>
        </form>
      </Panel>

      <Approvals
        title="أذونات معلقة"
        rows={permissions}
        type="permission"
        canApprove={canApprove}
        onPermission={decidePermission}
      />
      <Approvals title="أجازات معلقة" rows={leaves} type="leave" canApprove={canApprove} onLeave={decideLeave} />
    </div>
  )
}

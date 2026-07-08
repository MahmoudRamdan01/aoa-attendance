import { useEffect, useMemo, useState } from "react"
import {
  Banknote,
  CalendarDays,
  Clock3,
  FileSpreadsheet,
  History,
  UserCheck,
  UserX,
} from "lucide-react"
import { toast } from "sonner"
import { supabase, todayIso } from "@/lib/supabase"
import { csvCell, downloadTextFile, statusLabels, weekdayName } from "@/lib/attendance"
import { useAuthContext } from "@/providers/AuthProvider"
import type { AttendanceRow } from "@/types/attendance"
import Panel from "@/components/attendance/Panel"
import KpiTile from "@/components/attendance/KpiTile"
import StatusBadge from "@/components/attendance/StatusBadge"
import { btnSecondary, inputCls, tdCls, thCls, trCls } from "@/components/attendance/styles"

function Sparkline({ data, width = 120, height = 28 }: { data: number[]; width?: number; height?: number }) {
  if (!data.length) return null
  const max = Math.max(...data, 1)
  const points = data
    .map((value, index) => {
      const x = data.length > 1 ? (index / (data.length - 1)) * width : width / 2
      const y = height - (value / max) * (height - 4) - 2
      return `${x},${y}`
    })
    .join(" ")
  return (
    <svg width={width} height={height} style={{ direction: "ltr", flex: "0 0 auto" }}>
      <polyline fill="none" stroke="#f97316" strokeWidth="2" points={points} />
    </svg>
  )
}

export default function MyMonthPage() {
  const { context } = useAuthContext()
  const employee = context?.employee
  const [month, setMonth] = useState(() => todayIso().slice(0, 7))
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [loading, setLoading] = useState(true)

  const range = useMemo(() => {
    const [year, mon] = month.split("-").map(Number)
    return {
      from: `${month}-01`,
      to: new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10),
    }
  }, [month])

  useEffect(() => {
    if (!employee?.id) return
    setLoading(true)
    supabase
      .from("attendance")
      .select("*")
      .eq("employee_id", employee.id)
      .gte("work_date", range.from)
      .lte("work_date", range.to)
      .order("work_date")
      .then(({ data, error }) => {
        if (error) toast.error("تعذر تحميل سجل الشهر.")
        setRows((data as AttendanceRow[]) || [])
        setLoading(false)
      })
  }, [employee?.id, range.from, range.to])

  const summary = useMemo(() => {
    const present = rows.filter((row) => row.check_in).length
    const lateRows = rows.filter((row) => row.status === "late")
    const absent = rows.filter((row) => row.status === "absent").length
    const leave = rows.filter((row) => ["leave", "mission", "sick"].includes(row.status)).length
    const lateMinutes = lateRows.reduce((sum, row) => sum + Number(row.late_minutes || 0), 0)
    const deductions = rows.reduce(
      (sum, row) => sum + Number(row.deduction_days || 0) + (row.status === "absent" ? 1 : 0),
      0
    )
    return { present, lateCount: lateRows.length, lateMinutes, absent, leave, deductions }
  }, [rows])

  const spark = useMemo(() => rows.map((row) => Number(row.late_minutes || 0)), [rows])

  function exportMonthCsv() {
    const header = ["التاريخ", "اليوم", "الحالة", "حضور", "انصراف", "دقائق تأخير", "خصم أيام", "ملاحظتي"]
    const lines = rows.map((row) =>
      [
        row.work_date,
        weekdayName(row.work_date),
        statusLabels[row.status] || row.status,
        row.check_in || "",
        row.check_out || "",
        row.late_minutes || 0,
        row.deduction_days || 0,
        row.employee_note || "",
      ]
        .map(csvCell)
        .join(",")
    )
    downloadTextFile(
      `my-month-${month}.csv`,
      "﻿" + `${header.map(csvCell).join(",")}\n${lines.join("\n")}`
    )
  }

  return (
    <div className="space-y-6">
      <Panel
        icon={History}
        title="سجلي الشهري"
        actions={
          <>
            <input
              type="month"
              className={inputCls + " w-auto h-9"}
              value={month}
              max={todayIso().slice(0, 7)}
              onChange={(e) => setMonth(e.target.value)}
            />
            <button className={btnSecondary} onClick={exportMonthCsv} disabled={loading || rows.length === 0}>
              <FileSpreadsheet className="w-4 h-4" /> Excel
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiTile label="أيام حضور" value={summary.present} tone="ok" icon={UserCheck} index={0} />
          <KpiTile
            label="تأخير"
            value={summary.lateCount}
            sub={`${summary.lateMinutes} دقيقة إجمالًا`}
            tone="warn"
            icon={Clock3}
            index={1}
          />
          <KpiTile label="غياب" value={summary.absent} tone="danger" icon={UserX} index={2} />
          <KpiTile label="أجازة/مأمورية" value={summary.leave} tone="info" icon={CalendarDays} index={3} />
          <KpiTile label="خصومات" value={summary.deductions.toFixed(2)} sub="يوم" tone="gold" icon={Banknote} index={4} />
        </div>
        {employee?.leave_balance != null && (
          <p className="text-sm text-[var(--c-muted)] mt-4">رصيد أجازاتك المتبقي: {employee.leave_balance} يوم</p>
        )}
        {spark.some((value) => value > 0) && (
          <p className="flex items-center gap-2 text-sm text-[var(--c-muted)] mt-2">
            اتجاه دقائق التأخير خلال الشهر: <Sparkline data={spark} />
          </p>
        )}
      </Panel>

      <Panel icon={CalendarDays} title="تفاصيل الأيام">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--c-line-soft)]">
                <th className={thCls}>التاريخ</th>
                <th className={thCls}>اليوم</th>
                <th className={thCls}>الحالة</th>
                <th className={thCls}>حضور</th>
                <th className={thCls}>انصراف</th>
                <th className={thCls}>تأخير</th>
                <th className={thCls}>خصم</th>
                <th className={thCls}>ملاحظتي</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className={tdCls} colSpan={8}>
                    جاري التحميل...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td className={tdCls} colSpan={8}>
                    لا توجد سجلات في الشهر ده.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((row) => (
                  <tr key={row.id || row.work_date} className={trCls}>
                    <td className={tdCls} dir="ltr">
                      {row.work_date}
                    </td>
                    <td className={tdCls}>{weekdayName(row.work_date)}</td>
                    <td className={tdCls}>
                      <StatusBadge status={row.status} />
                    </td>
                    <td className={tdCls} dir="ltr">
                      {row.check_in?.slice(0, 5) || "-"}
                    </td>
                    <td className={tdCls} dir="ltr">
                      {row.check_out?.slice(0, 5) || "-"}
                    </td>
                    <td className={tdCls}>{row.late_minutes || 0} د</td>
                    <td className={tdCls}>{row.deduction_days || 0}</td>
                    <td className={tdCls + " max-w-[220px] truncate"}>{row.employee_note || "-"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}

import { useEffect, useMemo, useState } from "react"
import {
  Activity,
  AlertTriangle,
  Banknote,
  BarChart3,
  CalendarDays,
  Clock3,
  Download,
  FileSpreadsheet,
  TrendingUp,
  Users,
} from "lucide-react"
import {
  Area,
  AreaChart,
  Bar as ReBar,
  BarChart as ReBarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { supabase, todayIso } from "@/lib/supabase"
import {
  csvCell,
  dateRangeForPeriod,
  datesBetween,
  downloadTextFile,
  money,
  nameInitials,
  statusLabels,
} from "@/lib/attendance"
import type { AttendanceRow, EmployeeRow } from "@/types/attendance"
import Panel from "@/components/attendance/Panel"
import KpiTile from "@/components/attendance/KpiTile"
import MeterBar from "@/components/attendance/MeterBar"
import AccountManager from "@/components/attendance/AccountManager"
import { btnSecondary, inputCls, mutedText, tdCls, thCls, trCls } from "@/components/attendance/styles"
import { cn } from "@/lib/utils"

interface HolidayRow {
  holiday_date: string
  label?: string | null
}

export default function OwnerPage() {
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [salaries, setSalaries] = useState<Record<number, number>>({})
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [holidays, setHolidays] = useState<HolidayRow[]>([])
  const [period, setPeriod] = useState<"day" | "week" | "month">("month")
  const [reportDate, setReportDate] = useState(todayIso())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const range = useMemo(() => dateRangeForPeriod(period, reportDate), [period, reportDate])

  useEffect(() => {
    setLoading(true)
    setError("")
    Promise.all([
      supabase.from("attendance").select("*").gte("work_date", range.from).lte("work_date", range.to),
      supabase.from("salaries").select("employee_id,monthly_salary"),
      supabase.from("employees").select("id,name,active").eq("active", true).order("id"),
      supabase
        .from("official_holidays")
        .select("holiday_date,label")
        .gte("holiday_date", range.from)
        .lte("holiday_date", range.to),
    ])
      .then(([att, sal, emp, hol]) => {
        const failed = [att, sal, emp, hol].find((item) => item.error)
        if (failed) throw failed.error
        setRows((att.data as AttendanceRow[]) || [])
        setSalaries(
          Object.fromEntries(
            (((sal.data as Array<{ employee_id: number; monthly_salary: number | null }>) || []).map((s) => [
              s.employee_id,
              Number(s.monthly_salary || 0),
            ]))
          )
        )
        setEmployees((emp.data as EmployeeRow[]) || [])
        setHolidays((hol.data as HolidayRow[]) || [])
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "تعذر تحميل تقارير الـ Owner.")
        setLoading(false)
      })
  }, [range.from, range.to])

  const stats = useMemo(() => {
    const holidaySet = new Set(holidays.map((item) => item.holiday_date))
    const workDates = datesBetween(range.from, range.to).filter((day) => {
      const dow = new Date(`${day}T00:00:00Z`).getUTCDay()
      return dow !== 5 && !holidaySet.has(day)
    })
    const expected = employees.length * workDates.length
    const employeeMap = new Map(employees.map((emp) => [emp.id, emp.name]))
    const total = rows.length
    const checkedIn = rows.filter((r) => r.check_in).length
    const absent = rows.filter((r) => r.status === "absent").length
    const late = rows.filter((r) => r.status === "late").length
    const leave = rows.filter((r) => ["leave", "mission", "sick"].includes(r.status)).length
    const missingCheckout = rows.filter(
      (r) => r.check_in && !r.check_out && ["present", "late"].includes(r.status)
    ).length
    const deductionDays = rows.reduce(
      (sum, r) => sum + Number(r.deduction_days || 0) + (r.status === "absent" ? 1 : 0),
      0
    )
    const deductions = rows.reduce((sum, r) => {
      const days = Number(r.deduction_days || 0) + (r.status === "absent" ? 1 : 0)
      return sum + days * ((salaries[r.employee_id] || 0) / 30)
    }, 0)
    const lateByEmployee = rows.reduce((acc, row) => {
      if (row.status !== "late") return acc
      const current =
        acc.get(row.employee_id) ||
        ({
          employee_id: row.employee_id,
          name: employeeMap.get(row.employee_id) || `#${row.employee_id}`,
          count: 0,
          minutes: 0,
        } as { employee_id: number; name: string; count: number; minutes: number })
      current.count += 1
      current.minutes += Number(row.late_minutes || 0)
      acc.set(row.employee_id, current)
      return acc
    }, new Map<number, { employee_id: number; name: string; count: number; minutes: number }>())
    const rowsByEmployee = rows.reduce((acc, row) => {
      const list = acc.get(row.employee_id) || []
      list.push(row)
      acc.set(row.employee_id, list)
      return acc
    }, new Map<number, AttendanceRow[]>())
    const payrollRows = employees
      .map((emp) => {
        const employeeRows = rowsByEmployee.get(emp.id) || []
        const salary = salaries[emp.id] || 0
        const empDeductionDays = employeeRows.reduce(
          (sum, row) => sum + Number(row.deduction_days || 0) + (row.status === "absent" ? 1 : 0),
          0
        )
        const empDeductionAmount = empDeductionDays * (salary / 30)
        return {
          employee_id: emp.id,
          name: emp.name,
          salary,
          deductionDays: empDeductionDays,
          deductionAmount: empDeductionAmount,
          netSalary: Math.max(0, salary - empDeductionAmount),
          present: employeeRows.filter((row) => row.check_in).length,
          late: employeeRows.filter((row) => row.status === "late").length,
          absent: employeeRows.filter((row) => row.status === "absent").length,
          missingCheckout: employeeRows.filter(
            (row) => row.check_in && !row.check_out && ["present", "late"].includes(row.status)
          ).length,
        }
      })
      .sort((a, b) => b.deductionAmount - a.deductionAmount || a.name.localeCompare(b.name, "ar"))
    return {
      total,
      expected,
      checkedIn,
      absent,
      late,
      leave,
      missingCheckout,
      deductionDays,
      deductions,
      attendanceRate: expected ? Math.round(((checkedIn + leave) / expected) * 100) : 0,
      lateByEmployee: [...lateByEmployee.values()]
        .sort((a, b) => b.count - a.count || b.minutes - a.minutes)
        .slice(0, 5),
      payrollRows,
    }
  }, [rows, salaries, employees, holidays, range.from, range.to])

  // Daily series for the trend chart (skips Fridays; empty workdays render as zeros).
  const dailyData = useMemo(() => {
    const byDate = new Map<string, { present: number; late: number; absent: number }>()
    rows.forEach((row) => {
      const entry = byDate.get(row.work_date) || { present: 0, late: 0, absent: 0 }
      if (row.check_in) entry.present += 1
      if (row.status === "late") entry.late += 1
      if (row.status === "absent") entry.absent += 1
      byDate.set(row.work_date, entry)
    })
    return datesBetween(range.from, range.to)
      .filter((day) => new Date(`${day}T00:00:00Z`).getUTCDay() !== 5)
      .map((day) => ({
        day: `${day.slice(8)}/${day.slice(5, 7)}`,
        ...(byDate.get(day) || { present: 0, late: 0, absent: 0 }),
      }))
  }, [rows, range.from, range.to])

  const employeeBars = useMemo(
    () =>
      [...stats.payrollRows]
        .sort((a, b) => b.present - a.present || a.name.localeCompare(b.name, "ar"))
        .map((row) => ({ name: row.name, حضور: row.present, تأخير: row.late, غياب: row.absent })),
    [stats.payrollRows]
  )

  function exportCsv() {
    const employeeMap = new Map(employees.map((emp) => [emp.id, emp.name]))
    const header = ["التاريخ", "الموظف", "الحالة", "حضور", "انصراف", "تأخير", "خصم أيام"]
    const lines = rows.map((row) =>
      [
        row.work_date,
        employeeMap.get(row.employee_id) || row.employee_id,
        statusLabels[row.status] || row.status,
        row.check_in || "",
        row.check_out || "",
        row.late_minutes || 0,
        row.deduction_days || 0,
      ]
        .map(csvCell)
        .join(",")
    )
    downloadTextFile(
      `aoa-attendance-${range.from}-${range.to}.csv`,
      "﻿" + `${header.map(csvCell).join(",")}\n${lines.join("\n")}`
    )
  }

  function exportPayrollCsv() {
    const header = ["الموظف", "المرتب الشهري", "خصم أيام", "قيمة الخصم", "الصافي التقديري", "تأخير", "غياب", "بدون انصراف"]
    const lines = stats.payrollRows.map((row) =>
      [
        row.name,
        row.salary,
        row.deductionDays.toFixed(2),
        row.deductionAmount.toFixed(2),
        row.netSalary.toFixed(2),
        row.late,
        row.absent,
        row.missingCheckout,
      ]
        .map(csvCell)
        .join(",")
    )
    downloadTextFile(
      `aoa-payroll-${range.from}-${range.to}.csv`,
      "﻿" + `${header.map(csvCell).join(",")}\n${lines.join("\n")}`
    )
  }

  const tabCls = (active: boolean) =>
    cn(
      "h-8 px-3 rounded-full text-xs font-medium transition-colors",
      active ? "bg-[#FCC10E] text-[#383737]" : "text-[var(--c-muted)] hover:bg-[var(--c-page)]"
    )

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border-r-4 border-[var(--c-red)] bg-[var(--c-red-bg2)] px-4 py-3 text-sm text-[var(--c-ink)]">
          <AlertTriangle className="w-4 h-4 text-[var(--c-red)] flex-shrink-0" />
          {error}
        </div>
      )}

      <Panel
        icon={Download}
        title="تقارير وتحليلات"
        subtitle={`الفترة: ${range.from} إلى ${range.to}`}
        actions={
          <>
            <div className="flex items-center gap-1 bg-[var(--c-panel-soft)] rounded-full p-1">
              <button className={tabCls(period === "day")} onClick={() => setPeriod("day")}>
                يومي
              </button>
              <button className={tabCls(period === "week")} onClick={() => setPeriod("week")}>
                أسبوعي
              </button>
              <button className={tabCls(period === "month")} onClick={() => setPeriod("month")}>
                شهري
              </button>
            </div>
            <input
              type="date"
              className={inputCls + " w-auto h-9"}
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
            />
            <button className={btnSecondary} onClick={exportCsv} disabled={loading || rows.length === 0}>
              <FileSpreadsheet className="w-4 h-4" /> Excel
            </button>
            <button className={btnSecondary} onClick={() => window.print()}>
              PDF
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiTile label="معدل التغطية" value={`${stats.attendanceRate}%`} tone="ok" icon={Activity} index={0} />
          <KpiTile label={`سجلات ${range.label}`} value={`${stats.total}/${stats.expected}`} icon={CalendarDays} index={1} />
          <KpiTile label="تأخيرات" value={stats.late} tone="warn" icon={Clock3} index={2} />
          <KpiTile label="بدون انصراف" value={stats.missingCheckout} tone="danger" icon={AlertTriangle} index={3} />
          <KpiTile label="خصم أيام" value={stats.deductionDays.toFixed(2)} tone="warn" icon={TrendingUp} index={4} />
          <KpiTile label="خصومات تقديرية" value={`${money(stats.deductions)} ج`} tone="gold" icon={Banknote} index={5} />
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel icon={TrendingUp} title="اتجاه الحضور اليومي">
          {dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} width={28} />
                <ChartTooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                />
                <Area
                  type="monotone"
                  dataKey="present"
                  name="حضور"
                  stroke="#FCC10E"
                  fill="#FCC10E"
                  fillOpacity={0.2}
                  strokeWidth={2.2}
                />
                <Area
                  type="monotone"
                  dataKey="late"
                  name="تأخير"
                  stroke="#f97316"
                  fill="#f97316"
                  fillOpacity={0.12}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="absent"
                  name="غياب"
                  stroke="#ef4444"
                  fill="#ef4444"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className={mutedText}>لا توجد بيانات في الفترة.</p>
          )}
        </Panel>

        <Panel icon={BarChart3} title="تحليل سريع">
          <MeterBar label="الحضور" value={stats.checkedIn + stats.leave} max={Math.max(stats.expected, 1)} />
          <MeterBar label="التأخير" value={stats.late} max={Math.max(stats.total, 1)} tone="warn" />
          <MeterBar label="غياب مسجل" value={stats.absent} max={Math.max(stats.total, 1)} tone="danger" />
          <MeterBar label="بدون انصراف" value={stats.missingCheckout} max={Math.max(stats.total, 1)} tone="danger" />
        </Panel>
      </div>

      <Panel icon={Users} title={`حضور الموظفين (${range.label})`}>
        {employeeBars.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(180, employeeBars.length * 34 + 40)}>
            <ReBarChart data={employeeBars} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis type="category" dataKey="name" orientation="right" width={92} tick={{ fontSize: 12, fill: "#64748b" }} />
              <ChartTooltip
                contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
              />
              <ReBar dataKey="حضور" fill="#FCC10E" radius={[0, 6, 6, 0]} barSize={12} />
              <ReBar dataKey="تأخير" fill="#f97316" radius={[0, 6, 6, 0]} barSize={12} />
              <ReBar dataKey="غياب" fill="#ef4444" radius={[0, 6, 6, 0]} barSize={12} />
            </ReBarChart>
          </ResponsiveContainer>
        ) : (
          <p className={mutedText}>لا توجد بيانات موظفين في الفترة.</p>
        )}
      </Panel>

      <Panel
        icon={Banknote}
        title="المرتبات والخصومات"
        actions={
          <button className={btnSecondary} onClick={exportPayrollCsv} disabled={loading || stats.payrollRows.length === 0}>
            <FileSpreadsheet className="w-4 h-4" /> Excel مرتبات
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--c-line-soft)]">
                <th className={thCls}>الموظف</th>
                <th className={thCls}>المرتب الشهري</th>
                <th className={thCls}>خصم أيام</th>
                <th className={thCls}>قيمة الخصم</th>
                <th className={thCls}>الصافي التقديري</th>
                <th className={thCls}>مؤشرات</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className={tdCls} colSpan={6}>
                    جاري التحميل...
                  </td>
                </tr>
              )}
              {!loading && stats.payrollRows.length === 0 && (
                <tr>
                  <td className={tdCls} colSpan={6}>
                    لا توجد بيانات مرتبات.
                  </td>
                </tr>
              )}
              {!loading &&
                stats.payrollRows.map((row) => (
                  <tr key={row.employee_id} className={trCls}>
                    <td className={tdCls}>
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-full bg-[#FCC10E] flex items-center justify-center text-[#383737] text-xs font-bold flex-shrink-0">
                          {nameInitials(row.name)}
                        </span>
                        <span className="font-medium">{row.name}</span>
                      </div>
                    </td>
                    <td className={tdCls}>{money(row.salary)} ج</td>
                    <td className={tdCls}>{row.deductionDays.toFixed(2)} يوم</td>
                    <td className={tdCls}>{money(row.deductionAmount)} ج</td>
                    <td className={tdCls}>
                      <strong>{money(row.netSalary)} ج</strong>
                    </td>
                    <td className={tdCls + " text-[var(--c-muted)]"}>
                      {row.late} تأخير · {row.absent} غياب · {row.missingCheckout} بدون انصراف
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel icon={Clock3} title="أعلى التأخيرات">
        <div className="space-y-3">
          {stats.lateByEmployee.length === 0 && <p className={mutedText}>لا توجد تأخيرات في الفترة.</p>}
          {stats.lateByEmployee.map((item) => (
            <div
              className="rounded-xl border border-[var(--c-line-soft)] bg-[var(--c-panel-soft)] p-3.5 flex items-center justify-between"
              key={item.employee_id}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-full bg-[var(--c-orange-bg)] flex items-center justify-center text-[var(--c-orange)] text-xs font-bold flex-shrink-0">
                  {nameInitials(item.name)}
                </span>
                <strong className="text-sm font-semibold text-[var(--c-ink)]">{item.name}</strong>
              </div>
              <span className="text-xs text-[var(--c-muted)]">
                {item.count} مرة · {item.minutes} دقيقة
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <AccountManager />
    </div>
  )
}

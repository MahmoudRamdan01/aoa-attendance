import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { datesBetween } from "@/lib/attendance"
import type { AttendanceRow, EmployeeRow } from "@/types/attendance"

export interface HolidayRow {
  holiday_date: string
  label?: string | null
}

/**
 * The same day queries v1's AdminDashboard makes: active employees + that
 * day's attendance. Owner/HR-gated pages only (RLS).
 */
export function useDayAttendance(date: string) {
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [attendance, setAttendance] = useState<AttendanceRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      supabase.from("employees").select("id,name,leave_balance,active").order("id"),
      supabase.from("attendance").select("*").eq("work_date", date),
    ]).then(([emp, att]) => {
      if (cancelled) return
      setEmployees((emp.data as EmployeeRow[]) || [])
      setAttendance((att.data as AttendanceRow[]) || [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [date])

  const summary = useMemo(() => {
    const active = employees.filter((emp) => emp.active !== false)
    const recs = new Map(attendance.map((row) => [row.employee_id, row]))
    const checkedIn = active.filter((emp) => recs.get(emp.id)?.check_in).length
    const late = active.filter((emp) => recs.get(emp.id)?.status === "late").length
    const absent = active.filter((emp) => recs.get(emp.id)?.status === "absent").length
    const onLeave = active.filter((emp) =>
      ["leave", "mission", "sick"].includes(recs.get(emp.id)?.status || "")
    ).length
    const missingCheckout = active.filter((emp) => {
      const rec = recs.get(emp.id)
      return rec?.check_in && !rec?.check_out && ["present", "late"].includes(rec.status)
    }).length
    return {
      total: active.length,
      present: checkedIn,
      late,
      absent,
      onLeave,
      missingCheckout,
      notRegistered: Math.max(0, active.length - checkedIn),
    }
  }, [employees, attendance])

  return { employees, attendance, loading, summary }
}

/**
 * The same range queries v1's OwnerDashboard makes (minus salaries — those
 * stay owner-route-only). Computes attendance rate + the daily trend series.
 */
export function useRangeAttendance(from: string, to: string) {
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [holidays, setHolidays] = useState<HolidayRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      supabase.from("attendance").select("*").gte("work_date", from).lte("work_date", to),
      supabase.from("employees").select("id,name,leave_balance,active").eq("active", true).order("id"),
      supabase
        .from("official_holidays")
        .select("holiday_date,label")
        .gte("holiday_date", from)
        .lte("holiday_date", to),
    ]).then(([att, emp, hol]) => {
      if (cancelled) return
      setRows((att.data as AttendanceRow[]) || [])
      setEmployees((emp.data as EmployeeRow[]) || [])
      setHolidays((hol.data as HolidayRow[]) || [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [from, to])

  const stats = useMemo(() => {
    const holidaySet = new Set(holidays.map((item) => item.holiday_date))
    const workDates = datesBetween(from, to).filter((day) => {
      const dow = new Date(`${day}T00:00:00Z`).getUTCDay()
      return dow !== 5 && !holidaySet.has(day)
    })
    const expected = employees.length * workDates.length
    const checkedIn = rows.filter((r) => r.check_in).length
    const late = rows.filter((r) => r.status === "late").length
    const absent = rows.filter((r) => r.status === "absent").length
    const leave = rows.filter((r) => ["leave", "mission", "sick"].includes(r.status)).length
    const missingCheckout = rows.filter(
      (r) => r.check_in && !r.check_out && ["present", "late"].includes(r.status)
    ).length

    const rowsByEmployee = rows.reduce((acc, row) => {
      const list = acc.get(row.employee_id) || []
      list.push(row)
      acc.set(row.employee_id, list)
      return acc
    }, new Map<number, AttendanceRow[]>())

    const perEmployee = employees.map((emp) => {
      const employeeRows = rowsByEmployee.get(emp.id) || []
      const present = employeeRows.filter((row) => row.check_in).length
      const empLeave = employeeRows.filter((row) =>
        ["leave", "mission", "sick"].includes(row.status)
      ).length
      return {
        ...emp,
        present,
        late: employeeRows.filter((row) => row.status === "late").length,
        absent: employeeRows.filter((row) => row.status === "absent").length,
        attendanceRate: workDates.length
          ? Math.round(((present + empLeave) / workDates.length) * 100)
          : 0,
      }
    })

    return {
      expected,
      workDays: workDates.length,
      total: rows.length,
      checkedIn,
      late,
      absent,
      leave,
      missingCheckout,
      attendanceRate: expected ? Math.round(((checkedIn + leave) / expected) * 100) : 0,
      perEmployee,
    }
  }, [rows, employees, holidays, from, to])

  const dailyData = useMemo(() => {
    const byDate = new Map<string, { present: number; late: number; absent: number }>()
    rows.forEach((row) => {
      const entry = byDate.get(row.work_date) || { present: 0, late: 0, absent: 0 }
      if (row.check_in) entry.present += 1
      if (row.status === "late") entry.late += 1
      if (row.status === "absent") entry.absent += 1
      byDate.set(row.work_date, entry)
    })
    return datesBetween(from, to)
      .filter((day) => new Date(`${day}T00:00:00Z`).getUTCDay() !== 5)
      .map((day) => ({
        day: `${day.slice(8)}/${day.slice(5, 7)}`,
        date: day,
        ...(byDate.get(day) || { present: 0, late: 0, absent: 0 }),
      }))
  }, [rows, from, to])

  return { rows, employees, holidays, loading, stats, dailyData }
}

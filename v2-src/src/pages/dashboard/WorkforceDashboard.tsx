import { useMemo, useState } from "react";
import { CheckCircle, XCircle, Clock, CalendarDays } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { todayIso } from "@/lib/supabase";
import { dateRangeForPeriod, weekdayName } from "@/lib/attendance";
import { useDayAttendance, useRangeAttendance } from "@/hooks/useAttendanceStats";
import DemoBadge from "@/components/attendance/DemoBadge";

const schedule = [
  { employee: "Ahmed Hassan", sun: "08:00-17:00", mon: "08:00-17:00", tue: "08:00-17:00", wed: "08:00-17:00", thu: "08:00-17:00", fri: "Off", sat: "Off" },
  { employee: "Sara Mahmoud", sun: "08:00-17:00", mon: "08:00-17:00", tue: "Off", wed: "08:00-17:00", thu: "08:00-17:00", fri: "Off", sat: "Off" },
  { employee: "Khaled Omar", sun: "Night", mon: "Night", tue: "Night", wed: "Off", thu: "Night", fri: "Night", sat: "Off" },
  { employee: "Fatima Ali", sun: "08:00-17:00", mon: "08:00-17:00", tue: "08:00-17:00", wed: "08:00-17:00", thu: "Off", fri: "Off", sat: "Off" },
  { employee: "Omar Ibrahim", sun: "Off", mon: "08:00-17:00", tue: "08:00-17:00", wed: "08:00-17:00", thu: "08:00-17:00", fri: "Off", sat: "Off" },
  { employee: "Nour El-Din", sun: "08:00-17:00", mon: "08:00-17:00", tue: "08:00-17:00", wed: "Off", thu: "08:00-17:00", fri: "Off", sat: "Off" },
];

const overtimeData = [
  { employee: "Ahmed H.", hours: 12, status: "Approved" },
  { employee: "Sara M.", hours: 8, status: "Approved" },
  { employee: "Khaled O.", hours: 24, status: "Pending" },
  { employee: "Omar I.", hours: 16, status: "Approved" },
  { employee: "Nour E.", hours: 6, status: "Pending" },
];

const shiftColors: Record<string, string> = {
  "Off": "bg-[var(--c-page)] text-[var(--c-faint)]",
  "Night": "bg-[#1e293b] text-white",
  "Leave": "bg-[var(--c-orange-bg)] text-[var(--c-orange)]",
};

export default function WorkforceDashboard() {
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const { summary, loading } = useDayAttendance(selectedDate);
  const weekRange = useMemo(() => dateRangeForPeriod("week", selectedDate), [selectedDate]);
  const { dailyData } = useRangeAttendance(weekRange.from, weekRange.to);

  const weeklyData = useMemo(
    () =>
      dailyData.map((d) => ({
        day: weekdayName(d.date),
        present: d.present,
        absent: d.absent,
        late: d.late,
      })),
    [dailyData]
  );

  return (
    <div className="space-y-6">
      {/* Date Selector */}
      <div className="flex items-center gap-3">
        <CalendarDays className="w-5 h-5 text-[var(--c-muted)]" />
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="h-10 px-4 rounded-lg border border-[var(--c-line)] text-sm focus:border-[#FCC10E] outline-none"
        />
      </div>

      {/* Attendance Summary — real data for the selected day */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "حاضر / Present", value: summary.present, icon: CheckCircle, color: "var(--c-green)", bg: "var(--c-green-bg)" },
          { label: "غائب / Absent", value: summary.absent, icon: XCircle, color: "var(--c-red)", bg: "var(--c-red-bg)" },
          { label: "متأخر / Late", value: summary.late, icon: Clock, color: "var(--c-orange)", bg: "var(--c-orange-bg)" },
          { label: "أجازة / On Leave", value: summary.onLeave, icon: CalendarDays, color: "var(--c-blue)", bg: "var(--c-blue-bg)" },
        ].map((item) => (
          <div key={item.label} className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-medium text-[var(--c-muted)] uppercase tracking-wider">{item.label}</span>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: item.bg }}>
                <item.icon className="w-4 h-4" style={{ color: item.color }} />
              </div>
            </div>
            <div className="text-[28px] font-bold" style={{ color: item.color }}>
              {loading ? "…" : item.value}
            </div>
            <div className="text-xs text-[var(--c-faint)] mt-1">من إجمالي {summary.total} موظف</div>
          </div>
        ))}
      </div>

      {/* Weekly Chart — real data for the selected week */}
      <div className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
        <h3 className="text-base font-semibold text-[var(--c-ink)] mb-1">نظرة الأسبوع</h3>
        <p className="text-xs text-[var(--c-muted)] mb-4" dir="ltr">
          {weekRange.from} → {weekRange.to}
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={weeklyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#94a3b8" }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#94a3b8" }} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
            <Bar dataKey="present" fill="#22c55e" radius={[4, 4, 0, 0]} name="حاضر" />
            <Bar dataKey="absent" fill="#ef4444" radius={[4, 4, 0, 0]} name="غائب" />
            <Bar dataKey="late" fill="#f97316" radius={[4, 4, 0, 0]} name="متأخر" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Schedule Table — mock */}
      <div className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[var(--c-ink)]">Weekly Schedule</h3>
          <DemoBadge />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--c-panel-soft)] border-b border-[var(--c-line-soft)]">
                <th className="text-right py-3 px-4 text-xs font-medium text-[var(--c-muted)] uppercase">Employee</th>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <th key={d} className="text-center py-3 px-2 text-xs font-medium text-[var(--c-muted)] uppercase">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedule.map((row) => (
                <tr key={row.employee} className="border-b border-[var(--c-line-soft)] hover:bg-[var(--c-panel-soft)]">
                  <td className="py-3 px-4 font-medium text-[var(--c-ink)]">{row.employee}</td>
                  {(["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const).map((day) => (
                    <td key={day} className="py-3 px-2 text-center">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${shiftColors[row[day]] || "bg-[var(--c-green-bg)] text-[var(--c-green)]"}`}>
                        {row[day]}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Overtime Section — mock */}
      <div className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[var(--c-ink)]">Overtime Hours</h3>
          <DemoBadge />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[var(--c-panel-soft)] border-b border-[var(--c-line-soft)]">
                {["Employee", "Hours", "Status"].map((h) => (
                  <th key={h} className="text-right text-xs font-medium text-[var(--c-muted)] uppercase tracking-wider py-3 px-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {overtimeData.map((ot, i) => (
                <tr key={i} className="border-b border-[var(--c-line-soft)] hover:bg-[var(--c-panel-soft)]">
                  <td className="py-3 px-4 text-sm font-medium text-[var(--c-ink)]">{ot.employee}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-[var(--c-page)] rounded-full overflow-hidden">
                        <div className="h-full bg-[#FCC10E] rounded-full" style={{ width: `${(ot.hours / 30) * 100}%` }} />
                      </div>
                      <span className="text-sm font-semibold">{ot.hours}h</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ot.status === "Approved" ? "bg-[var(--c-green-bg)] text-[var(--c-green)]" : "bg-[var(--c-amber-bg)] text-[var(--c-amber)]"}`}>
                      {ot.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

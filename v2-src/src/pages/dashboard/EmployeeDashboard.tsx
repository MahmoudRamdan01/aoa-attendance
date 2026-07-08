import { useMemo, useState } from "react";
import { Search, Grid3X3, List } from "lucide-react";
import { todayIso } from "@/lib/supabase";
import { dateRangeForPeriod, nameInitials } from "@/lib/attendance";
import { useDayAttendance, useRangeAttendance } from "@/hooks/useAttendanceStats";
import DemoBadge from "@/components/attendance/DemoBadge";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Active: "bg-[var(--c-green-bg)] text-[var(--c-green)]",
    "On Leave": "bg-[var(--c-orange-bg)] text-[var(--c-orange)]",
    Inactive: "bg-[var(--c-red-bg)] text-[var(--c-red)]",
  };
  const labels: Record<string, string> = {
    Active: "نشط",
    Inactive: "موقوف",
  };
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${colors[status] || "bg-[var(--c-page)] text-[var(--c-muted)]"}`}>
      {labels[status] || status}
    </span>
  );
}

export default function EmployeeDashboard() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [searchTerm, setSearchTerm] = useState("");
  const today = todayIso();
  const monthRange = useMemo(() => dateRangeForPeriod("month", today), [today]);
  const { stats, loading } = useRangeAttendance(monthRange.from, monthRange.to);
  const { summary: daySummary } = useDayAttendance(today);

  const roster = useMemo(
    () =>
      stats.perEmployee.map((emp) => ({
        id: `AOI-${String(emp.id).padStart(3, "0")}`,
        rawId: emp.id,
        name: emp.name,
        leaveBalance: emp.leave_balance ?? 0,
        attendance: emp.attendanceRate,
        present: emp.present,
        late: emp.late,
        absent: emp.absent,
        status: emp.active === false ? "Inactive" : "Active",
        avatar: nameInitials(emp.name),
      })),
    [stats.perEmployee]
  );

  const filtered = roster.filter(
    (e) =>
      e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const statCards = [
    { label: "إجمالي الموظفين", value: roster.length, color: "var(--c-blue)", demo: false },
    { label: "نشط", value: roster.filter((r) => r.status === "Active").length, color: "var(--c-green)", demo: false },
    { label: "في أجازة اليوم", value: daySummary.onLeave, color: "var(--c-orange)", demo: false },
    { label: "تعيينات جديدة", value: 6, color: "#FCC10E", demo: true },
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div key={s.label} className="bg-[var(--c-panel)] rounded-xl p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-medium text-[var(--c-muted)] uppercase tracking-wider">{s.label}</div>
              {s.demo && <DemoBadge />}
            </div>
            <div className="text-[28px] font-bold" style={{ color: s.color }}>
              {loading && !s.demo ? "…" : s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-faint)]" />
          <input
            type="text"
            placeholder="بحث بالاسم أو الرقم..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-10 pr-10 pl-4 rounded-lg border border-[var(--c-line)] text-sm focus:border-[#FCC10E] focus:ring-1 focus:ring-[#FCC10E]/20 outline-none"
          />
        </div>
        <div className="flex items-center bg-[var(--c-panel)] rounded-lg border border-[var(--c-line)] overflow-hidden">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2.5 ${viewMode === "grid" ? "bg-[#FCC10E] text-[#383737]" : "text-[var(--c-faint)] hover:text-[var(--c-muted)]"}`}
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-2.5 ${viewMode === "list" ? "bg-[#FCC10E] text-[#383737]" : "text-[var(--c-faint)] hover:text-[var(--c-muted)]"}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((emp) => (
            <div key={emp.rawId} className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[#FCC10E] flex items-center justify-center text-[#383737] font-bold text-sm">
                  {emp.avatar}
                </div>
                <div>
                  <div className="text-sm font-semibold text-[var(--c-ink)]">{emp.name}</div>
                  <div className="text-xs text-[var(--c-faint)]" dir="ltr">{emp.id}</div>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-[var(--c-muted)]">حضور الشهر</span><span className={`font-semibold ${emp.attendance >= 90 ? "text-[var(--c-green)]" : emp.attendance >= 75 ? "text-[var(--c-blue)]" : "text-[var(--c-red)]"}`}>{emp.attendance}%</span></div>
                <div className="flex justify-between"><span className="text-[var(--c-muted)]">تأخير / غياب</span><span className="text-[var(--c-ink)]">{emp.late} / {emp.absent}</span></div>
                <div className="flex justify-between"><span className="text-[var(--c-muted)]">رصيد الأجازات</span><span className="text-[var(--c-ink)] font-medium">{emp.leaveBalance} يوم</span></div>
                <div className="flex justify-between"><span className="text-[var(--c-muted)]">الحالة</span><StatusBadge status={emp.status} /></div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-[var(--c-panel)] rounded-xl shadow-[var(--shadow-card)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--c-panel-soft)] border-b border-[var(--c-line-soft)]">
                  {["الموظف", "الرقم", `حضور ${monthRange.label}`, "تأخير", "غياب", "رصيد الأجازات", "الحالة"].map((h) => (
                    <th key={h} className="text-right text-xs font-medium text-[var(--c-muted)] uppercase tracking-wider py-3 px-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td className="py-3 px-4 text-sm text-[var(--c-muted)]" colSpan={7}>جاري التحميل...</td>
                  </tr>
                )}
                {!loading && filtered.map((emp) => (
                  <tr key={emp.rawId} className="border-b border-[var(--c-line-soft)] hover:bg-[var(--c-panel-soft)] transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#FCC10E] flex items-center justify-center text-[#383737] text-xs font-bold">{emp.avatar}</div>
                        <div className="text-sm font-medium text-[var(--c-ink)]">{emp.name}</div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-[var(--c-muted)]" dir="ltr">{emp.id}</td>
                    <td className="py-3 px-4">
                      <span className={`text-sm font-semibold ${emp.attendance >= 90 ? "text-[var(--c-green)]" : emp.attendance >= 75 ? "text-[var(--c-blue)]" : "text-[var(--c-red)]"}`}>
                        {emp.attendance}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-[var(--c-muted)]">{emp.late}</td>
                    <td className="py-3 px-4 text-sm text-[var(--c-muted)]">{emp.absent}</td>
                    <td className="py-3 px-4 text-sm text-[var(--c-ink)]">{emp.leaveBalance} يوم</td>
                    <td className="py-3 px-4"><StatusBadge status={emp.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

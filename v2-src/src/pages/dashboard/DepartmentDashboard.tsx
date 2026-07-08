import { useState } from "react";
import {
  Users,
  Clock,
  TrendingUp,
  AlertCircle,
  ChevronDown,
  Search,
  Filter,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

const departments = [
  { id: 1, nameAr: "الشحن", nameEn: "Shipping", headcount: 42, attendance: 96.8, overtime: 24, lateCount: 3, earlyLeave: 2, score: 96.8, status: "Excellent" },
  { id: 2, nameAr: "العمليات", nameEn: "Operations", headcount: 38, attendance: 93.2, overtime: 45, lateCount: 7, earlyLeave: 4, score: 93.2, status: "Good" },
  { id: 3, nameAr: "المالية", nameEn: "Finance", headcount: 22, attendance: 91.5, overtime: 18, lateCount: 12, earlyLeave: 5, score: 91.5, status: "Good" },
  { id: 4, nameAr: "الموارد البشرية", nameEn: "HR", headcount: 18, attendance: 89.4, overtime: 15, lateCount: 8, earlyLeave: 3, score: 89.4, status: "Good" },
  { id: 5, nameAr: "الاستقبال", nameEn: "Reception", headcount: 16, attendance: 78.0, overtime: 32, lateCount: 18, earlyLeave: 9, score: 78.0, status: "Needs Attention" },
  { id: 6, nameAr: "التسويق", nameEn: "Marketing", headcount: 12, attendance: 88.5, overtime: 12, lateCount: 6, earlyLeave: 3, score: 88.5, status: "Good" },
  { id: 7, nameAr: "تقنية المعلومات", nameEn: "IT", headcount: 8, attendance: 95.1, overtime: 28, lateCount: 2, earlyLeave: 1, score: 95.1, status: "Excellent" },
];

const trendData = [
  { month: "Jan", Shipping: 94, Operations: 90, Finance: 88, HR: 87, Reception: 82 },
  { month: "Feb", Shipping: 95, Operations: 91, Finance: 89, HR: 88, Reception: 80 },
  { month: "Mar", Shipping: 94, Operations: 92, Finance: 90, HR: 88, Reception: 79 },
  { month: "Apr", Shipping: 96, Operations: 91, Finance: 89, HR: 89, Reception: 78 },
  { month: "May", Shipping: 97, Operations: 93, Finance: 91, HR: 90, Reception: 77 },
  { month: "Jun", Shipping: 96, Operations: 93, Finance: 92, HR: 89, Reception: 78 },
];

const comparisonData = departments.map((d) => ({
  name: d.nameEn,
  score: d.score,
  attendance: d.attendance,
}));

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Excellent: "bg-[var(--c-green-bg)] text-[var(--c-green)]",
    Good: "bg-[var(--c-blue-bg)] text-[var(--c-blue)]",
    "Needs Attention": "bg-[var(--c-red-bg)] text-[var(--c-red)]",
  };
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${colors[status] || "bg-[var(--c-page)] text-[var(--c-muted)]"}`}>
      {status}
    </span>
  );
}

export default function DepartmentDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");

  const filtered = departments.filter((d) => {
    const matchSearch =
      d.nameEn.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.nameAr.includes(searchTerm);
    const matchStatus = filterStatus === "All" || d.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const avgAttendance = (departments.reduce((s, d) => s + d.attendance, 0) / departments.length).toFixed(1);
  const totalHeadcount = departments.reduce((s, d) => s + d.headcount, 0);
  const totalOvertime = departments.reduce((s, d) => s + d.overtime, 0);
  const needsAttention = departments.filter((d) => d.status === "Needs Attention").length;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: "AVG ATTENDANCE", value: `${avgAttendance}%`, icon: Users, color: "#22c55e", bg: "#dcfce7" },
          { label: "TOTAL HEADCOUNT", value: `${totalHeadcount}`, icon: TrendingUp, color: "#3b82f6", bg: "#dbeafe" },
          { label: "TOTAL OVERTIME", value: `${totalOvertime}h`, icon: Clock, color: "#f97316", bg: "#fef3c7" },
          { label: "NEEDS ATTENTION", value: `${needsAttention}`, icon: AlertCircle, color: "#ef4444", bg: "#fee2e2" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-medium text-[var(--c-muted)] uppercase tracking-wider">{kpi.label}</span>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: kpi.bg }}>
                <kpi.icon className="w-4 h-4" style={{ color: kpi.color }} />
              </div>
            </div>
            <div className="text-[28px] font-bold text-[var(--c-ink)]">{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
          <h3 className="text-base font-semibold text-[var(--c-ink)] mb-4">Department Trends</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#94a3b8" }} />
              <YAxis domain={[60, 100]} tick={{ fontSize: 12, fill: "#94a3b8" }} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
              <Line type="monotone" dataKey="Shipping" stroke="#1e40af" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Operations" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Reception" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
          <h3 className="text-base font-semibold text-[var(--c-ink)] mb-4">Department Comparison</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "#94a3b8" }} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
              <Bar dataKey="score" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={32} />
              <Bar dataKey="attendance" fill="#FCC10E" radius={[4, 4, 0, 0]} barSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-faint)]" />
          <input
            type="text"
            placeholder="Search departments..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-10 pr-10 pl-4 rounded-lg border border-[var(--c-line)] text-sm focus:border-[#FCC10E] focus:ring-1 focus:ring-[#FCC10E]/20 outline-none"
          />
        </div>
        <div className="relative">
          <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-faint)]" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-10 pr-10 pl-4 rounded-lg border border-[var(--c-line)] text-sm focus:border-[#FCC10E] outline-none appearance-none bg-[var(--c-panel)]"
          >
            <option value="All">All Status</option>
            <option value="Excellent">Excellent</option>
            <option value="Good">Good</option>
            <option value="Needs Attention">Needs Attention</option>
          </select>
          <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-faint)] pointer-events-none" />
        </div>
      </div>

      {/* Department Table */}
      <div className="bg-[var(--c-panel)] rounded-xl shadow-[var(--shadow-card)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[var(--c-panel-soft)] border-b border-[var(--c-line-soft)]">
                {["Department", "Headcount", "Attendance", "Overtime", "Late Count", "Early Leave", "Score", "Status"].map((h) => (
                  <th key={h} className="text-left text-xs font-medium text-[var(--c-muted)] uppercase tracking-wider py-3 px-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((dept) => (
                <tr key={dept.id} className="border-b border-[var(--c-line-soft)] hover:bg-[var(--c-panel-soft)] transition-colors">
                  <td className="py-3 px-4">
                    <div>
                      <div className="text-sm font-medium text-[var(--c-ink)]">{dept.nameAr}</div>
                      <div className="text-xs text-[var(--c-faint)]">{dept.nameEn}</div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-[var(--c-ink)]">{dept.headcount}</td>
                  <td className="py-3 px-4">
                    <span className={`text-sm font-semibold ${dept.attendance >= 90 ? "text-[var(--c-green)]" : dept.attendance >= 80 ? "text-[var(--c-orange)]" : "text-[var(--c-red)]"}`}>
                      {dept.attendance}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-[var(--c-ink)]">{dept.overtime}h</td>
                  <td className="py-3 px-4 text-sm text-[var(--c-ink)]">{dept.lateCount}</td>
                  <td className="py-3 px-4 text-sm text-[var(--c-ink)]">{dept.earlyLeave}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-[var(--c-page)] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${dept.score}%`, backgroundColor: dept.score >= 90 ? "#22c55e" : dept.score >= 80 ? "#3b82f6" : "#ef4444" }} />
                      </div>
                      <span className="text-sm font-semibold text-[var(--c-ink)]">{dept.score}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-4"><StatusBadge status={dept.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

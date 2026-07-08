import { useEffect, useMemo, useState } from "react";
import {
  Users,
  UserCheck,
  Building2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  MoreHorizontal,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { todayIso } from "@/lib/supabase";
import { dateRangeForPeriod } from "@/lib/attendance";
import { useDayAttendance, useRangeAttendance } from "@/hooks/useAttendanceStats";
import DemoBadge from "@/components/attendance/DemoBadge";

// --- Types ---
interface KPICard {
  label: string;
  value: string;
  sub: string;
  delta?: string;
  deltaPositive?: boolean;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  demo?: boolean;
}

interface AlertItem {
  title: string;
  department: string;
  actual: string;
  target: string;
  type: "danger" | "warning" | "success";
}

interface TopEmployee {
  name: string;
  department: string;
  role: string;
  score: number;
  target: number;
  status: string;
  trend: "up" | "down" | "stable";
}

// --- Mock data (modules with no backing tables yet) ---
const deptPerformanceData = [
  { name: "الشحن / Shipping", value: 96.8, color: "#1e40af" },
  { name: "العمليات / Operations", value: 93.2, color: "#0ea5e9" },
  { name: "المالية / Finance", value: 91.5, color: "#14b8a6" },
  { name: "الموارد البشرية / HR", value: 89.4, color: "#FCC10E" },
  { name: "الاستقبال / Reception", value: 78.0, color: "#ef4444" },
];

const barData = [
  { dept: "الشحن", score: 87.5 },
  { dept: "العمليات", score: 79.4 },
  { dept: "الاستقبال / الكول سنتر", score: 72 },
  { dept: "الموارد البشرية", score: 88.8 },
  { dept: "التوظيف", score: 81.5 },
];

const topEmployees: TopEmployee[] = [
  { name: "Ahmed Hassan", department: "Shipping", role: "Supervisor", score: 96.5, target: 90, status: "Excellent", trend: "up" },
  { name: "Sara Mahmoud", department: "HR", role: "HR Manager", score: 94.2, target: 90, status: "Excellent", trend: "up" },
  { name: "Khaled Omar", department: "Operations", role: "Coordinator", score: 91.8, target: 90, status: "Good", trend: "stable" },
  { name: "Fatima Ali", department: "Finance", role: "Accountant", score: 89.5, target: 90, status: "Good", trend: "down" },
  { name: "Omar Ibrahim", department: "Shipping", role: "Team Lead", score: 93.1, target: 90, status: "Excellent", trend: "up" },
];

// --- Components ---
function KPICardComponent({ card, index }: { card: KPICard; index: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), index * 100);
    return () => clearTimeout(t);
  }, [index]);

  const Icon = card.icon;
  return (
    <div
      className={`bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)] transition-all duration-400 hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5 ${
        mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
      }`}
    >
      <div className="flex items-start justify-between mb-3 gap-2">
        <span className="text-[11px] font-medium text-[var(--c-muted)] uppercase tracking-wider">
          {card.label}
        </span>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: card.iconBg }}
        >
          <Icon className="w-4 h-4" style={{ color: card.iconColor }} />
        </div>
      </div>
      <div className="text-[32px] font-bold text-[var(--c-ink)] leading-tight mb-1">
        {card.value}
      </div>
      <div className="text-sm text-[var(--c-muted)] mb-2">{card.sub}</div>
      <div className="flex items-center gap-1.5">
        {card.demo ? (
          <DemoBadge />
        ) : card.delta ? (
          <>
            {card.deltaPositive ? (
              <TrendingUp className="w-3.5 h-3.5 text-[var(--c-green)]" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-[var(--c-red)]" />
            )}
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                card.deltaPositive
                  ? "text-[var(--c-green)] bg-[var(--c-green-bg)]"
                  : "text-[var(--c-red)] bg-[var(--c-red-bg)]"
              }`}
            >
              {card.delta}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Excellent: "bg-[var(--c-green-bg)] text-[var(--c-green)]",
    Good: "bg-[var(--c-blue-bg)] text-[var(--c-blue)]",
    Average: "bg-[var(--c-amber-bg)] text-[var(--c-amber)]",
    "Below Average": "bg-[var(--c-red-bg)] text-[var(--c-red)]",
  };
  return (
    <span
      className={`text-xs font-medium px-2.5 py-1 rounded-full ${
        colors[status] || "bg-[var(--c-page)] text-[var(--c-muted)]"
      }`}
    >
      {status}
    </span>
  );
}

// --- Main Page ---
export default function ExecutiveDashboard() {
  const today = todayIso();
  const monthRange = useMemo(() => dateRangeForPeriod("month", today), [today]);
  const { stats: monthStats, dailyData, loading: monthLoading } = useRangeAttendance(
    monthRange.from,
    monthRange.to
  );
  const { summary: daySummary } = useDayAttendance(today);

  const kpiData: KPICard[] = [
    {
      label: "OVERALL ATTENDANCE RATE",
      value: monthLoading ? "…" : `${monthStats.attendanceRate}%`,
      sub: `معدل تغطية ${monthRange.label} · ${monthStats.total}/${monthStats.expected} سجل`,
      delta: `${daySummary.present} حاضر اليوم`,
      deltaPositive: true,
      icon: Users,
      iconBg: "var(--c-green-bg)",
      iconColor: "var(--c-green)",
    },
    {
      label: "TOTAL EMPLOYEES",
      value: monthLoading ? "…" : String(monthStats.perEmployee.length),
      sub: "الموظفون النشطون",
      delta: `${daySummary.onLeave} في أجازة اليوم`,
      deltaPositive: true,
      icon: UserCheck,
      iconBg: "var(--c-blue-bg)",
      iconColor: "var(--c-blue)",
    },
    {
      label: "TOP DEPARTMENT",
      value: "الشحن / Shipping",
      sub: "96.8% Score",
      icon: Building2,
      iconBg: "var(--c-amber-bg)",
      iconColor: "var(--c-amber)",
      demo: true,
    },
    {
      label: "NEEDS ATTENTION",
      value: "الاستقبال / Reception",
      sub: "78% Score",
      icon: AlertTriangle,
      iconBg: "var(--c-red-bg)",
      iconColor: "var(--c-red)",
      demo: true,
    },
  ];

  const alerts: AlertItem[] = useMemo(() => {
    const list: AlertItem[] = [];
    if (daySummary.late > 0) {
      list.push({
        title: "تأخيرات اليوم",
        department: `${daySummary.late} موظف وصل متأخر النهارده`,
        actual: String(daySummary.late),
        target: "0",
        type: "warning",
      });
    }
    if (daySummary.missingCheckout > 0) {
      list.push({
        title: "انصراف غير مسجل",
        department: `${daySummary.missingCheckout} موظف سجل حضور بدون انصراف`,
        actual: String(daySummary.missingCheckout),
        target: "0",
        type: "warning",
      });
    }
    if (daySummary.absent > 0) {
      list.push({
        title: "غياب اليوم",
        department: `${daySummary.absent} موظف غائب النهارده`,
        actual: String(daySummary.absent),
        target: "0",
        type: "danger",
      });
    }
    if (list.length === 0) {
      list.push({
        title: "لا توجد تنبيهات اليوم",
        department: "الحضور منتظم — استمروا 👏",
        actual: `${daySummary.present}`,
        target: `${daySummary.total}`,
        type: "success",
      });
    }
    return list;
  }, [daySummary]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiData.map((card, i) => (
          <KPICardComponent key={card.label} card={card} index={i} />
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Line Chart — real attendance trend */}
        <div className="lg:col-span-2 bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-[var(--c-ink)]">
                اتجاه الحضور اليومي
              </h3>
              <p className="text-xs text-[var(--c-muted)] mt-0.5">
                حضور / تأخير / غياب خلال {monthRange.label} ({monthRange.from} → {monthRange.to})
              </p>
            </div>
            <button className="text-[var(--c-faint)] hover:text-[var(--c-muted)]">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#94a3b8" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#94a3b8" }} />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Line
                type="monotone"
                dataKey="present"
                name="حضور"
                stroke="#FCC10E"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="late"
                name="تأخير"
                stroke="#f97316"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="absent"
                name="غياب"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Donut Chart — mock */}
        <div className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-semibold text-[var(--c-ink)]">
              Department Performance
            </h3>
            <DemoBadge />
          </div>
          <p className="text-xs text-[var(--c-muted)] mb-4">أداء الأقسام</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={deptPerformanceData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
              >
                {deptPerformanceData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => `${value}%`}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-3">
            {deptPerformanceData.map((dept) => (
              <div key={dept.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: dept.color }}
                  />
                  <span className="text-xs text-[var(--c-ink)]">{dept.name}</span>
                </div>
                <span
                  className="text-xs font-semibold"
                  style={{ color: dept.color }}
                >
                  {dept.value}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bar Chart — mock */}
        <div className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-semibold text-[var(--c-ink)]">
              Department Score Comparison
            </h3>
            <DemoBadge />
          </div>
          <p className="text-xs text-[var(--c-muted)] mb-4">مقارنة درجات الأقسام</p>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={barData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: "#94a3b8" }} />
              <YAxis
                dataKey="dept"
                type="category"
                tick={{ fontSize: 11, fill: "#1e293b" }}
                width={120}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                }}
                formatter={(value: number) => [`${value}%`, "Score"]}
              />
              <Bar dataKey="score" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Alerts — real, from today's attendance */}
        <div className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-[var(--c-orange)]" />
            <h3 className="text-base font-semibold text-[var(--c-ink)]">
              تنبيهات اليوم
            </h3>
          </div>
          <p className="text-xs text-[var(--c-muted)] mb-4">مبنية على حضور {today}</p>
          <div className="space-y-3 max-h-[280px] overflow-y-auto">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg border-r-4 ${
                  alert.type === "danger"
                    ? "bg-[var(--c-red-bg2)] border-[var(--c-red)]"
                    : alert.type === "warning"
                    ? "bg-[var(--c-orange-bg2)] border-[var(--c-orange)]"
                    : "bg-[var(--c-green-bg2)] border-[var(--c-green)]"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[var(--c-ink)]">
                      {alert.title}
                    </p>
                    <p className="text-xs text-[var(--c-muted)] mt-0.5">
                      {alert.department}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs">
                  <span>
                    الفعلي: <span className="font-semibold">{alert.actual}</span>
                  </span>
                  <span>
                    المستهدف:{" "}
                    <span className="font-semibold text-[var(--c-muted)]">
                      {alert.target}
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Employees Table — mock */}
      <div className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-[var(--c-ink)]">
              Top Performing Employees
            </h3>
            <p className="text-xs text-[var(--c-muted)] mt-0.5">
              أفضل الموظفين أداءً
            </p>
          </div>
          <DemoBadge />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--c-line-soft)]">
                {["Employee", "Department", "Role", "Score", "Target", "Status", "Trend"].map((h) => (
                  <th
                    key={h}
                    className="text-right text-xs font-medium text-[var(--c-muted)] uppercase tracking-wider py-3 px-4"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topEmployees.map((emp, i) => (
                <tr
                  key={i}
                  className="border-b border-[var(--c-line-soft)] hover:bg-[var(--c-panel-soft)] transition-colors"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#FCC10E] flex items-center justify-center text-[#383737] text-xs font-bold">
                        {emp.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </div>
                      <span className="text-sm font-medium text-[var(--c-ink)]">
                        {emp.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-[var(--c-muted)]">
                    {emp.department}
                  </td>
                  <td className="py-3 px-4 text-sm text-[var(--c-muted)]">
                    {emp.role}
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm font-semibold text-[var(--c-ink)]">
                      {emp.score}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-[var(--c-muted)]">
                    {emp.target}%
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={emp.status} />
                  </td>
                  <td className="py-3 px-4">
                    {emp.trend === "up" ? (
                      <TrendingUp className="w-4 h-4 text-[var(--c-green)]" />
                    ) : emp.trend === "down" ? (
                      <TrendingDown className="w-4 h-4 text-[var(--c-red)]" />
                    ) : (
                      <span className="text-xs text-[var(--c-faint)]">→</span>
                    )}
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

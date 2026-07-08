import { useState } from "react";
import { FileText, TrendingUp, TrendingDown, Minus, ChevronDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const scorecards = [
  { id: 1, employee: "Ahmed Hassan", department: "Shipping", period: "Q2 2026", overall: 96.5, attendance: 97.2, productivity: 95.1, quality: 97.8, behavior: 94.5, development: 98.0, rating: "Excellent", trend: "up" },
  { id: 2, employee: "Sara Mahmoud", department: "HR", period: "Q2 2026", overall: 94.2, attendance: 95.8, productivity: 93.5, quality: 94.1, behavior: 96.2, development: 92.0, rating: "Excellent", trend: "up" },
  { id: 3, employee: "Khaled Omar", department: "Operations", period: "Q2 2026", overall: 91.8, attendance: 93.5, productivity: 92.8, quality: 90.5, behavior: 91.2, development: 89.5, rating: "Good", trend: "stable" },
  { id: 4, employee: "Omar Ibrahim", department: "Shipping", period: "Q2 2026", overall: 93.1, attendance: 96.1, productivity: 94.2, quality: 92.8, behavior: 90.5, development: 88.0, rating: "Excellent", trend: "up" },
  { id: 5, employee: "Nour El-Din", department: "IT", period: "Q2 2026", overall: 89.7, attendance: 94.7, productivity: 91.5, quality: 88.2, behavior: 93.1, development: 85.0, rating: "Good", trend: "stable" },
  { id: 6, employee: "Fatima Ali", department: "Finance", period: "Q2 2026", overall: 87.5, attendance: 91.2, productivity: 89.5, quality: 86.8, behavior: 88.2, development: 84.5, rating: "Good", trend: "down" },
  { id: 7, employee: "Rania Tarek", department: "Finance", period: "Q2 2026", overall: 92.3, attendance: 93.9, productivity: 93.1, quality: 91.5, behavior: 92.8, development: 90.5, rating: "Good", trend: "up" },
];

const distributionData = [
  { name: "Excellent", value: 3, color: "#22c55e" },
  { name: "Good", value: 4, color: "#3b82f6" },
  { name: "Average", value: 0, color: "#f97316" },
  { name: "Below Average", value: 0, color: "#ef4444" },
];

const categoryAverages = [
  { category: "Attendance", avg: 94.6 },
  { category: "Productivity", avg: 92.8 },
  { category: "Quality", avg: 91.7 },
  { category: "Behavior", avg: 92.3 },
  { category: "Development", avg: 89.6 },
];

function RatingBadge({ rating }: { rating: string }) {
  const colors: Record<string, string> = {
    Excellent: "bg-[var(--c-green-bg)] text-[var(--c-green)]",
    Good: "bg-[var(--c-blue-bg)] text-[var(--c-blue)]",
    Average: "bg-[var(--c-amber-bg)] text-[var(--c-amber)]",
    "Below Average": "bg-[var(--c-red-bg)] text-[var(--c-red)]",
  };
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${colors[rating] || "bg-[var(--c-page)] text-[var(--c-muted)]"}`}>
      {rating}
    </span>
  );
}

export default function ScorecardSystem() {
  const [period, setPeriod] = useState("Q2 2026");

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Scorecards", value: scorecards.length, color: "#3b82f6", bg: "#dbeafe" },
          { label: "Avg Score", value: `${(scorecards.reduce((s, sc) => s + sc.overall, 0) / scorecards.length).toFixed(1)}%`, color: "#22c55e", bg: "#dcfce7" },
          { label: "Excellent", value: scorecards.filter((s) => s.rating === "Excellent").length, color: "#FCC10E", bg: "#fef9c3" },
          { label: "Pending Review", value: 3, color: "#f97316", bg: "#fef3c7" },
        ].map((s) => (
          <div key={s.label} className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
            <div className="text-[11px] font-medium text-[var(--c-muted)] uppercase tracking-wider mb-2">{s.label}</div>
            <div className="text-[28px] font-bold" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Score Distribution */}
        <div className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
          <h3 className="text-base font-semibold text-[var(--c-ink)] mb-4">Score Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={distributionData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                {distributionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Category Averages */}
        <div className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
          <h3 className="text-base font-semibold text-[var(--c-ink)] mb-4">Category Averages</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={categoryAverages} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" domain={[80, 100]} tick={{ fontSize: 12, fill: "#94a3b8" }} />
              <YAxis dataKey="category" type="category" tick={{ fontSize: 12, fill: "#1e293b" }} width={90} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} formatter={(v: number) => [`${v}%`, "Average"]} />
              <Bar dataKey="avg" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Period Selector */}
      <div className="flex items-center gap-3">
        <FileText className="w-5 h-5 text-[var(--c-muted)]" />
        <span className="text-sm text-[var(--c-muted)]">Period:</span>
        <div className="relative">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="h-10 pr-10 pl-4 rounded-lg border border-[var(--c-line)] text-sm focus:border-[#FCC10E] outline-none appearance-none bg-[var(--c-panel)]"
          >
            <option>Q1 2026</option>
            <option>Q2 2026</option>
            <option>Q3 2026</option>
            <option>Q4 2026</option>
          </select>
          <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-faint)] pointer-events-none" />
        </div>
      </div>

      {/* Scorecard Table */}
      <div className="bg-[var(--c-panel)] rounded-xl shadow-[var(--shadow-card)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[var(--c-panel-soft)] border-b border-[var(--c-line-soft)]">
                {["Employee", "Department", "Period", "Overall", "Attendance", "Productivity", "Quality", "Rating", "Trend"].map((h) => (
                  <th key={h} className="text-left text-xs font-medium text-[var(--c-muted)] uppercase tracking-wider py-3 px-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scorecards.map((sc) => (
                <tr key={sc.id} className="border-b border-[var(--c-line-soft)] hover:bg-[var(--c-panel-soft)] transition-colors">
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[#FCC10E] flex items-center justify-center text-[#383737] text-[10px] font-bold">
                        {sc.employee.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <span className="text-sm font-medium text-[var(--c-ink)]">{sc.employee}</span>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-sm text-[var(--c-muted)]">{sc.department}</td>
                  <td className="py-3 px-3 text-sm text-[var(--c-faint)]">{sc.period}</td>
                  <td className="py-3 px-3">
                    <span className="text-sm font-bold text-[var(--c-ink)]">{sc.overall}%</span>
                  </td>
                  <td className="py-3 px-3 text-sm text-[var(--c-muted)]">{sc.attendance}%</td>
                  <td className="py-3 px-3 text-sm text-[var(--c-muted)]">{sc.productivity}%</td>
                  <td className="py-3 px-3 text-sm text-[var(--c-muted)]">{sc.quality}%</td>
                  <td className="py-3 px-3"><RatingBadge rating={sc.rating} /></td>
                  <td className="py-3 px-3">
                    {sc.trend === "up" ? <TrendingUp className="w-4 h-4 text-[var(--c-green)]" /> :
                     sc.trend === "down" ? <TrendingDown className="w-4 h-4 text-[var(--c-red)]" /> :
                     <Minus className="w-4 h-4 text-[var(--c-faint)]" />}
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

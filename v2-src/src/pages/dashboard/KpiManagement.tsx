import { useState } from "react";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const kpiCategories = ["All", "Attendance", "Productivity", "Quality", "Behavior", "Development"];

const kpis = [
  { id: 1, name: "Attendance Rate", nameAr: "معدل الحضور", category: "Attendance", target: 95, current: 94.2, weight: 25, department: "All", status: "On Track" },
  { id: 2, name: "Punctuality", nameAr: "الانضباط في المواعيد", category: "Attendance", target: 98, current: 92.5, weight: 20, department: "All", status: "At Risk" },
  { id: 3, name: "Tasks Completed", nameAr: "المهام المنجزة", category: "Productivity", target: 100, current: 87.3, weight: 20, department: "Operations", status: "On Track" },
  { id: 4, name: "Error Rate", nameAr: "معدل الأخطاء", category: "Quality", target: 2, current: 3.1, weight: 15, department: "Finance", status: "Off Track" },
  { id: 5, name: "Customer Satisfaction", nameAr: "رضا العملاء", category: "Quality", target: 90, current: 88.7, weight: 10, department: "Reception", status: "On Track" },
  { id: 6, name: "Team Collaboration", nameAr: "التعاون الفريقي", category: "Behavior", target: 85, current: 91.2, weight: 5, department: "All", status: "On Track" },
  { id: 7, name: "Training Hours", nameAr: "ساعات التدريب", category: "Development", target: 40, current: 32, weight: 5, department: "All", status: "At Risk" },
  { id: 8, name: "Overtime Control", nameAr: "التحكم في العمل الإضافي", category: "Productivity", target: 30, current: 45, weight: 10, department: "Shipping", status: "Off Track" },
];

const categoryScores = [
  { category: "Attendance", score: 93.4 },
  { category: "Productivity", score: 87.3 },
  { category: "Quality", score: 88.7 },
  { category: "Behavior", score: 91.2 },
  { category: "Development", score: 72.5 },
];

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    "On Track": "bg-[var(--c-green-bg)] text-[var(--c-green)]",
    "At Risk": "bg-[var(--c-amber-bg)] text-[var(--c-amber)]",
    "Off Track": "bg-[var(--c-red-bg)] text-[var(--c-red)]",
  };
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${colors[status] || "bg-[var(--c-page)] text-[var(--c-muted)]"}`}>
      {status}
    </span>
  );
}

export default function KpiManagement() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = kpis.filter((kpi) => {
    const matchCat = activeCategory === "All" || kpi.category === activeCategory;
    const matchSearch =
      kpi.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      kpi.nameAr.includes(searchTerm);
    return matchCat && matchSearch;
  });

  return (
    <div className="space-y-6">
      {/* KPI Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total KPIs", value: kpis.length, color: "#3b82f6", bg: "#dbeafe" },
          { label: "On Track", value: kpis.filter((k) => k.status === "On Track").length, color: "#22c55e", bg: "#dcfce7" },
          { label: "At Risk", value: kpis.filter((k) => k.status === "At Risk").length, color: "#f97316", bg: "#fef3c7" },
          { label: "Off Track", value: kpis.filter((k) => k.status === "Off Track").length, color: "#ef4444", bg: "#fee2e2" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
            <div className="text-[11px] font-medium text-[var(--c-muted)] uppercase tracking-wider mb-2">{kpi.label}</div>
            <div className="text-[28px] font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Category Scores Chart */}
      <div className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
        <h3 className="text-base font-semibold text-[var(--c-ink)] mb-4">Category Performance Scores</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={categoryScores}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="category" tick={{ fontSize: 12, fill: "#94a3b8" }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "#94a3b8" }} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} formatter={(v: number) => [`${v}%`, "Score"]} />
            <Bar dataKey="score" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={48} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-faint)]" />
          <input
            type="text"
            placeholder="Search KPIs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-10 pr-10 pl-4 rounded-lg border border-[var(--c-line)] text-sm focus:border-[#FCC10E] outline-none"
          />
        </div>
        <button className="flex items-center gap-2 h-10 px-4 bg-[#FCC10E] text-[#383737] rounded-lg font-medium text-sm hover:bg-[#e5ad0d] transition-colors">
          <Plus className="w-4 h-4" />
          Add KPI
        </button>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2">
        {kpiCategories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeCategory === cat
                ? "bg-[#FCC10E] text-[#383737]"
                : "bg-[var(--c-panel)] text-[var(--c-muted)] hover:bg-[var(--c-panel-soft)] border border-[var(--c-line)]"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* KPI Table */}
      <div className="bg-[var(--c-panel)] rounded-xl shadow-[var(--shadow-card)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[var(--c-panel-soft)] border-b border-[var(--c-line-soft)]">
                {["KPI Name", "Category", "Target", "Current", "Weight", "Department", "Status", "Actions"].map((h) => (
                  <th key={h} className="text-left text-xs font-medium text-[var(--c-muted)] uppercase tracking-wider py-3 px-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((kpi) => (
                <tr key={kpi.id} className="border-b border-[var(--c-line-soft)] hover:bg-[var(--c-panel-soft)] transition-colors">
                  <td className="py-3 px-4">
                    <div>
                      <div className="text-sm font-medium text-[var(--c-ink)]">{kpi.name}</div>
                      <div className="text-xs text-[var(--c-faint)]">{kpi.nameAr}</div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-[var(--c-muted)]">{kpi.category}</td>
                  <td className="py-3 px-4 text-sm font-medium text-[var(--c-ink)]">{kpi.target}%</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-[var(--c-page)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min((kpi.current / kpi.target) * 100, 100)}%`,
                            backgroundColor: kpi.current >= kpi.target ? "#22c55e" : kpi.current >= kpi.target * 0.9 ? "#f97316" : "#ef4444",
                          }}
                        />
                      </div>
                      <span className="text-sm font-semibold">{kpi.current}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-[var(--c-ink)]">{kpi.weight}%</td>
                  <td className="py-3 px-4 text-sm text-[var(--c-muted)]">{kpi.department}</td>
                  <td className="py-3 px-4"><StatusBadge status={kpi.status} /></td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <button className="p-1.5 rounded-lg hover:bg-[var(--c-page)] text-[var(--c-muted)] hover:text-[var(--c-blue)]">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-[var(--c-page)] text-[var(--c-muted)] hover:text-[var(--c-red)]">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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

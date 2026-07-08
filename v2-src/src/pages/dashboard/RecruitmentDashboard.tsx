import { useState } from "react";
import { Users, Calendar, CheckCircle, Briefcase, ChevronDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, FunnelChart, Funnel, LabelList } from "recharts";

const pipelineStages = [
  { name: "New Applications", count: 48, color: "#94a3b8" },
  { name: "Screening", count: 32, color: "#3b82f6" },
  { name: "Interview", count: 18, color: "#FCC10E" },
  { name: "Offer", count: 8, color: "#22c55e" },
  { name: "Hired", count: 5, color: "#1e40af" },
];

const funnelData = [
  { name: "Applications", value: 48, fill: "#94a3b8" },
  { name: "Screening", value: 32, fill: "#3b82f6" },
  { name: "Interview", value: 18, fill: "#FCC10E" },
  { name: "Offer", value: 8, fill: "#22c55e" },
  { name: "Hired", value: 5, fill: "#1e40af" },
];

const positions = [
  { id: 1, title: "Senior Logistics Coordinator", department: "Operations", applicants: 24, status: "Open", posted: "2025-12-01" },
  { id: 2, title: "HR Specialist", department: "HR", applicants: 18, status: "Open", posted: "2025-12-05" },
  { id: 3, title: "Warehouse Supervisor", department: "Shipping", applicants: 12, status: "Interviewing", posted: "2025-11-20" },
  { id: 4, title: "IT Support Technician", department: "IT", applicants: 9, status: "Open", posted: "2025-12-10" },
  { id: 5, title: "Finance Analyst", department: "Finance", applicants: 15, status: "Offer Stage", posted: "2025-11-15" },
  { id: 6, title: "Receptionist", department: "Reception", applicants: 31, status: "Open", posted: "2025-12-08" },
];

const monthlyData = [
  { month: "Jul", applications: 35, hired: 3 },
  { month: "Aug", applications: 42, hired: 4 },
  { month: "Sep", applications: 38, hired: 2 },
  { month: "Oct", applications: 55, hired: 5 },
  { month: "Nov", applications: 48, hired: 4 },
  { month: "Dec", applications: 62, hired: 6 },
];

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Open: "bg-[var(--c-green-bg)] text-[var(--c-green)]",
    Interviewing: "bg-[var(--c-amber-bg)] text-[var(--c-amber)]",
    "Offer Stage": "bg-[var(--c-blue-bg)] text-[var(--c-blue)]",
    Closed: "bg-[var(--c-red-bg)] text-[var(--c-red)]",
  };
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${colors[status] || "bg-[var(--c-page)] text-[var(--c-muted)]"}`}>
      {status}
    </span>
  );
}

export default function RecruitmentDashboard() {
  const [statusFilter, setStatusFilter] = useState("All");

  const filteredPositions = positions.filter((p) => statusFilter === "All" || p.status === statusFilter);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Open Positions", value: 6, icon: Briefcase, color: "#3b82f6", bg: "#dbeafe" },
          { label: "Total Candidates", value: 155, icon: Users, color: "#22c55e", bg: "#dcfce7" },
          { label: "Interviews Scheduled", value: 18, icon: Calendar, color: "#f97316", bg: "#fef3c7" },
          { label: "Offers Extended", value: 8, icon: CheckCircle, color: "#1e40af", bg: "#dbeafe" },
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

      {/* Pipeline + Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline Visual */}
        <div className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
          <h3 className="text-base font-semibold text-[var(--c-ink)] mb-4">Hiring Pipeline</h3>
          <div className="flex flex-col gap-3">
            {pipelineStages.map((stage) => (
              <div key={stage.name} className="flex items-center gap-4">
                <div className="w-24 text-xs text-[var(--c-muted)] text-right flex-shrink-0">{stage.name}</div>
                <div className="flex-1 h-8 bg-[var(--c-page)] rounded-lg overflow-hidden relative">
                  <div
                    className="h-full rounded-lg transition-all duration-500 flex items-center justify-end pr-3"
                    style={{
                      width: `${(stage.count / pipelineStages[0].count) * 100}%`,
                      backgroundColor: stage.color,
                    }}
                  >
                    <span className="text-white text-xs font-semibold">{stage.count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Funnel Chart */}
        <div className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
          <h3 className="text-base font-semibold text-[var(--c-ink)] mb-4">Candidate Funnel</h3>
          <ResponsiveContainer width="100%" height={250}>
            <FunnelChart>
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
              <Funnel dataKey="value" data={funnelData} isAnimationActive>
                <LabelList position="inside" fill="#fff" stroke="none" dataKey="name" fontSize={11} />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Trend */}
      <div className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
        <h3 className="text-base font-semibold text-[var(--c-ink)] mb-4">Monthly Recruitment Trend</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#94a3b8" }} />
            <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
            <Bar dataKey="applications" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Applications" />
            <Bar dataKey="hired" fill="#22c55e" radius={[4, 4, 0, 0]} name="Hired" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Open Positions Table */}
      <div className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[var(--c-ink)]">Open Positions</h3>
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 pr-8 pl-3 rounded-lg border border-[var(--c-line)] text-sm focus:border-[#FCC10E] outline-none appearance-none bg-[var(--c-panel)]"
            >
              <option value="All">All Status</option>
              <option value="Open">Open</option>
              <option value="Interviewing">Interviewing</option>
              <option value="Offer Stage">Offer Stage</option>
            </select>
            <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-faint)] pointer-events-none" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[var(--c-panel-soft)] border-b border-[var(--c-line-soft)]">
                {["Position", "Department", "Applicants", "Status", "Posted Date"].map((h) => (
                  <th key={h} className="text-left text-xs font-medium text-[var(--c-muted)] uppercase tracking-wider py-3 px-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredPositions.map((pos) => (
                <tr key={pos.id} className="border-b border-[var(--c-line-soft)] hover:bg-[var(--c-panel-soft)] transition-colors">
                  <td className="py-3 px-4 text-sm font-medium text-[var(--c-ink)]">{pos.title}</td>
                  <td className="py-3 px-4 text-sm text-[var(--c-muted)]">{pos.department}</td>
                  <td className="py-3 px-4">
                    <span className="text-sm font-semibold text-[var(--c-blue)]">{pos.applicants}</span>
                  </td>
                  <td className="py-3 px-4"><StatusBadge status={pos.status} /></td>
                  <td className="py-3 px-4 text-sm text-[var(--c-muted)]">{pos.posted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

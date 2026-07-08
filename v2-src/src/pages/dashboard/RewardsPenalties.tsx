import { useState } from "react";
import { Award, AlertTriangle, TrendingUp, Plus } from "lucide-react";

const rewards = [
  { id: 1, employee: "Ahmed Hassan", type: "Performance Bonus", amount: 2500, date: "2026-06-30", approvedBy: "Mohamed Salah", status: "Approved" },
  { id: 2, employee: "Sara Mahmoud", type: "Certificate of Excellence", amount: 0, date: "2026-06-25", approvedBy: "Mohamed Salah", status: "Approved" },
  { id: 3, employee: "Omar Ibrahim", type: "Quarterly Bonus", amount: 1800, date: "2026-06-15", approvedBy: "Mohamed Salah", status: "Approved" },
  { id: 4, employee: "IT Team", type: "Team Bonus", amount: 5000, date: "2026-06-10", approvedBy: "Mohamed Salah", status: "Pending" },
  { id: 5, employee: "Rania Tarek", type: "Promotion Bonus", amount: 3000, date: "2026-05-28", approvedBy: "Mohamed Salah", status: "Approved" },
];

const penalties = [
  { id: 1, employee: "Laila Said", type: "Late Arrival Warning", reason: "Repeated late arrivals (5 times)", date: "2026-06-20", severity: "Low", status: "Active" },
  { id: 2, employee: "Finance Dept", type: "Data Entry Error", reason: "Incorrect reporting causing audit delay", date: "2026-06-15", severity: "Medium", status: "Resolved" },
  { id: 3, employee: "Anonymous", type: "Violation Report", reason: "Safety protocol violation in warehouse", date: "2026-06-10", severity: "High", status: "Under Review" },
  { id: 4, employee: "Reception Staff", type: "Attendance Deduction", reason: "Unauthorized absence", date: "2026-06-05", severity: "Medium", status: "Active" },
];

function StatusBadge({ status, type }: { status: string; type: "reward" | "penalty" }) {
  const rewardColors: Record<string, string> = {
    Approved: "bg-[var(--c-green-bg)] text-[var(--c-green)]",
    Pending: "bg-[var(--c-amber-bg)] text-[var(--c-amber)]",
    Rejected: "bg-[var(--c-red-bg)] text-[var(--c-red)]",
  };
  const penaltyColors: Record<string, string> = {
    Active: "bg-[var(--c-red-bg)] text-[var(--c-red)]",
    Resolved: "bg-[var(--c-green-bg)] text-[var(--c-green)]",
    "Under Review": "bg-[var(--c-amber-bg)] text-[var(--c-amber)]",
  };
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${type === "reward" ? rewardColors[status] : penaltyColors[status]}`}>
      {status}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    Low: "bg-[var(--c-blue-bg)] text-[var(--c-blue)]",
    Medium: "bg-[var(--c-amber-bg)] text-[var(--c-amber)]",
    High: "bg-[var(--c-red-bg)] text-[var(--c-red)]",
  };
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${colors[severity] || "bg-[var(--c-page)] text-[var(--c-muted)]"}`}>
      {severity}
    </span>
  );
}

export default function RewardsPenalties() {
  const [activeTab, setActiveTab] = useState<"rewards" | "penalties">("rewards");

  const totalRewards = rewards.filter((r) => r.status === "Approved").reduce((s, r) => s + r.amount, 0);
  const pendingRewards = rewards.filter((r) => r.status === "Pending").reduce((s, r) => s + r.amount, 0);
  const activePenalties = penalties.filter((p) => p.status === "Active").length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Rewards", value: `${totalRewards.toLocaleString()} EGP`, icon: TrendingUp, color: "#22c55e", bg: "#dcfce7" },
          { label: "Pending Approval", value: `${pendingRewards.toLocaleString()} EGP`, icon: Award, color: "#f97316", bg: "#fef3c7" },
          { label: "Active Penalties", value: activePenalties, icon: AlertTriangle, color: "#ef4444", bg: "#fee2e2" },
          { label: "This Month", value: "+12%", icon: TrendingUp, color: "#3b82f6", bg: "#dbeafe" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-medium text-[var(--c-muted)] uppercase tracking-wider">{kpi.label}</span>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: kpi.bg }}>
                <kpi.icon className="w-4 h-4" style={{ color: kpi.color }} />
              </div>
            </div>
            <div className="text-[22px] font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center bg-[var(--c-panel)] rounded-lg border border-[var(--c-line)] overflow-hidden">
          <button
            onClick={() => setActiveTab("rewards")}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === "rewards"
                ? "bg-[#FCC10E] text-[#383737]"
                : "text-[var(--c-muted)] hover:bg-[var(--c-panel-soft)]"
            }`}
          >
            <Award className="w-4 h-4" />
            Rewards
          </button>
          <button
            onClick={() => setActiveTab("penalties")}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === "penalties"
                ? "bg-[#FCC10E] text-[#383737]"
                : "text-[var(--c-muted)] hover:bg-[var(--c-panel-soft)]"
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            Penalties
          </button>
        </div>
        <button className="flex items-center gap-2 h-10 px-4 bg-[#FCC10E] text-[#383737] rounded-lg font-medium text-sm hover:bg-[#e5ad0d] transition-colors">
          <Plus className="w-4 h-4" />
          Add New
        </button>
      </div>

      {/* Rewards Table */}
      {activeTab === "rewards" && (
        <div className="bg-[var(--c-panel)] rounded-xl shadow-[var(--shadow-card)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--c-panel-soft)] border-b border-[var(--c-line-soft)]">
                  {["Employee", "Type", "Amount", "Date", "Approved By", "Status"].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-[var(--c-muted)] uppercase tracking-wider py-3 px-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rewards.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--c-line-soft)] hover:bg-[var(--c-panel-soft)] transition-colors">
                    <td className="py-3 px-4 text-sm font-medium text-[var(--c-ink)]">{r.employee}</td>
                    <td className="py-3 px-4 text-sm text-[var(--c-muted)]">{r.type}</td>
                    <td className="py-3 px-4 text-sm font-semibold text-[var(--c-green)]">{r.amount > 0 ? `${r.amount.toLocaleString()} EGP` : "-"}</td>
                    <td className="py-3 px-4 text-sm text-[var(--c-faint)]">{r.date}</td>
                    <td className="py-3 px-4 text-sm text-[var(--c-muted)]">{r.approvedBy}</td>
                    <td className="py-3 px-4"><StatusBadge status={r.status} type="reward" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Penalties Table */}
      {activeTab === "penalties" && (
        <div className="bg-[var(--c-panel)] rounded-xl shadow-[var(--shadow-card)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--c-panel-soft)] border-b border-[var(--c-line-soft)]">
                  {["Employee/Dept", "Type", "Reason", "Date", "Severity", "Status"].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-[var(--c-muted)] uppercase tracking-wider py-3 px-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {penalties.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--c-line-soft)] hover:bg-[var(--c-panel-soft)] transition-colors">
                    <td className="py-3 px-4 text-sm font-medium text-[var(--c-ink)]">{p.employee}</td>
                    <td className="py-3 px-4 text-sm text-[var(--c-muted)]">{p.type}</td>
                    <td className="py-3 px-4 text-sm text-[var(--c-muted)] max-w-[200px] truncate">{p.reason}</td>
                    <td className="py-3 px-4 text-sm text-[var(--c-faint)]">{p.date}</td>
                    <td className="py-3 px-4"><SeverityBadge severity={p.severity} /></td>
                    <td className="py-3 px-4"><StatusBadge status={p.status} type="penalty" /></td>
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

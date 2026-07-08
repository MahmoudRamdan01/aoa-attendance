import { useState } from "react";
import { FileText, Download, Share2, Calendar, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase, todayIso } from "@/lib/supabase";
import { csvCell, dateRangeForPeriod, downloadTextFile, statusLabels } from "@/lib/attendance";
import { useAuthContext } from "@/providers/AuthProvider";
import type { AttendanceRow, EmployeeRow } from "@/types/attendance";
import DemoBadge from "@/components/attendance/DemoBadge";

const recentReports = [
  { id: 1, name: "Monthly Attendance - June 2026", type: "Attendance", date: "2026-07-01", generatedBy: "Sara Mahmoud", format: "PDF" },
  { id: 2, name: "Q2 Performance Review", type: "Performance", date: "2026-06-30", generatedBy: "Mohamed Salah", format: "Excel" },
  { id: 3, name: "Department Headcount Report", type: "Department", date: "2026-06-28", generatedBy: "Sara Mahmoud", format: "PDF" },
  { id: 4, name: "Overtime Analysis - H1 2026", type: "Payroll", date: "2026-06-25", generatedBy: "Rania Tarek", format: "Excel" },
  { id: 5, name: "Recruitment Pipeline Q2", type: "Recruitment", date: "2026-06-20", generatedBy: "Sara Mahmoud", format: "PDF" },
];

const formatColors: Record<string, string> = {
  PDF: "bg-[var(--c-red-bg)] text-[var(--c-red)]",
  Excel: "bg-[var(--c-green-bg)] text-[var(--c-green)]",
  CSV: "bg-[var(--c-blue-bg)] text-[var(--c-blue)]",
};

type ReportPeriod = "week" | "month";

export default function Reports() {
  const { role } = useAuthContext();
  const [reportType, setReportType] = useState("attendance");
  const [dateRange, setDateRange] = useState<ReportPeriod>("month");
  const [busy, setBusy] = useState(false);

  async function fetchRangeData(from: string, to: string) {
    const [att, emp] = await Promise.all([
      supabase.from("attendance").select("*").gte("work_date", from).lte("work_date", to),
      supabase.from("employees").select("id,name,active").order("id"),
    ]);
    if (att.error || emp.error) throw att.error || emp.error;
    return {
      rows: (att.data as AttendanceRow[]) || [],
      employees: (emp.data as EmployeeRow[]) || [],
    };
  }

  async function generateAttendanceReport(period: ReportPeriod) {
    const range = dateRangeForPeriod(period, todayIso());
    const { rows, employees } = await fetchRangeData(range.from, range.to);
    if (rows.length === 0) {
      toast.info("لا توجد سجلات حضور في الفترة المختارة.");
      return;
    }
    const employeeMap = new Map(employees.map((e) => [e.id, e.name]));
    const header = ["التاريخ", "الموظف", "الحالة", "حضور", "انصراف", "تأخير", "خصم أيام"];
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
    );
    downloadTextFile(
      `aoa-attendance-${range.from}-${range.to}.csv`,
      "﻿" + `${header.map(csvCell).join(",")}\n${lines.join("\n")}`
    );
    toast.success("تم تنزيل تقرير الحضور.");
  }

  async function generatePayrollReport(period: ReportPeriod) {
    if (role !== "owner") {
      toast.warning("تقرير الرواتب متاح للـ Owner فقط.");
      return;
    }
    const range = dateRangeForPeriod(period, todayIso());
    const [{ rows, employees }, sal] = await Promise.all([
      fetchRangeData(range.from, range.to),
      supabase.from("salaries").select("employee_id,monthly_salary"),
    ]);
    if (sal.error) throw sal.error;
    const salaries = Object.fromEntries(
      ((sal.data as Array<{ employee_id: number; monthly_salary: number | null }>) || []).map((s) => [
        s.employee_id,
        Number(s.monthly_salary || 0),
      ])
    );
    const active = employees.filter((e) => e.active !== false);
    const rowsByEmployee = rows.reduce((acc, row) => {
      const list = acc.get(row.employee_id) || [];
      list.push(row);
      acc.set(row.employee_id, list);
      return acc;
    }, new Map<number, AttendanceRow[]>());
    const header = ["الموظف", "المرتب الشهري", "خصم أيام", "قيمة الخصم", "الصافي التقديري", "تأخير", "غياب"];
    const lines = active.map((emp) => {
      const employeeRows = rowsByEmployee.get(emp.id) || [];
      const salary = salaries[emp.id] || 0;
      const deductionDays = employeeRows.reduce(
        (sum, row) => sum + Number(row.deduction_days || 0) + (row.status === "absent" ? 1 : 0),
        0
      );
      const deductionAmount = deductionDays * (salary / 30);
      return [
        emp.name,
        salary,
        deductionDays.toFixed(2),
        deductionAmount.toFixed(2),
        Math.max(0, salary - deductionAmount).toFixed(2),
        employeeRows.filter((row) => row.status === "late").length,
        employeeRows.filter((row) => row.status === "absent").length,
      ]
        .map(csvCell)
        .join(",");
    });
    downloadTextFile(
      `aoa-payroll-${range.from}-${range.to}.csv`,
      "﻿" + `${header.map(csvCell).join(",")}\n${lines.join("\n")}`
    );
    toast.success("تم تنزيل تقرير الرواتب.");
  }

  async function runReport(type: string, period: ReportPeriod) {
    setBusy(true);
    try {
      if (type === "attendance") await generateAttendanceReport(period);
      else if (type === "payroll") await generatePayrollReport(period);
      else toast.info("النوع ده لسه بيانات تجريبية — هيتفعل لما نبني جداوله.");
    } catch {
      toast.error("تعذر توليد التقرير.");
    }
    setBusy(false);
  }

  const reportTemplates = [
    { id: "attendance", name: "Attendance Report", nameAr: "تقرير الحضور", icon: "📊", description: "تقرير الحضور الأسبوعي والشهري من البيانات الفعلية", color: "#3b82f6", bg: "#dbeafe", live: true },
    { id: "payroll", name: "Payroll Report", nameAr: "تقرير الرواتب", icon: "💰", description: "المرتبات والخصومات والصافي التقديري (Owner)", color: "#22c55e", bg: "#dcfce7", live: true },
    { id: "performance", name: "Performance Report", nameAr: "تقرير الأداء", icon: "📈", description: "KPI scores, trends, and comparisons", color: "#f97316", bg: "#fef3c7", live: false },
    { id: "recruitment", name: "Recruitment Report", nameAr: "تقرير التوظيف", icon: "🎯", description: "Hiring pipeline, time-to-fill, source analysis", color: "#1e40af", bg: "#dbeafe", live: false },
    { id: "department", name: "Department Summary", nameAr: "ملخص الأقسام", icon: "🏢", description: "Department-wise headcount and performance", color: "#14b8a6", bg: "#ccfbf1", live: false },
    { id: "custom", name: "Custom Report", nameAr: "تقرير مخصص", icon: "⚙️", description: "Build your own report with custom filters", color: "#FCC10E", bg: "#fef9c3", live: false },
  ];

  return (
    <div className="space-y-6">
      {/* Report Templates Grid */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--c-ink)] mb-4">قوالب التقارير</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {reportTemplates.map((template) => (
            <div
              key={template.id}
              onClick={() => !busy && runReport(template.id, dateRange)}
              className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                  style={{ backgroundColor: template.bg }}
                >
                  {template.icon}
                </div>
                {template.live ? (
                  <button
                    className="p-1.5 rounded-lg hover:bg-[var(--c-page)] text-[var(--c-muted)] opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      runReport(template.id, dateRange);
                    }}
                  >
                    <Download className="w-4 h-4" />
                  </button>
                ) : (
                  <DemoBadge />
                )}
              </div>
              <h3 className="text-sm font-semibold text-[var(--c-ink)] mb-0.5">{template.name}</h3>
              <p className="text-xs text-[var(--c-faint)] mb-1">{template.nameAr}</p>
              <p className="text-xs text-[var(--c-muted)]">{template.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Report Builder */}
      <div className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
        <h3 className="text-base font-semibold text-[var(--c-ink)] mb-4">مولّد التقارير</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-[var(--c-muted)] mb-2 block">نوع التقرير</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[var(--c-line)] text-sm focus:border-[#FCC10E] outline-none bg-[var(--c-panel)]"
            >
              <option value="attendance">الحضور (فعلي)</option>
              <option value="payroll">الرواتب (فعلي — Owner)</option>
              <option value="performance">الأداء (تجريبي)</option>
              <option value="recruitment">التوظيف (تجريبي)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--c-muted)] mb-2 block">الفترة</label>
            <div className="relative">
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-faint)]" />
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as ReportPeriod)}
                className="w-full h-10 pr-10 pl-3 rounded-lg border border-[var(--c-line)] text-sm focus:border-[#FCC10E] outline-none bg-[var(--c-panel)] appearance-none"
              >
                <option value="week">هذا الأسبوع</option>
                <option value="month">هذا الشهر</option>
              </select>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => runReport(reportType, dateRange)}
            disabled={busy}
            className="h-10 px-6 bg-[#FCC10E] text-[#383737] rounded-lg font-medium text-sm hover:bg-[#e5ad0d] transition-colors disabled:opacity-50"
          >
            {busy ? "جاري التوليد..." : "توليد التقرير"}
          </button>
          <button
            onClick={() => window.print()}
            className="h-10 px-6 border border-[var(--c-line)] text-[var(--c-muted)] rounded-lg font-medium text-sm hover:bg-[var(--c-panel-soft)] transition-colors"
          >
            طباعة PDF
          </button>
        </div>
      </div>

      {/* Recent Reports — mock */}
      <div className="bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-[var(--c-ink)]">Recent Reports</h3>
            <DemoBadge />
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--c-muted)]">
            <Clock className="w-3.5 h-3.5" />
            Last 30 days
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[var(--c-panel-soft)] border-b border-[var(--c-line-soft)]">
                {["Report Name", "Type", "Generated Date", "Generated By", "Format", "Actions"].map((h) => (
                  <th key={h} className="text-right text-xs font-medium text-[var(--c-muted)] uppercase tracking-wider py-3 px-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentReports.map((report) => (
                <tr key={report.id} className="border-b border-[var(--c-line-soft)] hover:bg-[var(--c-panel-soft)] transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[var(--c-blue-bg)] flex items-center justify-center">
                        <FileText className="w-4 h-4 text-[var(--c-blue)]" />
                      </div>
                      <span className="text-sm font-medium text-[var(--c-ink)]">{report.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-[var(--c-muted)]">{report.type}</td>
                  <td className="py-3 px-4 text-sm text-[var(--c-faint)]" dir="ltr">{report.date}</td>
                  <td className="py-3 px-4 text-sm text-[var(--c-muted)]">{report.generatedBy}</td>
                  <td className="py-3 px-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${formatColors[report.format] || "bg-[var(--c-page)] text-[var(--c-muted)]"}`}>
                      {report.format}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <button className="p-1.5 rounded-lg hover:bg-[var(--c-page)] text-[var(--c-muted)] hover:text-[var(--c-blue)]">
                        <Download className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-[var(--c-page)] text-[var(--c-muted)] hover:text-[var(--c-blue)]">
                        <Share2 className="w-4 h-4" />
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

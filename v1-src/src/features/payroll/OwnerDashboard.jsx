import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Banknote, BarChart3, CalendarDays, ChevronLeft, Clock3, Coins, Download, FileSpreadsheet, Inbox, PiggyBank, Wallet, TrendingUp, UserPlus, Users } from "lucide-react";
import { supabase, todayIso } from "../../lib/supabase";
import { cls } from "../../lib/cls";
import { computePayroll, getPayrollConfig } from "../../lib/payroll";
import { dateRangeForPeriod, datesBetween } from "../../lib/dates";
import { csvCell, downloadTextFile, money } from "../../lib/format";
import { roleNames, roleOptions, statusLabels } from "../../lib/labels";
import { Bar, Metric, StatusBadge } from "../../ui/legacy";
import { Area, AreaChart, Bar as ReBar, BarChart as ReBarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import CompanyReports from "./CompanyReports";
import EmployeeStatement from "./EmployeeStatement";
import PulseStrip from "./PulseStrip";
import { CollapsiblePanel, Skeleton, SkeletonTableRows } from "../../ui/primitives";

function OwnerDashboard({ onToast }) {
  const [rows, setRows] = useState([]);
  const [salaries, setSalaries] = useState({});
  const [employees, setEmployees] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [finRows, setFinRows] = useState([]);
  const [report, setReport] = useState(null);
  // Payroll mode (monthly / daily-allowance) from the company database.
  const [payConfig, setPayConfig] = useState(null);
  useEffect(() => { getPayrollConfig().then(setPayConfig); }, []);
  const [period, setPeriod] = useState("month");
  const [reportDate, setReportDate] = useState(todayIso());
  const [customRange, setCustomRange] = useState({ from: `${todayIso().slice(0, 7)}-01`, to: todayIso() });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Spec 06 §C: a payroll row opens كشف حساب for that employee.
  const [focusEmployee, setFocusEmployee] = useState(null);
  // Narrow screens squeeze the employee bar chart — shrink its Arabic Y-axis.
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 640px)").matches);
  // Brand accent for charts, resolved at runtime so the airocean magenta build
  // stays on-brand (SVG presentation attributes can't consume var()).
  const brandGold = useMemo(
    () => getComputedStyle(document.documentElement).getPropertyValue("--gold").trim() || "#FCC107",
    []
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = (event) => setNarrow(event.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  const range = useMemo(() => {
    if (period === "range") {
      const from = customRange.from;
      const to = customRange.to < from ? from : customRange.to;
      return { from, to, label: "الفترة المحددة" };
    }
    return dateRangeForPeriod(period, reportDate);
  }, [period, reportDate, customRange.from, customRange.to]);
  // «نبض الشركة» is a month-keyed report; a custom range uses its start month.
  const reportMonth = (period === "range" ? customRange.from : reportDate).slice(0, 7);

  // Owner-only cross-month analytics (history + financial + requests + security).
  useEffect(() => {
    let active = true;
    supabase.rpc("owner_reports_v1", { p_month: reportMonth }).then(({ data, error: err }) => {
      if (active && !err && data) setReport(data);
    });
    return () => { active = false; };
  }, [reportMonth]);

  // Pending approvals count for the «بانتظار قرارك» entry card (spec C-2).
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("permissions").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]).then(([l, p]) => {
      if (active) setPendingCount((l.count || 0) + (p.count || 0));
    }).catch(() => {});
    return () => { active = false; };
  }, [reportMonth, loading]);

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([
      supabase.from("attendance").select("*").gte("work_date", range.from).lte("work_date", range.to),
      supabase.from("salaries").select("*"),
      supabase.from("employees").select("id,name,active,attendance_exempt").eq("active", true).order("id"),
      supabase.from("official_holidays").select("holiday_date,label").gte("holiday_date", range.from).lte("holiday_date", range.to),
      // Financial deductions in range. !inner is required so voided loans are excluded.
      supabase.from("emp_loan_installments")
        .select("employee_id,amount,due_month,loan:emp_loans!inner(status)")
        .gte("due_month", range.from.slice(0, 7)).lte("due_month", range.to.slice(0, 7))
        .eq("loan.status", "active"),
      supabase.from("canteen_entries").select("employee_id,amount")
        .eq("status", "active").gte("entry_date", range.from).lte("entry_date", range.to),
      supabase.from("other_deductions").select("employee_id,amount")
        .eq("status", "active").gte("entry_date", range.from).lte("entry_date", range.to),
    ]).then(([att, sal, emp, hol, inst, cant, other]) => {
      const failed = [att, sal, emp, hol, inst, cant, other].find((item) => item.error);
      if (failed) throw failed.error;
      setRows(att.data || []);
      setSalaries(Object.fromEntries((sal.data || []).map((s) => [s.employee_id, s])));
      setEmployees(emp.data || []);
      setHolidays(hol.data || []);
      setFinRows([...(inst.data || []), ...(cant.data || []), ...(other.data || [])]);
      setLoading(false);
    }).catch((err) => {
      setError(err.message || "تعذر تحميل تقارير المالك.");
      setLoading(false);
    });
  }, [range.from, range.to]);

  const stats = useMemo(() => {
    const holidaySet = new Set(holidays.map((item) => item.holiday_date));
    const workDates = datesBetween(range.from, range.to).filter((day) => {
      const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
      return dow !== 5 && !holidaySet.has(day);
    });
    // Exempt (payroll-only) employees don't count toward expected attendance.
    const attendanceEmployees = employees.filter((emp) => !emp.attendance_exempt);
    const expected = attendanceEmployees.length * workDates.length;
    const employeeMap = new Map(employees.map((emp) => [emp.id, emp.name]));
    const total = rows.length;
    const checkedIn = rows.filter((r) => r.check_in).length;
    const absent = rows.filter((r) => r.status === "absent").length;
    const late = rows.filter((r) => r.status === "late").length;
    const leave = rows.filter((r) => ["leave", "mission", "sick"].includes(r.status)).length;
    const missingCheckout = rows.filter((r) => r.check_in && !r.check_out && ["present", "late"].includes(r.status)).length;
    const deductionDays = rows.reduce((sum, r) => sum + Number(r.deduction_days || 0) + (r.status === "absent" ? 1 : 0), 0);
    const lateByEmployee = rows.reduce((acc, row) => {
      if (row.status !== "late") return acc;
      const current = acc.get(row.employee_id) || { employee_id: row.employee_id, name: employeeMap.get(row.employee_id) || `#${row.employee_id}`, count: 0, minutes: 0 };
      current.count += 1;
      current.minutes += Number(row.late_minutes || 0);
      acc.set(row.employee_id, current);
      return acc;
    }, new Map());
    const rowsByEmployee = rows.reduce((acc, row) => {
      const list = acc.get(row.employee_id) || [];
      list.push(row);
      acc.set(row.employee_id, list);
      return acc;
    }, new Map());
    // Financial deductions (loan installments + canteen + other) summed per employee.
    const finByEmployee = finRows.reduce((acc, row) => {
      acc.set(row.employee_id, (acc.get(row.employee_id) || 0) + Number(row.amount || 0));
      return acc;
    }, new Map());
    const financialTotal = [...finByEmployee.values()].reduce((sum, value) => sum + value, 0);
    const payrollRows = employees.map((emp) => {
      const employeeRows = rowsByEmployee.get(emp.id) || [];
      const salaryRow = salaries[emp.id] || {};
      const financialDeduction = finByEmployee.get(emp.id) || 0;
      // Salary math (monthly vs daily-allowance) lives in lib/payroll.js.
      const pay = computePayroll({
        config: payConfig,
        salaryRow,
        attendanceRows: employeeRows,
        financialTotal: financialDeduction,
      });
      return {
        employee_id: emp.id,
        name: emp.name,
        exempt: !!emp.attendance_exempt,
        salary: Number(salaryRow.monthly_salary || 0),
        gross: pay.gross,
        allowanceEarned: pay.allowanceEarned,
        creditedDays: pay.creditedDays,
        dayRate: pay.dayRate,
        extras: (pay.fixedAllowance || 0) + (pay.bonus || 0),
        deductionDays: pay.deductionDays,
        deductionAmount: pay.attendanceDeduction,
        financialDeduction,
        netSalary: pay.net,
        present: employeeRows.filter((row) => row.check_in).length,
        late: employeeRows.filter((row) => row.status === "late").length,
        absent: employeeRows.filter((row) => row.status === "absent").length,
        missingCheckout: employeeRows.filter((row) => row.check_in && !row.check_out && ["present", "late"].includes(row.status)).length,
      };
    }).sort((a, b) => (b.deductionAmount + b.financialDeduction) - (a.deductionAmount + a.financialDeduction) || a.name.localeCompare(b.name, "ar"));
    const deductions = payrollRows.reduce((sum, row) => sum + row.deductionAmount, 0);
    // إجمالي المرتبات قبل أي خصم (شامل بدل الانتظام في نظام الأساسي+الانتظام)
    // وبعد كل الخصومات (الصافي التقديري).
    const grossTotal = payrollRows.reduce((sum, row) => sum + row.gross, 0);
    const netTotal = payrollRows.reduce((sum, row) => sum + row.netSalary, 0);
    return {
      payMode: payConfig?.mode === "daily" ? "daily" : "monthly",
      total,
      expected,
      checkedIn,
      absent,
      late,
      leave,
      missingCheckout,
      deductionDays,
      deductions,
      financialTotal,
      grossTotal,
      netTotal,
      attendanceRate: expected ? Math.round(((checkedIn + leave) / expected) * 100) : 0,
      lateByEmployee: [...lateByEmployee.values()].sort((a, b) => b.count - a.count || b.minutes - a.minutes).slice(0, 5),
      payrollRows,
    };
  }, [rows, salaries, employees, holidays, finRows, range.from, range.to, payConfig]);

  // Daily series for the trend chart (skips Fridays; empty workdays render as zeros).
  const dailyData = useMemo(() => {
    const byDate = new Map();
    rows.forEach((row) => {
      const entry = byDate.get(row.work_date) || { present: 0, late: 0, absent: 0 };
      if (row.check_in) entry.present += 1;
      if (row.status === "late") entry.late += 1;
      if (row.status === "absent") entry.absent += 1;
      byDate.set(row.work_date, entry);
    });
    return datesBetween(range.from, range.to)
      .filter((day) => new Date(`${day}T00:00:00Z`).getUTCDay() !== 5)
      .map((day) => ({
        day: `${day.slice(8)}/${day.slice(5, 7)}`,
        ...(byDate.get(day) || { present: 0, late: 0, absent: 0 }),
      }));
  }, [rows, range.from, range.to]);

  // With ~50 people a full vertical bar chart towers over the phone screen —
  // show the most active few and let the owner expand on demand.
  const TOP_BARS_LIMIT = 12;
  const [showAllBars, setShowAllBars] = useState(false);
  const employeeBars = useMemo(
    () =>
      stats.payrollRows
        .filter((row) => !row.exempt)
        .sort((a, b) => b.present - a.present || a.name.localeCompare(b.name, "ar"))
        .map((row) => ({ name: row.name, حضور: row.present, تأخير: row.late, غياب: row.absent })),
    [stats.payrollRows]
  );
  const visibleBars = showAllBars ? employeeBars : employeeBars.slice(0, TOP_BARS_LIMIT);

  // Owner feedback (review round 1): the day-records Excel/PDF exports were
  // removed from «تقارير وتحليلات»; «Excel مرتبات» below stays.

  function exportPayrollCsv() {
    const daily = stats.payMode === "daily";
    const header = daily
      ? ["الموظف", "الأساسي", "الانتظام", "أيام محتسبة", "بدلات ومكافآت", "الإجمالي", "خصم أيام", "قيمة الخصم", "استقطاعات مالية", "الصافي التقديري", "تأخير", "غياب", "بدون انصراف"]
      : ["الموظف", "المرتب الشهري", "خصم أيام", "قيمة الخصم", "استقطاعات مالية", "الصافي التقديري", "تأخير", "غياب", "بدون انصراف"];
    const lines = stats.payrollRows.map((row) => [
      row.name,
      row.salary,
      ...(daily ? [row.allowanceEarned.toFixed(2), row.creditedDays, row.extras.toFixed(2), row.gross.toFixed(2)] : []),
      row.deductionDays.toFixed(2),
      row.deductionAmount.toFixed(2),
      row.financialDeduction.toFixed(2),
      row.netSalary.toFixed(2),
      row.late,
      row.absent,
      row.missingCheckout,
    ].map(csvCell).join(","));
    downloadTextFile(`aoa-payroll-${range.from}-${range.to}.csv`, `\ufeff${header.map(csvCell).join(",")}\n${lines.join("\n")}`);
  }

  const activeCount = employees.length;
  const deductionPct = stats.grossTotal > 0 ? Math.round(((stats.grossTotal - stats.netTotal) / stats.grossTotal) * 100) : 0;

  return (
    <div className="payroll-screen">
      {error && <div className="setup-banner">{error}</div>}

      {/* Screen title (design ref 04) */}
      <div className="scr-head">
        <h2>الرواتب والتقارير</h2>
      </div>

      {/* Live pulse (spec C-1) */}
      <PulseStrip expected={employees.filter((emp) => !emp.attendance_exempt).length} />

      {/* بانتظار قرارك (spec C-2) → approvals inbox */}
      <button type="button" className="approvals-entry" onClick={() => { window.location.hash = "inbox"; }}>
        <span className="approvals-entry-icon"><Inbox size={17} aria-hidden="true" /></span>
        <span className="approvals-entry-copy">
          <strong>بانتظار قرارك</strong>
          <span>{pendingCount > 0 ? `${pendingCount} طلبات معلقة — اضغط للمراجعة` : "لا توجد طلبات معلقة"}</span>
        </span>
        <ChevronLeft size={15} aria-hidden="true" />
      </button>

      {/* Period segmented pill (design) + the functional date pickers */}
      <div className="seg-pill seg-pill-block">
        <button type="button" className={cls(period === "day" && "active")} onClick={() => setPeriod("day")}>يومي</button>
        <button type="button" className={cls(period === "week" && "active")} onClick={() => setPeriod("week")}>أسبوعي</button>
        <button type="button" className={cls(period === "month" && "active")} onClick={() => setPeriod("month")}>شهري</button>
        <button type="button" className={cls(period === "range" && "active")} onClick={() => setPeriod("range")}>فترة</button>
      </div>
      <div className="period-dates">
        {period === "range" ? (
          <>
            <input
              type="date"
              value={customRange.from}
              aria-label="من تاريخ"
              title="من تاريخ"
              onChange={(e) => setCustomRange((r) => ({ from: e.target.value, to: r.to < e.target.value ? e.target.value : r.to }))}
            />
            <input
              type="date"
              value={customRange.to}
              min={customRange.from}
              aria-label="إلى تاريخ"
              title="إلى تاريخ"
              onChange={(e) => setCustomRange((r) => ({ ...r, to: e.target.value }))}
            />
          </>
        ) : (
          <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
        )}
      </div>

      {/* Hero: net payroll (spec C-4) — chip inline in the label row */}
      <section className="payroll-hero">
        <div className="payroll-hero-top">
          <span className="payroll-hero-label">صافي المرتبات — {range.label}</span>
          {deductionPct > 0 ? <span className="payroll-hero-chip">خصومات −{deductionPct}%</span> : null}
        </div>
        <p className="payroll-hero-value">
          <strong><bdi dir="ltr">{money(stats.netTotal)}</bdi></strong>
          <span>ج.م</span>
        </p>
        <p className="payroll-hero-sub">قبل الخصومات {money(stats.grossTotal)} ج · {activeCount} موظفين نشطين</p>
      </section>

      {/* KPI 2×2 (spec C-5) — the rest of the old metric wall lives below */}
      <div className="kpi-grid">
        <div className="kpi-card"><span className="kpi-dot tone-ok" /> <span className="kpi-label">التغطية</span><strong><bdi dir="ltr">{stats.attendanceRate}%</bdi></strong></div>
        <div className="kpi-card"><span className="kpi-dot tone-warn" /> <span className="kpi-label">تأخيرات</span><strong>{stats.late}</strong></div>
        <div className="kpi-card"><span className="kpi-dot tone-danger" /> <span className="kpi-label">بدون انصراف</span><strong>{stats.missingCheckout}</strong></div>
        <div className="kpi-card"><span className="kpi-dot tone-warn" /> <span className="kpi-label">خصومات الفترة</span><strong><bdi dir="ltr">{money(stats.deductions + stats.financialTotal)}</bdi> ج</strong></div>
      </div>

      <CollapsiblePanel icon={Activity} title="مؤشرات إضافية" subtitle={`${range.label}`}>
        <div className="stats-grid">
          <Metric label={`سجلات ${range.label}`} value={`${stats.total}/${stats.expected}`} icon={CalendarDays} />
          <Metric label="خصم أيام" value={stats.deductionDays.toFixed(2)} tone="warn" icon={TrendingUp} />
          <Metric label="خصومات تقديرية" value={`${money(stats.deductions)} ج`} tone="gold" icon={Banknote} />
          <Metric label="استقطاعات مالية" value={`${money(stats.financialTotal)} ج`} tone="gold" icon={Wallet} />
          <Metric label="إجمالي قبل الخصومات" value={`${money(stats.grossTotal)} ج`} icon={Coins} />
          <Metric label="إجمالي بعد الخصومات" value={`${money(stats.netTotal)} ج`} tone="ok" icon={PiggyBank} />
        </div>
      </CollapsiblePanel>

      <div className="grid two">
        <section className="panel">
          <div className="panel-title"><TrendingUp size={20} /><h2>اتجاه الحضور — {range.label}</h2></div>
          {dailyData.length > 0 ? (
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={dailyData} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(180,196,210,0.1)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                  <ChartTooltip />
                  <Area type="monotone" dataKey="present" name="حضور" stroke={brandGold} fill={brandGold} fillOpacity={0.12} strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="muted">لا توجد بيانات في الفترة.</p>
          )}
        </section>
        <section className="panel">
          <div className="panel-title"><BarChart3 size={20} /><h2>تحليل سريع</h2></div>
          <Bar label="الحضور" value={stats.checkedIn + stats.leave} max={Math.max(stats.expected, 1)} />
          <Bar label="التأخير" value={stats.late} max={Math.max(stats.total, 1)} tone="warn" />
          <Bar label="غياب مسجل" value={stats.absent} max={Math.max(stats.total, 1)} tone="danger" />
          <Bar label="بدون انصراف" value={stats.missingCheckout} max={Math.max(stats.total, 1)} tone="danger" />
        </section>
      </div>
      <CollapsiblePanel icon={Users} title={`حضور الموظفين (${range.label})`} subtitle={`${employeeBars.length} موظف`}>
        {employeeBars.length > 0 ? (
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={Math.max(180, visibleBars.length * 34 + 40)}>
              <ReBarChart data={visibleBars} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  orientation="right"
                  width={narrow ? 68 : 92}
                  tick={{ fontSize: narrow ? 11 : 12 }}
                  tickFormatter={narrow ? (name) => (String(name).length > 8 ? `${String(name).slice(0, 8)}…` : name) : undefined}
                />
                <ChartTooltip />
                <ReBar dataKey="حضور" fill="#FCC107" radius={[0, 6, 6, 0]} barSize={12} />
                <ReBar dataKey="تأخير" fill="#F59E0B" radius={[0, 6, 6, 0]} barSize={12} />
                <ReBar dataKey="غياب" fill="#EF4444" radius={[0, 6, 6, 0]} barSize={12} />
              </ReBarChart>
            </ResponsiveContainer>
            {employeeBars.length > TOP_BARS_LIMIT && (
              <button className="secondary chart-expand" type="button" onClick={() => setShowAllBars((v) => !v)}>
                {showAllBars ? "عرض الأعلى فقط" : `عرض كل الموظفين (${employeeBars.length})`}
              </button>
            )}
          </div>
        ) : (
          <p className="muted">لا توجد بيانات موظفين في الفترة.</p>
        )}
      </CollapsiblePanel>
      {/* Mobile: ONE card with hairline rows (design); the full table ≥640px */}
      <section className="payroll-card-list">
        <div className="payroll-card-list-head">
          <strong>المرتبات والخصومات</strong>
          <span>الصافي التقديري</span>
        </div>
        <div className="payroll-cards">
          {loading ? (
            [0, 1, 2].map((i) => (
              <div className="payroll-card-row" key={i}>
                <Skeleton width={34} height={34} radius={10} />
                <span style={{ flex: 1, display: "grid", gap: 6 }}>
                  <Skeleton width="42%" height={12} />
                  <Skeleton width="64%" height={9} />
                </span>
                <Skeleton width={64} height={14} />
              </div>
            ))
          ) : stats.payrollRows.length === 0 ? (
            <p className="muted">لا توجد بيانات مرتبات.</p>
          ) : (
            <>
              {stats.payrollRows.map((row) => {
                const totalCut = row.deductionAmount + row.financialDeduction;
                return (
                  <button
                    type="button"
                    className="payroll-card-row"
                    key={row.employee_id}
                    onClick={() => setFocusEmployee({ id: row.employee_id, at: Date.now() })}
                    aria-label={`كشف حساب ${row.name}`}
                  >
                    <span className="payroll-initial" aria-hidden="true">{String(row.name).trim().charAt(0)}</span>
                    <span className="payroll-copy">
                      <strong>{row.name}</strong>
                      <span>
                        {row.late} تأخير · {row.absent} غياب{row.missingCheckout ? ` · ${row.missingCheckout} بدون انصراف` : ""}{row.exempt ? " · معفى" : ""}
                      </span>
                    </span>
                    <span className="payroll-amounts">
                      <strong><bdi dir="ltr">{money(row.netSalary)}</bdi> ج</strong>
                      {totalCut > 0
                        ? <i className="is-cut">خصم {money(totalCut)} ج</i>
                        : <i className="is-ok">مكتمل</i>}
                    </span>
                    <ChevronLeft size={14} className="payroll-row-chevron" aria-hidden="true" />
                  </button>
                );
              })}
              <div className="payroll-cards-foot">
                <span>الإجمالي بعد الخصومات</span>
                <strong><bdi dir="ltr">{money(stats.netTotal)}</bdi> ج</strong>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="panel payroll-table-panel">
        <div className="panel-title between">
          <div><Banknote size={20} /><h2>المرتبات والخصومات</h2></div>
          <button className="secondary" onClick={exportPayrollCsv} disabled={loading || stats.payrollRows.length === 0}>
            <FileSpreadsheet size={16} /> Excel مرتبات
          </button>
        </div>
        <div className="table-wrap sticky-table payroll-table">
          <table>
            <thead>
              {/* نظام «أساسي + انتظام»: الأساسي والانتظام أعمدة منفصلة والخصم من الإجمالي. */}
              {stats.payMode === "daily" ? (
                <tr>
                  <th>الموظف</th>
                  <th>الأساسي</th>
                  <th>الانتظام</th>
                  <th>بدلات ومكافآت</th>
                  <th>الإجمالي</th>
                  <th>خصم أيام</th>
                  <th>قيمة الخصم</th>
                  <th>استقطاعات مالية</th>
                  <th>الصافي التقديري</th>
                  <th>مؤشرات</th>
                </tr>
              ) : (
                <tr>
                  <th>الموظف</th>
                  <th>المرتب الشهري</th>
                  <th>خصم أيام</th>
                  <th>قيمة الخصم</th>
                  <th>استقطاعات مالية</th>
                  <th>الصافي التقديري</th>
                  <th>مؤشرات</th>
                </tr>
              )}
            </thead>
            <tbody>
              {loading && <SkeletonTableRows colSpan={stats.payMode === "daily" ? 10 : 7} />}
              {!loading && stats.payrollRows.length === 0 && <tr><td colSpan={stats.payMode === "daily" ? 10 : 7}>لا توجد بيانات مرتبات.</td></tr>}
              {!loading && stats.payrollRows.map((row) => (
                <tr key={row.employee_id}>
                  <td>{row.name}</td>
                  <td>{money(row.salary)} ج</td>
                  {stats.payMode === "daily" && (
                    <>
                      <td>
                        {money(row.allowanceEarned)} ج
                        {row.dayRate > 0 && <div className="muted" style={{ fontSize: "11.5px" }}>{row.creditedDays} يوم × {money(row.dayRate)}</div>}
                      </td>
                      <td>{money(row.extras)} ج</td>
                      <td><strong>{money(row.gross)} ج</strong></td>
                    </>
                  )}
                  <td>{row.deductionDays.toFixed(2)} يوم</td>
                  <td>{money(row.deductionAmount)} ج</td>
                  <td>{money(row.financialDeduction)} ج</td>
                  <td><strong>{money(row.netSalary)} ج</strong></td>
                  <td>{row.late} تأخير · {row.absent} غياب · {row.missingCheckout} بدون انصراف</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="lates-card">
        <strong className="lates-title">أعلى التأخيرات</strong>
        {stats.lateByEmployee.length === 0 && <p className="muted lates-empty">لا توجد تأخيرات في الفترة.</p>}
        {stats.lateByEmployee.map((item, index) => (
          <div className="lates-row" key={item.employee_id}>
            <span className="lates-rank" aria-hidden="true">{index + 1}</span>
            <span className="lates-name">{item.name}</span>
            <span className="lates-meta" dir="ltr">{item.count} مرات · {item.minutes} د</span>
          </div>
        ))}
      </section>

      {/* «نبض الشركة» monthly report block (unchanged), after the flagship flow */}
      <CompanyReports
        report={report}
        rows={rows}
        employees={employees}
        salaries={salaries}
        stats={stats}
        range={range}
        loading={loading}
      />

      <EmployeeStatement onToast={onToast} focusEmployee={focusEmployee} />
      <AccountManager onToast={onToast} />
    </div>
  );
}

function AccountManager({ onToast }) {
  const [employees, setEmployees] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({ employeeId: "", email: "", password: "", role: "employee" });
  const [busy, setBusy] = useState(false);
  const [lastCreated, setLastCreated] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const [revealNew, setRevealNew] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    const [emp, acc] = await Promise.all([
      supabase.from("employees").select("id,name,active").eq("active", true).order("id"),
      supabase.rpc("owner_list_employee_accounts_v1"),
    ]);
    setEmployees(emp.data || []);
    setAccounts(acc.data || []);
    if (!form.employeeId && emp.data?.[0]) {
      setForm((current) => ({ ...current, employeeId: String(emp.data[0].id) }));
    }
  }

  // Owner grants/revokes HR for an existing linked account.
  async function changeRole(employeeId, nextRole) {
    setBusy(true);
    const { data, error } = await supabase.rpc("owner_set_role_v1", {
      p_employee_id: employeeId,
      p_role: nextRole,
    });
    setBusy(false);
    if (error || data?.error) {
      onToast(data?.message || "تعذر تغيير الصلاحية.");
      return;
    }
    onToast(nextRole === "hr" ? `تم منح صلاحيات HR لـ ${data.employee}.` : `تم إرجاع ${data.employee} إلى موظف.`);
    loadAccounts();
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    // Create the login (email + password) AND link it in one step.
    const { data, error } = await supabase.rpc("owner_create_employee_login_v1", {
      p_employee_id: Number(form.employeeId),
      p_email: form.email.trim(),
      p_password: form.password,
      p_role: form.role,
    });
    setBusy(false);
    if (error || data?.error) {
      onToast(data?.message || "تعذر إنشاء الحساب.");
      return;
    }
    const empName = employees.find((emp) => String(emp.id) === String(form.employeeId))?.name || "";
    setLastCreated({ name: empName, email: form.email.trim(), password: form.password });
    setRevealNew(false);
    setForm((current) => ({ ...current, email: "", password: "" }));
    onToast("تم إنشاء حساب الدخول.");
    loadAccounts();
  }

  return (
    <section className="panel">
      <div className="panel-title"><UserPlus size={20} /><h2>حسابات الموظفين</h2></div>
      <p className="muted">أنشئ بريدًا إلكترونيًا وكلمة مرور لأي موظف مباشرة. سلّمه البيانات واطلب منه تغيير كلمة المرور بعد أول تسجيل دخول.</p>
      <form className="form account-form" onSubmit={submit}>
        <label>الموظف<select value={form.employeeId} onChange={(e) => setForm((current) => ({ ...current, employeeId: e.target.value }))}>{employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}</select></label>
        <label>البريد الإلكتروني<input dir="ltr" type="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} required placeholder="employee@airocean.com" /></label>
        <label>كلمة المرور
          <span className="pw-field">
            <input dir="ltr" type={showPw ? "text" : "password"} autoComplete="new-password" value={form.password} onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))} required minLength={6} placeholder="6 حروف على الأقل" />
            <button type="button" className="link" onClick={() => setShowPw((v) => !v)}>{showPw ? "إخفاء" : "إظهار"}</button>
          </span>
        </label>
        <label>الدور<select value={form.role} onChange={(e) => setForm((current) => ({ ...current, role: e.target.value }))}>{roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
        <button className="primary" disabled={busy}>{busy ? "جارٍ الإنشاء..." : "إنشاء حساب دخول"}</button>
      </form>
      {lastCreated && (
        <div className="setup-banner" dir="rtl">
          تم إنشاء حساب <strong>{lastCreated.name}</strong> — البريد الإلكتروني: <bdi dir="ltr">{lastCreated.email}</bdi> · كلمة المرور:{" "}
          {revealNew
            ? <bdi dir="ltr">{lastCreated.password}</bdi>
            : <button type="button" className="link" onClick={() => setRevealNew(true)}>••••••• (اضغط للعرض)</button>}
          . سلّمها للموظف واطلب منه تغييرها بعد أول دخول.
          <button type="button" className="link" style={{ marginInlineStart: 10 }} onClick={() => { setLastCreated(null); setRevealNew(false); }}>تم</button>
        </div>
      )}
      <div className="table-wrap cards-on-mobile">
        <table>
          <thead><tr><th>الموظف</th><th>البريد الإلكتروني</th><th>الدور</th><th>الحالة</th><th>الصلاحية</th></tr></thead>
          <tbody>
            {accounts.map((row) => {
              const effectiveRole = row.admin_role || row.role || "employee";
              const isOwnerAccount = effectiveRole === "owner";
              return (
                <tr key={row.employee_id}>
                  <td data-label="الموظف">{row.employee_name}</td>
                  <td data-label="البريد" dir="ltr">{row.email || "-"}</td>
                  <td data-label="الدور">{roleNames[effectiveRole] || effectiveRole}</td>
                  <td data-label="الحالة">{row.user_id ? <StatusBadge status="approved" /> : "غير مربوط"}</td>
                  <td data-label="الصلاحية">
                    {isOwnerAccount || !row.user_id ? "—" : (
                      <select
                        value={effectiveRole === "hr" ? "hr" : "employee"}
                        disabled={busy}
                        onChange={(e) => changeRole(row.employee_id, e.target.value)}
                      >
                        <option value="employee">موظف</option>
                        <option value="hr">HR</option>
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default OwnerDashboard;

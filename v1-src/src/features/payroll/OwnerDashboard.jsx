import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Banknote, BarChart3, CalendarDays, Clock3, Download, FileSpreadsheet, Wallet, TrendingUp, UserPlus, Users } from "lucide-react";
import { supabase, todayIso } from "../../lib/supabase";
import { cls } from "../../lib/cls";
import { dateRangeForPeriod, datesBetween } from "../../lib/dates";
import { csvCell, downloadTextFile, money } from "../../lib/format";
import { roleNames, roleOptions, statusLabels } from "../../lib/labels";
import { Bar, Metric, StatusBadge } from "../../ui/legacy";
import { Area, AreaChart, Bar as ReBar, BarChart as ReBarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";

function OwnerDashboard({ onToast }) {
  const [rows, setRows] = useState([]);
  const [salaries, setSalaries] = useState({});
  const [employees, setEmployees] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [finRows, setFinRows] = useState([]);
  const [period, setPeriod] = useState("month");
  const [reportDate, setReportDate] = useState(todayIso());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const range = useMemo(() => dateRangeForPeriod(period, reportDate), [period, reportDate]);

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([
      supabase.from("attendance").select("*").gte("work_date", range.from).lte("work_date", range.to),
      supabase.from("salaries").select("employee_id,monthly_salary"),
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
      setSalaries(Object.fromEntries((sal.data || []).map((s) => [s.employee_id, Number(s.monthly_salary || 0)])));
      setEmployees(emp.data || []);
      setHolidays(hol.data || []);
      setFinRows([...(inst.data || []), ...(cant.data || []), ...(other.data || [])]);
      setLoading(false);
    }).catch((err) => {
      setError(err.message || "تعذر تحميل تقارير الـ Owner.");
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
    const deductions = rows.reduce((sum, r) => {
      const days = Number(r.deduction_days || 0) + (r.status === "absent" ? 1 : 0);
      return sum + days * ((salaries[r.employee_id] || 0) / 30);
    }, 0);
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
      const salary = salaries[emp.id] || 0;
      const empDeductionDays = employeeRows.reduce((sum, row) => (
        sum + Number(row.deduction_days || 0) + (row.status === "absent" ? 1 : 0)
      ), 0);
      const empDeductionAmount = empDeductionDays * (salary / 30);
      const financialDeduction = finByEmployee.get(emp.id) || 0;
      return {
        employee_id: emp.id,
        name: emp.name,
        exempt: !!emp.attendance_exempt,
        salary,
        deductionDays: empDeductionDays,
        deductionAmount: empDeductionAmount,
        financialDeduction,
        netSalary: Math.max(0, salary - empDeductionAmount - financialDeduction),
        present: employeeRows.filter((row) => row.check_in).length,
        late: employeeRows.filter((row) => row.status === "late").length,
        absent: employeeRows.filter((row) => row.status === "absent").length,
        missingCheckout: employeeRows.filter((row) => row.check_in && !row.check_out && ["present", "late"].includes(row.status)).length,
      };
    }).sort((a, b) => (b.deductionAmount + b.financialDeduction) - (a.deductionAmount + a.financialDeduction) || a.name.localeCompare(b.name, "ar"));
    return {
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
      attendanceRate: expected ? Math.round(((checkedIn + leave) / expected) * 100) : 0,
      lateByEmployee: [...lateByEmployee.values()].sort((a, b) => b.count - a.count || b.minutes - a.minutes).slice(0, 5),
      payrollRows,
    };
  }, [rows, salaries, employees, holidays, finRows, range.from, range.to]);

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

  const employeeBars = useMemo(
    () =>
      stats.payrollRows
        .filter((row) => !row.exempt)
        .sort((a, b) => b.present - a.present || a.name.localeCompare(b.name, "ar"))
        .map((row) => ({ name: row.name, حضور: row.present, تأخير: row.late, غياب: row.absent })),
    [stats.payrollRows]
  );

  function exportCsv() {
    const employeeMap = new Map(employees.map((emp) => [emp.id, emp.name]));
    const header = ["التاريخ", "الموظف", "الحالة", "حضور", "انصراف", "تأخير", "خصم أيام"];
    const lines = rows.map((row) => [
      row.work_date,
      employeeMap.get(row.employee_id) || row.employee_id,
      statusLabels[row.status] || row.status,
      row.check_in || "",
      row.check_out || "",
      row.late_minutes || 0,
      row.deduction_days || 0,
    ].map(csvCell).join(","));
    downloadTextFile(`aoa-attendance-${range.from}-${range.to}.csv`, `\ufeff${header.map(csvCell).join(",")}\n${lines.join("\n")}`);
  }

  function exportPayrollCsv() {
    const header = ["الموظف", "المرتب الشهري", "خصم أيام", "قيمة الخصم", "استقطاعات مالية", "الصافي التقديري", "تأخير", "غياب", "بدون انصراف"];
    const lines = stats.payrollRows.map((row) => [
      row.name,
      row.salary,
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

  return (
    <div className="stack">
      {error && <div className="setup-banner">{error}</div>}
      <section className="panel">
        <div className="panel-title between">
          <div><Download size={20} /><h2>تقارير وتحليلات</h2></div>
          <div className="toolbar">
            <div className="tabs compact-tabs no-margin">
              <button className={cls(period === "day" && "active")} onClick={() => setPeriod("day")}>يومي</button>
              <button className={cls(period === "week" && "active")} onClick={() => setPeriod("week")}>أسبوعي</button>
              <button className={cls(period === "month" && "active")} onClick={() => setPeriod("month")}>شهري</button>
            </div>
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
            <button className="secondary" onClick={exportCsv} disabled={loading || rows.length === 0}>
              <FileSpreadsheet size={16} /> Excel
            </button>
            <button className="secondary" onClick={() => window.print()}>PDF</button>
          </div>
        </div>
        <p className="muted">الفترة: {range.from} إلى {range.to}</p>
      </section>
      <div className="stats-grid">
        <Metric label="معدل التغطية" value={`${stats.attendanceRate}%`} tone="ok" icon={Activity} />
        <Metric label={`سجلات ${range.label}`} value={`${stats.total}/${stats.expected}`} icon={CalendarDays} />
        <Metric label="تأخيرات" value={stats.late} tone="warn" icon={Clock3} />
        <Metric label="بدون انصراف" value={stats.missingCheckout} tone="danger" icon={AlertTriangle} />
        <Metric label="خصم أيام" value={stats.deductionDays.toFixed(2)} tone="warn" icon={TrendingUp} />
        <Metric label="خصومات تقديرية" value={`${money(stats.deductions)} ج`} tone="gold" icon={Banknote} />
        <Metric label="استقطاعات مالية" value={`${money(stats.financialTotal)} ج`} tone="gold" icon={Wallet} />
      </div>
      <div className="grid two">
        <section className="panel">
          <div className="panel-title"><TrendingUp size={20} /><h2>اتجاه الحضور اليومي</h2></div>
          {dailyData.length > 0 ? (
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                  <ChartTooltip />
                  <Area type="monotone" dataKey="present" name="حضور" stroke="#FCC107" fill="#FCC107" fillOpacity={0.2} strokeWidth={2.2} />
                  <Area type="monotone" dataKey="late" name="تأخير" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.12} strokeWidth={2} />
                  <Area type="monotone" dataKey="absent" name="غياب" stroke="#EF4444" fill="#EF4444" fillOpacity={0.1} strokeWidth={2} />
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
      <section className="panel">
        <div className="panel-title"><Users size={20} /><h2>حضور الموظفين ({range.label})</h2></div>
        {employeeBars.length > 0 ? (
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={Math.max(180, employeeBars.length * 34 + 40)}>
              <ReBarChart data={employeeBars} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" orientation="right" width={92} tick={{ fontSize: 12 }} />
                <ChartTooltip />
                <ReBar dataKey="حضور" fill="#FCC107" radius={[0, 6, 6, 0]} barSize={12} />
                <ReBar dataKey="تأخير" fill="#F59E0B" radius={[0, 6, 6, 0]} barSize={12} />
                <ReBar dataKey="غياب" fill="#EF4444" radius={[0, 6, 6, 0]} barSize={12} />
              </ReBarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="muted">لا توجد بيانات موظفين في الفترة.</p>
        )}
      </section>
      <section className="panel">
        <div className="panel-title between">
          <div><Banknote size={20} /><h2>المرتبات والخصومات</h2></div>
          <button className="secondary" onClick={exportPayrollCsv} disabled={loading || stats.payrollRows.length === 0}>
            <FileSpreadsheet size={16} /> Excel مرتبات
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الموظف</th>
                <th>المرتب الشهري</th>
                <th>خصم أيام</th>
                <th>قيمة الخصم</th>
                <th>استقطاعات مالية</th>
                <th>الصافي التقديري</th>
                <th>مؤشرات</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="7">جاري التحميل...</td></tr>}
              {!loading && stats.payrollRows.length === 0 && <tr><td colSpan="7">لا توجد بيانات مرتبات.</td></tr>}
              {!loading && stats.payrollRows.map((row) => (
                <tr key={row.employee_id}>
                  <td>{row.name}</td>
                  <td>{money(row.salary)} ج</td>
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
      <section className="panel">
        <div className="panel-title"><Clock3 size={20} /><h2>أعلى التأخيرات</h2></div>
        <div className="list">
          {stats.lateByEmployee.length === 0 && <p className="muted">لا توجد تأخيرات في الفترة.</p>}
          {stats.lateByEmployee.map((item) => (
            <div className="list-row compact-row" key={item.employee_id}>
              <div><strong>{item.name}</strong><span>{item.count} مرة · {item.minutes} دقيقة</span></div>
            </div>
          ))}
        </div>
      </section>
      <AccountManager onToast={onToast} />
    </div>
  );
}

function AccountManager({ onToast }) {
  const [employees, setEmployees] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({ employeeId: "", email: "", role: "employee" });
  const [busy, setBusy] = useState(false);

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

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("owner_link_employee_account_v1", {
      p_employee_id: Number(form.employeeId),
      p_email: form.email,
      p_role: form.role,
    });
    setBusy(false);
    if (error || data?.error) {
      onToast(data?.message || "تعذر ربط الحساب.");
      return;
    }
    setForm((current) => ({ ...current, email: "" }));
    onToast("تم ربط حساب الموظف.");
    loadAccounts();
  }

  return (
    <section className="panel">
      <div className="panel-title"><UserPlus size={20} /><h2>حسابات الموظفين</h2></div>
      <form className="form account-form" onSubmit={submit}>
        <label>الموظف<select value={form.employeeId} onChange={(e) => setForm((current) => ({ ...current, employeeId: e.target.value }))}>{employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}</select></label>
        <label>إيميل الحساب<input dir="ltr" type="email" value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} required placeholder="employee@airocean.com" /></label>
        <label>الدور<select value={form.role} onChange={(e) => setForm((current) => ({ ...current, role: e.target.value }))}>{roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
        <button className="primary" disabled={busy}>{busy ? "جاري الربط..." : "ربط الحساب"}</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>الموظف</th><th>الإيميل</th><th>الدور</th><th>الحالة</th></tr></thead>
          <tbody>
            {accounts.map((row) => (
              <tr key={row.employee_id}>
                <td>{row.employee_name}</td>
                <td dir="ltr">{row.email || "-"}</td>
                <td>{roleNames[row.admin_role || row.role] || row.admin_role || row.role || "-"}</td>
                <td>{row.user_id ? <StatusBadge status="approved" /> : "غير مربوط"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default OwnerDashboard;

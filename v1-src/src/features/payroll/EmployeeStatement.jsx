import { useEffect, useMemo, useState } from "react";
import { Banknote, CalendarDays, FileSpreadsheet, FileText, PiggyBank, Wallet } from "lucide-react";
import { supabase, todayIso } from "../../lib/supabase";
import { csvCell, downloadTextFile, fmtTime12, money } from "../../lib/format";
import { deductionCategoryLabels, statusLabels } from "../../lib/labels";
import { Metric, StatusBadge } from "../../ui/legacy";

// كشف حساب موظف — owner-only (lives inside the owner-only payroll view):
// pick an employee + a period and get salary, itemized deductions
// (attendance + financial) and the estimated net, with the day-by-day log.
function EmployeeStatement({ onToast }) {
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [from, setFrom] = useState(() => `${todayIso().slice(0, 7)}-01`);
  const [to, setTo] = useState(todayIso());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    supabase.from("employees").select("id,name,active").eq("active", true).order("id").then(({ data: rows }) => {
      setEmployees(rows || []);
      setEmployeeId((current) => current || String(rows?.[0]?.id || ""));
    });
  }, []);

  useEffect(() => {
    if (!employeeId) return;
    const empId = Number(employeeId);
    const fromMonth = from.slice(0, 7);
    const toMonth = to.slice(0, 7);
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase.from("salaries").select("monthly_salary").eq("employee_id", empId).maybeSingle(),
      supabase.from("attendance").select("work_date,status,check_in,check_out,late_minutes,deduction_days,note")
        .eq("employee_id", empId).gte("work_date", from).lte("work_date", to).order("work_date"),
      supabase.from("emp_loan_installments")
        .select("amount,due_month,seq,loan:emp_loans!inner(status,amount)")
        .eq("employee_id", empId).gte("due_month", fromMonth).lte("due_month", toMonth)
        .eq("loan.status", "active").order("due_month"),
      supabase.from("canteen_entries").select("entry_date,item,amount")
        .eq("employee_id", empId).eq("status", "active").gte("entry_date", from).lte("entry_date", to).order("entry_date"),
      supabase.from("other_deductions").select("entry_date,category,amount,note")
        .eq("employee_id", empId).eq("status", "active").gte("entry_date", from).lte("entry_date", to).order("entry_date"),
    ]).then(([sal, att, inst, cant, oth]) => {
      if (cancelled) return;
      const failed = [sal, att, inst, cant, oth].find((item) => item.error);
      if (failed) {
        onToast?.(failed.error.message || "تعذر تحميل كشف الحساب.");
        setLoading(false);
        return;
      }
      setData({
        salary: Number(sal.data?.monthly_salary || 0),
        attendance: att.data || [],
        installments: inst.data || [],
        canteen: cant.data || [],
        other: oth.data || [],
      });
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [employeeId, from, to]);

  const employeeName = employees.find((emp) => String(emp.id) === String(employeeId))?.name || "";

  const statement = useMemo(() => {
    if (!data) return null;
    const present = data.attendance.filter((r) => r.check_in).length;
    const late = data.attendance.filter((r) => r.status === "late").length;
    const lateMinutes = data.attendance.reduce((s, r) => s + Number(r.late_minutes || 0), 0);
    const absent = data.attendance.filter((r) => r.status === "absent").length;
    const leave = data.attendance.filter((r) => ["leave", "mission", "sick"].includes(r.status)).length;
    const missingCheckout = data.attendance.filter((r) => r.check_in && !r.check_out && ["present", "late"].includes(r.status)).length;
    const deductionDays = data.attendance.reduce((s, r) => s + Number(r.deduction_days || 0) + (r.status === "absent" ? 1 : 0), 0);
    const attendanceDeduction = deductionDays * (data.salary / 30);

    const financialItems = [
      ...data.installments.map((i) => ({
        date: `${i.due_month}`,
        label: `قسط سلفة (${i.seq}) — أصل السلفة ${money(i.loan?.amount || 0)} ج`,
        amount: Number(i.amount),
      })),
      ...data.canteen.map((c) => ({ date: c.entry_date, label: `كانتين — ${c.item}`, amount: Number(c.amount) })),
      ...data.other.map((o) => ({
        date: o.entry_date,
        label: `${deductionCategoryLabels[o.category] || o.category}${o.note ? ` — ${o.note}` : ""}`,
        amount: Number(o.amount),
      })),
    ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const financialTotal = financialItems.reduce((s, i) => s + i.amount, 0);

    const totalDeductions = attendanceDeduction + financialTotal;
    return {
      present, late, lateMinutes, absent, leave, missingCheckout,
      deductionDays, attendanceDeduction,
      financialItems, financialTotal,
      totalDeductions,
      net: Math.max(0, data.salary - totalDeductions),
    };
  }, [data]);

  function exportCsv() {
    if (!data || !statement) return;
    const lines = [];
    lines.push(["كشف حساب", employeeName].map(csvCell).join(","));
    lines.push(["الفترة", `${from} → ${to}`].map(csvCell).join(","));
    lines.push([]);
    lines.push(["المرتب الشهري الأساسي (قبل الخصم)", data.salary.toFixed(2)].map(csvCell).join(","));
    lines.push(["خصم أيام الحضور", statement.deductionDays.toFixed(2), statement.attendanceDeduction.toFixed(2)].map(csvCell).join(","));
    statement.financialItems.forEach((item) => {
      lines.push(["استقطاع مالي", item.date, item.label, item.amount.toFixed(2)].map(csvCell).join(","));
    });
    lines.push(["إجمالي الخصومات", statement.totalDeductions.toFixed(2)].map(csvCell).join(","));
    lines.push(["الصافي بعد الخصم", statement.net.toFixed(2)].map(csvCell).join(","));
    lines.push([]);
    lines.push(["التاريخ", "الحالة", "حضور", "انصراف", "تأخير (د)", "خصم أيام", "ملاحظة"].map(csvCell).join(","));
    data.attendance.forEach((r) => {
      lines.push([
        r.work_date,
        statusLabels[r.status] || r.status,
        r.check_in || "",
        r.check_out || "",
        r.late_minutes || 0,
        r.deduction_days || 0,
        r.note || "",
      ].map(csvCell).join(","));
    });
    downloadTextFile(`aoa-statement-${employeeName}-${from}-${to}.csv`, `\ufeff${lines.join("\n")}`);
  }

  return (
    <section className="panel">
      <div className="panel-title between">
        <div><FileText size={20} /><h2>كشف حساب موظف</h2></div>
        <div className="toolbar">
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
          <input type="date" value={from} aria-label="من تاريخ" title="من تاريخ" onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} />
          <input type="date" value={to} min={from} aria-label="إلى تاريخ" title="إلى تاريخ" onChange={(e) => setTo(e.target.value)} />
          <button className="secondary" onClick={exportCsv} disabled={loading || !statement}>
            <FileSpreadsheet size={16} /> Excel
          </button>
        </div>
      </div>

      {loading && <p className="muted">جارٍ إعداد كشف الحساب...</p>}

      {!loading && data && statement && (
        <div className="stack">
          <div className="stats-grid compact-stats">
            <Metric label="المرتب الشهري (قبل الخصم)" value={`${money(data.salary)} ج`} icon={Banknote} />
            <Metric label="خصومات الحضور" value={`${money(statement.attendanceDeduction)} ج`} sub={`${statement.deductionDays.toFixed(2)} يوم`} tone="warn" icon={CalendarDays} />
            <Metric label="استقطاعات مالية" value={`${money(statement.financialTotal)} ج`} tone="gold" icon={Wallet} />
            <Metric label="الصافي بعد الخصم" value={`${money(statement.net)} ج`} tone="ok" icon={PiggyBank} />
          </div>
          <p className="muted">
            الفترة: {from} إلى {to} · حضور {statement.present} يوم · تأخير {statement.late} مرة ({statement.lateMinutes} دقيقة)
            · غياب {statement.absent} · أجازة {statement.leave} · بدون انصراف {statement.missingCheckout}.
            الصافي تقديري مقابل المرتب الشهري الكامل.
          </p>

          {statement.financialItems.length > 0 && (
            <div className="table-wrap cards-on-mobile">
              <table>
                <thead><tr><th>التاريخ</th><th>البيان</th><th>المبلغ</th></tr></thead>
                <tbody>
                  {statement.financialItems.map((item, index) => (
                    <tr key={index}>
                      <td data-label="التاريخ" dir="ltr">{item.date}</td>
                      <td data-label="البيان" className="note-cell">{item.label}</td>
                      <td data-label="المبلغ">{money(item.amount)} ج</td>
                    </tr>
                  ))}
                  <tr>
                    <td data-label="الإجمالي"><strong>إجمالي الاستقطاعات المالية</strong></td>
                    <td></td>
                    <td data-label="المبلغ"><strong>{money(statement.financialTotal)} ج</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="table-wrap sticky-table">
            <table>
              <thead><tr><th>التاريخ</th><th>الحالة</th><th>حضور</th><th>انصراف</th><th>تأخير (د)</th><th>خصم أيام</th><th>ملاحظة</th></tr></thead>
              <tbody>
                {data.attendance.length === 0 && <tr><td colSpan="7">لا توجد سجلات حضور في الفترة.</td></tr>}
                {data.attendance.map((r) => (
                  <tr key={r.work_date}>
                    <td dir="ltr">{r.work_date}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td dir="ltr">{fmtTime12(r.check_in) || "-"}</td>
                    <td dir="ltr">{fmtTime12(r.check_out) || "-"}</td>
                    <td>{r.late_minutes || 0}</td>
                    <td>{r.deduction_days || 0}</td>
                    <td className="note-cell">{r.note || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

export default EmployeeStatement;

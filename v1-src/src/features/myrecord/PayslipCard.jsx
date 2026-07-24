import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { computePayroll, getPayrollConfig } from "../../lib/payroll";
import { money } from "../../lib/format";

// كشف راتبي (spec E-3): the employee's own estimated payslip for the selected
// month. Mirrors OwnerDashboard's queries filtered to this employee and goes
// through the SAME computePayroll — parity is asserted in payrollMath.test.js.
// Renders nothing when the salary row isn't readable (RLS) — zeros are never
// shown as truth.
function PayslipCard({ employeeId, month, monthLabel, attendanceRows }) {
  const [state, setState] = useState(null);

  useEffect(() => {
    if (!employeeId || !month) return undefined;
    let cancelled = false;
    const from = `${month}-01`;
    const [year, mon] = month.split("-").map(Number);
    const to = new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10);
    Promise.all([
      getPayrollConfig(),
      supabase.from("salaries").select("*").eq("employee_id", employeeId).maybeSingle(),
      // Same financial-deduction sources as OwnerDashboard (voided loans excluded).
      supabase.from("emp_loan_installments")
        .select("employee_id,amount,due_month,loan:emp_loans!inner(status)")
        .eq("employee_id", employeeId).eq("due_month", month).eq("loan.status", "active"),
      supabase.from("canteen_entries").select("amount")
        .eq("employee_id", employeeId).eq("status", "active").gte("entry_date", from).lte("entry_date", to),
      supabase.from("other_deductions").select("amount")
        .eq("employee_id", employeeId).eq("status", "active").gte("entry_date", from).lte("entry_date", to),
    ]).then(([config, sal, inst, cant, other]) => {
      if (cancelled) return;
      if (sal.error || !sal.data || sal.data.monthly_salary == null) {
        setState(null); // salary not readable → hide entirely
        return;
      }
      const financialTotal = [...(inst.data || []), ...(cant.data || []), ...(other.data || [])]
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);
      setState({ config, salaryRow: sal.data, financialTotal });
    }).catch(() => {
      if (!cancelled) setState(null);
    });
    return () => {
      cancelled = true;
    };
  }, [employeeId, month]);

  if (!state) return null;
  const pay = computePayroll({
    config: state.config,
    salaryRow: state.salaryRow,
    attendanceRows,
    financialTotal: state.financialTotal,
  });

  return (
    <section className="payslip-card">
      <div className="payslip-head">
        <strong>كشف راتبي — {monthLabel}</strong>
        <i className="payslip-chip">تقديري</i>
      </div>
      <div className="payslip-rows">
        <PayslipRow label="الراتب الأساسي" amount={pay.base} />
        {pay.mode === "daily" ? (
          <PayslipRow label={`بدل انتظام (${pay.creditedDays} يوم)`} amount={pay.allowanceEarned} />
        ) : null}
        {pay.fixedAllowance ? <PayslipRow label="بدل ثابت" amount={pay.fixedAllowance} /> : null}
        {pay.bonus ? <PayslipRow label="حافز شهري" amount={pay.bonus} /> : null}
        {pay.attendanceDeduction > 0 ? (
          <PayslipRow label={`خصم حضور (${pay.deductionDays.toFixed(2)} يوم)`} amount={-pay.attendanceDeduction} tone="deduction" />
        ) : null}
        {state.financialTotal > 0 ? (
          <PayslipRow label="استقطاعات مالية" amount={-state.financialTotal} tone="deduction" />
        ) : null}
      </div>
      <div className="payslip-net">
        <span>الصافي التقديري</span>
        <strong><bdi dir="ltr">{money(pay.net)}</bdi> <i>ج.م</i></strong>
      </div>
    </section>
  );
}

function PayslipRow({ label, amount, tone }) {
  const negative = amount < 0;
  return (
    <div className={`payslip-row${tone === "deduction" ? " is-deduction" : ""}`}>
      <span>{label}</span>
      <bdi dir="ltr">{negative ? "−" : ""}{money(Math.abs(amount))} ج</bdi>
    </div>
  );
}

export default PayslipCard;

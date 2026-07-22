// Pure salary math — extracted from payroll.js so it can run under node --test
// (payroll.js pulls in the supabase client, which needs a bundler). Both the
// owner dashboard and the employee payslip card MUST go through computePayroll
// here; that shared path is what the payslip-parity test asserts.
export const DEFAULT_PAYROLL_CONFIG = { mode: "monthly", divisor: 30 };

const PAID_AWAY_STATUSES = new Set(["leave", "mission", "sick"]);

// Money value of one deducted day for an employee: tier cuts (late/early exit)
// cost the FULL day value; an absence costs a basic day (in daily mode the
// allowance is already forfeited by the day not being credited).
export function payrollDayValues(config, salaryRow) {
  const cfg = config || DEFAULT_PAYROLL_CONFIG;
  const basic = Number(salaryRow?.monthly_salary || 0);
  if (cfg.mode !== "daily") {
    const value = basic / 30;
    return { cutDay: value, absentDay: value };
  }
  const divisor = cfg.divisor || 26;
  return { cutDay: basic / divisor + Number(salaryRow?.day_rate || 0), absentDay: basic / divisor };
}

// salaryRow: a full `salaries` row (extra columns simply absent on databases
// that don't have them). attendanceRows: [{status, check_in, deduction_days}].
export function computePayroll({ config, salaryRow, attendanceRows = [], financialTotal = 0 }) {
  const cfg = config || DEFAULT_PAYROLL_CONFIG;
  const basic = Number(salaryRow?.monthly_salary || 0);
  const cutDays = attendanceRows.reduce((sum, row) => sum + Number(row.deduction_days || 0), 0);
  const absentDays = attendanceRows.filter((row) => row.status === "absent").length;

  if (cfg.mode !== "daily") {
    const deductionDays = cutDays + absentDays;
    const attendanceDeduction = deductionDays * (basic / 30);
    return {
      mode: "monthly",
      base: basic,
      dayRate: 0,
      creditedDays: 0,
      allowanceEarned: 0,
      fixedAllowance: 0,
      bonus: 0,
      gross: basic,
      deductionDays,
      attendanceDeduction,
      net: Math.max(0, basic - attendanceDeduction - financialTotal),
    };
  }

  const divisor = cfg.divisor || 26;
  const dayRate = Number(salaryRow?.day_rate || 0);
  const fixedAllowance = Number(salaryRow?.fixed_allowance || 0);
  const bonus = Number(salaryRow?.monthly_bonus || 0);
  const dayValue = basic / divisor + dayRate;
  // Credited days earn the allowance: actually attended + approved paid leave.
  const creditedDays = Math.min(
    divisor,
    attendanceRows.filter((row) => row.check_in || PAID_AWAY_STATUSES.has(row.status)).length
  );
  const allowanceEarned = dayRate * creditedDays;
  // Tier cuts (e.g. late after 9:30 → 0.25) are fractions of the full day
  // value; an absence additionally forfeits a basic day (its allowance is
  // already lost by not being credited).
  const attendanceDeduction = cutDays * dayValue + absentDays * (basic / divisor);
  const gross = basic + allowanceEarned + fixedAllowance + bonus;
  return {
    mode: "daily",
    base: basic,
    dayRate,
    dayValue,
    creditedDays,
    allowanceEarned,
    fixedAllowance,
    bonus,
    gross,
    deductionDays: cutDays + absentDays,
    attendanceDeduction,
    net: Math.max(0, gross - attendanceDeduction - financialTotal),
  };
}

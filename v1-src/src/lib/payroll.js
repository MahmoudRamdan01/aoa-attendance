import { supabase } from "./supabase";

// Single source of truth for salary math, so every page (payroll dashboard,
// employee statement, treasury liability, employee detail) computes the same
// net from the same rules.
//
// Two modes, driven by the settings key `payroll` in each company's database:
//   monthly (default, our system): net = monthly_salary
//     − deduction_days × (salary ÷ 30) − financial deductions.
//     No `payroll` setting row → this mode. Numbers identical to the
//     pre-refactor behaviour.
//   daily (Air Ocean): salary = أساسي + انتظام (an attendance allowance
//     earned per credited day). Day value = basic ÷ divisor + day_rate.
//     Late after the check-in window cuts fractions of the FULL day value
//     (their rule: after 9:30 → 0.25 day) via attendance.deduction_days,
//     absence forfeits the allowance (day not credited) plus a basic day.
export const DEFAULT_PAYROLL_CONFIG = { mode: "monthly", divisor: 30 };

let configPromise = null;

export function getPayrollConfig() {
  if (!configPromise) {
    configPromise = supabase
      .from("settings")
      .select("value")
      .eq("key", "payroll")
      .maybeSingle()
      .then(({ data }) => {
        const value = data?.value || {};
        const mode = value.mode === "daily" ? "daily" : "monthly";
        const divisor = Number(value.divisor) > 0 ? Number(value.divisor) : mode === "daily" ? 26 : 30;
        return { mode, divisor };
      })
      .catch(() => DEFAULT_PAYROLL_CONFIG);
  }
  return configPromise;
}

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

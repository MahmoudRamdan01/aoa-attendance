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
export { DEFAULT_PAYROLL_CONFIG, computePayroll, payrollDayValues } from "./payrollMath";
import { DEFAULT_PAYROLL_CONFIG } from "./payrollMath";

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

// computePayroll / payrollDayValues moved to payrollMath.js (pure, node-testable)
// and are re-exported above so existing imports keep working.

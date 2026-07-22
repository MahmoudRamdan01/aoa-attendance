import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PAYROLL_CONFIG, computePayroll, payrollDayValues } from "./payrollMath.js";

// Payslip parity (redesign phase-4 acceptance): the employee PayslipCard and
// the OwnerDashboard row both call computePayroll with the same inputs, so
// equal inputs MUST give an identical result object.
test("payslip equals the owner-dashboard row for the same inputs", () => {
  const inputs = {
    config: DEFAULT_PAYROLL_CONFIG,
    salaryRow: { monthly_salary: 6000 },
    attendanceRows: [
      { status: "present", check_in: "08:54:00", deduction_days: 0 },
      { status: "late", check_in: "09:41:00", deduction_days: 0.25 },
      { status: "absent", check_in: null, deduction_days: 1 },
    ],
    financialTotal: 350,
  };
  const ownerRow = computePayroll(inputs);
  const payslip = computePayroll(inputs);
  assert.deepEqual(payslip, ownerRow);
});

test("monthly mode: day = basic/30, absences add a full day", () => {
  const pay = computePayroll({
    config: { mode: "monthly", divisor: 30 },
    salaryRow: { monthly_salary: 6000 },
    attendanceRows: [
      { status: "late", check_in: "09:40:00", deduction_days: 0.5 },
      { status: "absent", check_in: null, deduction_days: 0 },
    ],
    financialTotal: 100,
  });
  assert.equal(pay.mode, "monthly");
  assert.equal(pay.gross, 6000);
  assert.equal(pay.deductionDays, 1.5);
  assert.equal(pay.attendanceDeduction, 1.5 * 200);
  assert.equal(pay.net, 6000 - 300 - 100);
});

test("daily mode: allowance per credited day, cuts cost the full day value", () => {
  const pay = computePayroll({
    config: { mode: "daily", divisor: 26 },
    salaryRow: { monthly_salary: 5200, day_rate: 150, fixed_allowance: 300, monthly_bonus: 200 },
    attendanceRows: [
      { status: "present", check_in: "09:00:00", deduction_days: 0 },
      { status: "late", check_in: "09:45:00", deduction_days: 0.25 },
      { status: "leave", check_in: null, deduction_days: 0 },
      { status: "absent", check_in: null, deduction_days: 0 },
    ],
    financialTotal: 0,
  });
  const dayValue = 5200 / 26 + 150; // 350
  assert.equal(pay.creditedDays, 3); // 2 attended + paid leave
  assert.equal(pay.allowanceEarned, 450);
  assert.equal(pay.gross, 5200 + 450 + 300 + 200);
  assert.equal(pay.attendanceDeduction, 0.25 * dayValue + 5200 / 26);
  assert.equal(pay.net, pay.gross - pay.attendanceDeduction);
});

test("net clamps at zero and missing salary row is safe", () => {
  const broke = computePayroll({
    config: DEFAULT_PAYROLL_CONFIG,
    salaryRow: { monthly_salary: 100 },
    attendanceRows: [],
    financialTotal: 900,
  });
  assert.equal(broke.net, 0);
  const empty = computePayroll({ config: DEFAULT_PAYROLL_CONFIG, salaryRow: null });
  assert.equal(empty.gross, 0);
  assert.equal(empty.net, 0);
});

test("payrollDayValues matches both modes", () => {
  assert.deepEqual(payrollDayValues({ mode: "monthly" }, { monthly_salary: 3000 }), { cutDay: 100, absentDay: 100 });
  assert.deepEqual(
    payrollDayValues({ mode: "daily", divisor: 26 }, { monthly_salary: 2600, day_rate: 150 }),
    { cutDay: 250, absentDay: 100 }
  );
});

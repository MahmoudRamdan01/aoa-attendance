// ============================================================================
// AOA Assistant — Supabase Edge Function (v7: deterministic tables + fast paths)
// AI agent with role-gated tools over the attendance/financial system.
// - Caller identity: the user's JWT → every data tool runs under THEIR RLS.
// - Provider: any OpenAI-compatible endpoint (config in assistant_config).
// - Sensitive actions return proposals; the client confirms via confirm_action.
// - NUMBERS NEVER PASS THROUGH THE MODEL: read-tools render structured tables
//   server-side (RENDERERS) and single-read questions skip the second LLM
//   round entirely. body.direct = {tool, args} executes a read with NO LLM.
// Deployed with verify_jwt=true (gateway rejects missing/invalid JWTs).
// NOTE: this repo copy is a reference; the live function is deployed via MCP.
// ============================================================================
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/mahmoudramdan01\.github\.io$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGIN_PATTERNS.some((p) => p.test(origin));
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://mahmoudramdan01.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

// ---------------------------------------------------------------------------
// Domain labels (Arabic) reused in summaries
// ---------------------------------------------------------------------------
const statusLabels: Record<string, string> = {
  present: "حاضر", late: "متأخر", absent: "غياب", leave: "أجازة",
  mission: "مأمورية", sick: "مرضي", pending: "معلّق", approved: "معتمد",
  rejected: "مرفوض", active: "ساري", voided: "ملغي", confirmed: "مؤكد",
};
const expenseLabels: Record<string, string> = {
  water: "مياه", electricity: "كهرباء", gas: "غاز", internet: "إنترنت",
  rent: "إيجار", maintenance: "صيانة", stationery: "أدوات مكتبية", other: "أخرى",
};
const deductionLabels: Record<string, string> = {
  damage: "تلفيات", penalty: "جزاء", uniform: "زي", other: "أخرى",
};
const kindLabels: Record<string, string> = {
  invoice: "فاتورة", loan: "سلفة", deal: "صفقة", other: "أخرى",
};

function todayCairo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
}

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from: `${month}-01`, to: last };
}

type Role = "owner" | "hr" | "employee";

interface Ctx {
  role: Role;
  employeeId: number | null;
  name: string;
  userId: string;
  client: SupabaseClient;
}

// ---------------------------------------------------------------------------
// Tool implementations. Every read/write goes through ctx.client (user JWT)
// so RLS + RPC guards are the hard security boundary.
// ---------------------------------------------------------------------------
const DB_SELECT_WHITELIST = new Set([
  "attendance", "employees", "permissions", "leave_requests", "notifications",
  "company_expenses", "partner_ledger_entries", "partner_settlements",
  "canteen_entries", "other_deductions", "official_holidays", "emp_loans",
  "emp_loan_installments", "owner_ledger_entries", "owner_ledger_payments",
]);

async function runTool(name: string, args: Record<string, unknown>, ctx: Ctx): Promise<unknown> {
  const c = ctx.client;
  const today = todayCairo();
  const month = (args.month as string) || today.slice(0, 7);
  const mr = monthRange(month);

  switch (name) {
    // ---- self-service (RLS scopes to the caller) ----
    case "my_today": {
      if (!ctx.employeeId) return { error: "لا يوجد ملف موظف مرتبط بحسابك." };
      const { data } = await c.from("attendance").select("*").eq("employee_id", ctx.employeeId).eq("work_date", today).maybeSingle();
      return data ?? { info: "لم تسجل حضور اليوم بعد." };
    }
    case "my_month_summary": {
      if (!ctx.employeeId) return { error: "لا يوجد ملف موظف مرتبط بحسابك." };
      const { data } = await c.from("attendance").select("work_date,status,check_in,check_out,late_minutes,deduction_days")
        .eq("employee_id", ctx.employeeId).gte("work_date", mr.from).lte("work_date", mr.to).order("work_date");
      const rows = data ?? [];
      return {
        month,
        present: rows.filter((r) => r.check_in).length,
        late: rows.filter((r) => r.status === "late").length,
        absent: rows.filter((r) => r.status === "absent").length,
        leave: rows.filter((r) => ["leave", "mission", "sick"].includes(r.status)).length,
        late_minutes_total: rows.reduce((s, r) => s + Number(r.late_minutes || 0), 0),
        deduction_days_total: rows.reduce((s, r) => s + Number(r.deduction_days || 0) + (r.status === "absent" ? 1 : 0), 0),
        rows,
      };
    }
    case "my_deductions": {
      if (!ctx.employeeId) return { error: "لا يوجد ملف موظف مرتبط بحسابك." };
      const [loans, inst, cant, oth] = await Promise.all([
        c.from("emp_loans").select("*").eq("employee_id", ctx.employeeId),
        c.from("emp_loan_installments").select("*").eq("employee_id", ctx.employeeId).order("due_month"),
        c.from("canteen_entries").select("item,amount,entry_date,status").eq("employee_id", ctx.employeeId).gte("entry_date", mr.from).lte("entry_date", mr.to),
        c.from("other_deductions").select("category,amount,entry_date,note,status").eq("employee_id", ctx.employeeId).gte("entry_date", mr.from).lte("entry_date", mr.to),
      ]);
      return { month, loans: loans.data, installments: inst.data, canteen: cant.data, other: oth.data };
    }
    case "my_requests": {
      if (!ctx.employeeId) return { error: "لا يوجد ملف موظف مرتبط بحسابك." };
      const [p, l] = await Promise.all([
        c.from("permissions").select("perm_date,hours_requested,hours_approved,status,reason,decision_note").eq("employee_id", ctx.employeeId).order("perm_date", { ascending: false }).limit(10),
        c.from("leave_requests").select("from_date,to_date,days,status,reason,decision_note").eq("employee_id", ctx.employeeId).order("from_date", { ascending: false }).limit(10),
      ]);
      return { permissions: p.data, leaves: l.data };
    }

    // ---- HR/Owner reads ----
    case "day_attendance": {
      const date = (args.date as string) || today;
      const [emp, att] = await Promise.all([
        c.from("employees").select("id,name,active,attendance_exempt").order("id"),
        c.from("attendance").select("*").eq("work_date", date),
      ]);
      const recs = new Map((att.data ?? []).map((r) => [r.employee_id, r]));
      const board = (emp.data ?? []).filter((e) => e.active && !e.attendance_exempt).map((e) => {
        const r = recs.get(e.id);
        return {
          name: e.name,
          status: r ? statusLabels[r.status] || r.status : "لم يسجل",
          check_in: r?.check_in ?? null,
          check_out: r?.check_out ?? null,
          late_minutes: r?.late_minutes ?? 0,
          note: r?.employee_note ?? null,
        };
      });
      return { date, board };
    }
    case "attendance_summary": {
      const from = (args.from as string) || mr.from;
      const to = (args.to as string) || mr.to;
      const [att, emp] = await Promise.all([
        c.from("attendance").select("employee_id,work_date,status,check_in,late_minutes,deduction_days").gte("work_date", from).lte("work_date", to),
        c.from("employees").select("id,name").order("id"),
      ]);
      const names = new Map((emp.data ?? []).map((e) => [e.id, e.name]));
      const per = new Map<number, { name: string; present: number; late: number; absent: number; late_minutes: number }>();
      for (const r of att.data ?? []) {
        const cur = per.get(r.employee_id) ?? { name: names.get(r.employee_id) ?? `#${r.employee_id}`, present: 0, late: 0, absent: 0, late_minutes: 0 };
        if (r.check_in) cur.present++;
        if (r.status === "late") { cur.late++; cur.late_minutes += Number(r.late_minutes || 0); }
        if (r.status === "absent") cur.absent++;
        per.set(r.employee_id, cur);
      }
      return { from, to, per_employee: [...per.values()] };
    }
    case "list_employees": {
      const { data } = await c.from("employees").select("id,name,active,attendance_exempt,leave_balance,checkin_from,checkin_to,checkout_from,checkout_to").order("id");
      return data;
    }
    case "pending_approvals": {
      const [p, l, s, e] = await Promise.all([
        c.from("permissions").select("id,perm_date,hours_requested,reason,employees(name)").eq("status", "pending"),
        c.from("leave_requests").select("id,from_date,to_date,reason,employees!leave_requests_employee_id_fkey(name)").eq("status", "pending"),
        c.from("partner_settlements").select("id,amount,settle_date,note,created_by_name").eq("status", "pending"),
        c.from("company_expenses").select("id,expense_date,category,amount,description,created_by_name").eq("status", "active").is("confirmed_at", null),
      ]);
      return { permissions: p.data, leaves: l.data, partner_settlements: s.data, unconfirmed_expenses: e.data };
    }
    case "expenses": {
      const { data } = await c.from("company_expenses").select("id,expense_date,category,amount,description,created_by_name,confirmed_at,status").gte("expense_date", mr.from).lte("expense_date", mr.to).order("expense_date", { ascending: false });
      const active = (data ?? []).filter((r) => r.status === "active");
      return { month, total: active.reduce((s, r) => s + Number(r.amount), 0), unconfirmed: active.filter((r) => !r.confirmed_at).length, rows: data };
    }
    case "partner_summary": {
      const [en, st] = await Promise.all([
        c.from("partner_ledger_entries").select("*").order("entry_date", { ascending: false }),
        c.from("partner_settlements").select("*"),
      ]);
      const conf = new Map<number, number>();
      for (const s of st.data ?? []) {
        if (s.status === "confirmed") conf.set(s.entry_id, (conf.get(s.entry_id) ?? 0) + Number(s.amount));
      }
      const entries = (en.data ?? []).filter((e) => e.status === "active").map((e) => ({
        id: e.id, direction: e.direction === "owed_to_us" ? "لنا عندهم" : "علينا ليهم",
        kind: e.kind, amount: Number(e.amount), paid: conf.get(e.id) ?? 0,
        remaining: Number(e.amount) - (conf.get(e.id) ?? 0), description: e.description, date: e.entry_date,
      }));
      return {
        total_owed_to_us: entries.filter((e) => e.direction === "لنا عندهم").reduce((s, e) => s + e.remaining, 0),
        total_owed_by_us: entries.filter((e) => e.direction === "علينا ليهم").reduce((s, e) => s + e.remaining, 0),
        pending_settlements: (st.data ?? []).filter((s) => s.status === "pending").length,
        entries,
      };
    }
    case "db_select": {
      const table = String(args.table ?? "");
      if (!DB_SELECT_WHITELIST.has(table)) return { error: `الجدول ${table} غير مسموح.` };
      let q = c.from(table).select((args.columns as string) || "*");
      for (const f of (args.filters as Array<{ column: string; op: string; value: unknown }>) ?? []) {
        if (!/^[a-z_]+$/.test(f.column)) continue;
        if (f.op === "eq") q = q.eq(f.column, f.value);
        else if (f.op === "gte") q = q.gte(f.column, f.value);
        else if (f.op === "lte") q = q.lte(f.column, f.value);
        else if (f.op === "like") q = q.ilike(f.column, `%${f.value}%`);
      }
      if (args.order && /^[a-z_]+$/.test(String(args.order))) q = q.order(String(args.order), { ascending: args.ascending !== false });
      const { data, error } = await q.limit(Math.min(Number(args.limit ?? 50), 200));
      return error ? { error: error.message } : data;
    }

    // ---- Owner reads ----
    case "payroll_summary": {
      const from = (args.from as string) || mr.from;
      const to = (args.to as string) || mr.to;
      const [att, sal, emp, inst, cant, oth] = await Promise.all([
        c.from("attendance").select("employee_id,status,deduction_days").gte("work_date", from).lte("work_date", to),
        c.from("salaries").select("employee_id,monthly_salary"),
        c.from("employees").select("id,name,active").eq("active", true),
        c.from("emp_loan_installments").select("employee_id,amount,loan:emp_loans!inner(status)").gte("due_month", from.slice(0, 7)).lte("due_month", to.slice(0, 7)).eq("loan.status", "active"),
        c.from("canteen_entries").select("employee_id,amount").eq("status", "active").gte("entry_date", from).lte("entry_date", to),
        c.from("other_deductions").select("employee_id,amount").eq("status", "active").gte("entry_date", from).lte("entry_date", to),
      ]);
      const salaries = new Map((sal.data ?? []).map((s) => [s.employee_id, Number(s.monthly_salary || 0)]));
      const fin = new Map<number, number>();
      for (const r of [...(inst.data ?? []), ...(cant.data ?? []), ...(oth.data ?? [])]) {
        fin.set(r.employee_id, (fin.get(r.employee_id) ?? 0) + Number(r.amount || 0));
      }
      const attDed = new Map<number, number>();
      for (const r of att.data ?? []) {
        attDed.set(r.employee_id, (attDed.get(r.employee_id) ?? 0) + Number(r.deduction_days || 0) + (r.status === "absent" ? 1 : 0));
      }
      return {
        from, to,
        rows: (emp.data ?? []).map((e) => {
          const salary = salaries.get(e.id) ?? 0;
          const dedDays = attDed.get(e.id) ?? 0;
          const dedAmount = dedDays * (salary / 30);
          const financial = fin.get(e.id) ?? 0;
          return { name: e.name, salary, attendance_deduction_days: Number(dedDays.toFixed(2)), attendance_deduction: Number(dedAmount.toFixed(2)), financial_deduction: financial, net: Number(Math.max(0, salary - dedAmount - financial).toFixed(2)) };
        }),
      };
    }
    case "loans_list": {
      const [loans, inst, emp] = await Promise.all([
        c.from("emp_loans").select("*").order("created_at", { ascending: false }),
        c.from("emp_loan_installments").select("loan_id,due_month,amount"),
        c.from("employees").select("id,name"),
      ]);
      const names = new Map((emp.data ?? []).map((e) => [e.id, e.name]));
      const thisMonth = today.slice(0, 7);
      return (loans.data ?? []).map((l) => {
        const sched = (inst.data ?? []).filter((i) => i.loan_id === l.id);
        const paid = l.status === "active" ? sched.filter((i) => i.due_month < thisMonth).reduce((s, i) => s + Number(i.amount), 0) : 0;
        return { id: l.id, employee: names.get(l.employee_id) ?? l.employee_id, amount: Number(l.amount), installments: l.installments_count, start: l.start_month, paid, remaining: Math.max(0, Number(l.amount) - paid), status: l.status };
      });
    }
    case "owner_ledger": {
      const [en, pay] = await Promise.all([
        c.from("owner_ledger_entries").select("*").order("entry_date", { ascending: false }),
        c.from("owner_ledger_payments").select("*"),
      ]);
      return (en.data ?? []).map((e) => {
        const paid = (pay.data ?? []).filter((p) => p.entry_id === e.id).reduce((s, p) => s + Number(p.amount), 0);
        return { person: e.person, direction: e.direction === "lent" ? "سلّفته" : "استلفت منه", amount: Number(e.amount), paid, remaining: Math.max(0, Number(e.amount) - paid), date: e.entry_date, note: e.note };
      });
    }

    // ---- direct actions (existing RPCs enforce roles + audit) ----
    case "add_canteen": {
      const { data, error } = await c.rpc("add_canteen_entry_v1", { p_employee_id: args.employee_id, p_item: args.item, p_amount: args.amount, p_date: args.date ?? today, p_note: args.note ?? null });
      return error ? { error: error.message } : data;
    }
    case "add_other_deduction": {
      const { data, error } = await c.rpc("add_other_deduction_v1", { p_employee_id: args.employee_id, p_category: args.category, p_amount: args.amount, p_date: args.date ?? today, p_note: args.note ?? null });
      return error ? { error: error.message } : data;
    }
    case "add_expense": {
      const { data, error } = await c.rpc("add_company_expense_v1", { p_date: args.date ?? today, p_category: args.category, p_amount: args.amount, p_description: args.description ?? null });
      return error ? { error: error.message } : data;
    }
    case "add_partner_entry": {
      const { data, error } = await c.rpc("add_partner_entry_v1", { p_direction: args.direction, p_kind: args.kind, p_amount: args.amount, p_date: args.date ?? today, p_description: args.description, p_due_date: args.due_date ?? null });
      return error ? { error: error.message } : data;
    }
    case "add_partner_settlement": {
      const { data, error } = await c.rpc("add_partner_settlement_v1", { p_entry_id: args.entry_id, p_amount: args.amount, p_date: args.date ?? today, p_note: args.note ?? null });
      return error ? { error: error.message } : data;
    }
    case "send_notification": {
      const { data, error } = await c.rpc("send_admin_message_v1", { p_scope: args.scope ?? "team", p_employee_id: args.employee_id ?? null, p_title: args.title, p_body: args.body });
      return error ? { error: error.message } : data;
    }
    case "set_hr_note": {
      const { data, error } = await c.rpc("set_attendance_note_v1", { p_employee_id: args.employee_id, p_date: args.date ?? today, p_note: args.note });
      return error ? { error: error.message } : data;
    }
    case "mark_missing_checkouts": {
      const { data, error } = await c.rpc("mark_missing_checkouts_v1", { p_date: args.date ?? today });
      return error ? { error: error.message } : data;
    }
    case "request_permission": {
      const { data, error } = await c.rpc("request_permission_v1", { p_date: args.date, p_hours_requested: args.hours, p_reason: args.reason });
      return error ? { error: error.message } : data;
    }
    case "request_leave": {
      const { data, error } = await c.rpc("request_leave_v1", { p_from: args.from, p_to: args.to, p_cover: args.cover_employee_id, p_reason: args.reason });
      return error ? { error: error.message } : data;
    }
    default:
      return { error: `أداة غير معروفة: ${name}` };
  }
}

// Sensitive actions: never executed by the model directly — proposed, then
// executed only after the user taps "تنفيذ" (confirm_action round-trip).
const SENSITIVE: Record<string, { rpc: string; map: (a: Record<string, unknown>) => Record<string, unknown>; summary: (a: Record<string, unknown>) => string }> = {
  add_loan: {
    rpc: "add_loan_v1",
    map: (a) => ({ p_employee_id: a.employee_id, p_amount: a.amount, p_installments: a.installments, p_start_month: a.start_month, p_note: a.note ?? null }),
    summary: (a) => `تسجيل سلفة ${a.amount} ج للموظف #${a.employee_id} على ${a.installments} قسط بداية ${a.start_month}`,
  },
  decide_permission: {
    rpc: "decide_permission_v1",
    map: (a) => ({ p_id: a.id, p_approve: a.approve, p_hours_approved: a.hours_approved ?? null, p_note: a.note ?? (a.approve ? "تمت الموافقة" : "تم الرفض") }),
    summary: (a) => `${a.approve ? "الموافقة على" : "رفض"} طلب الإذن #${a.id}${a.hours_approved ? ` (${a.hours_approved} ساعة)` : ""}`,
  },
  decide_leave: {
    rpc: "decide_leave_v1",
    map: (a) => ({ p_id: a.id, p_approve: a.approve, p_note: a.note ?? (a.approve ? "تمت الموافقة" : "تم الرفض") }),
    summary: (a) => `${a.approve ? "الموافقة على" : "رفض"} طلب الأجازة #${a.id}`,
  },
  confirm_expense: {
    rpc: "confirm_expense_v1",
    map: (a) => ({ p_id: a.id }),
    summary: (a) => `تأكيد المصروف #${a.id}`,
  },
  decide_partner_settlement: {
    rpc: "decide_partner_settlement_v1",
    map: (a) => ({ p_id: a.id, p_approve: a.approve, p_note: a.note ?? null }),
    summary: (a) => `${a.approve ? "تأكيد" : "رفض"} سداد المديونية #${a.id}`,
  },
  void_financial: {
    rpc: "void_financial_v1",
    map: (a) => ({ p_kind: a.kind, p_id: a.id, p_reason: a.reason }),
    summary: (a) => `إلغاء ${a.kind} #${a.id} — السبب: ${a.reason}`,
  },
  set_official_holiday: {
    rpc: "set_official_holiday_v1",
    map: (a) => ({ p_date: a.date, p_label: a.label ?? "أجازة رسمية" }),
    summary: (a) => `تسجيل أجازة رسمية يوم ${a.date} (${a.label ?? "أجازة رسمية"})`,
  },
  reset_attendance_day: {
    rpc: "reset_attendance_day_v1",
    map: (a) => ({ p_employee_id: a.employee_id, p_date: a.date, p_reason: a.reason ?? "تصحيح عبر المساعد" }),
    summary: (a) => `مسح سجل يوم ${a.date} للموظف #${a.employee_id}`,
  },
};

// ---------------------------------------------------------------------------
// Deterministic rendering: read-tool results become {text, tables} in CODE so
// the numbers shown to the user come straight from the database, never from
// the model. tables render natively in the chat client.
// ---------------------------------------------------------------------------
type Table = { title?: string; columns: string[]; rows: (string | number | null)[][]; footer?: (string | number)[] };
type Rendered = { text: string; tables: Table[] };

const money = (n: unknown) => Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const hhmm = (v: unknown): string => {
  const s = String(v ?? "");
  if (!s) return "—";
  if (/^\d{2}:\d{2}/.test(s)) return s.slice(0, 5);
  if (s.includes("T")) return s.slice(11, 16);
  return s;
};
const dash = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

const RENDERERS: Record<string, (r: any, today: string) => Rendered> = {
  my_today(r) {
    if (r?.info) return { text: r.info, tables: [] };
    const parts = [`حضورك النهارده: ${statusLabels[r.status] ?? r.status}`];
    if (r.check_in) parts.push(`دخول ${hhmm(r.check_in)}`);
    if (r.check_out) parts.push(`انصراف ${hhmm(r.check_out)}`);
    if (Number(r.late_minutes) > 0) parts.push(`تأخير ${r.late_minutes} دقيقة`);
    if (Number(r.deduction_days) > 0) parts.push(`خصم ${r.deduction_days} يوم`);
    return { text: parts.join(" — ") + ".", tables: [] };
  },
  my_month_summary(r) {
    const rows = (r.rows ?? []).map((x: any) => [x.work_date, statusLabels[x.status] ?? x.status, hhmm(x.check_in), hhmm(x.check_out), Number(x.late_minutes || 0) || "—"]);
    return {
      text: `شهر ${r.month}: حضور ${r.present} يوم — تأخير ${r.late} مرة (${r.late_minutes_total} د) — غياب ${r.absent} — أجازات ${r.leave} — خصومات ${r.deduction_days_total} يوم.`,
      tables: rows.length ? [{ title: "تفاصيل الشهر", columns: ["التاريخ", "الحالة", "دخول", "انصراف", "تأخير (د)"], rows }] : [],
    };
  },
  my_deductions(r, today) {
    const thisMonth = today.slice(0, 7);
    const tables: Table[] = [];
    const activeLoans = (r.loans ?? []).filter((l: any) => l.status === "active");
    let installmentDue = 0;
    if (activeLoans.length) {
      const inst = (r.installments ?? []).filter((i: any) => activeLoans.some((l: any) => l.id === i.loan_id));
      installmentDue = inst.filter((i: any) => i.due_month === thisMonth).reduce((s: number, i: any) => s + Number(i.amount), 0);
      tables.push({
        title: "أقساط السلف",
        columns: ["شهر الاستحقاق", "المبلغ"],
        rows: inst.map((i: any) => [i.due_month, money(i.amount)]),
      });
    }
    const canteen = (r.canteen ?? []).filter((x: any) => x.status === "active");
    const canteenTotal = canteen.reduce((s: number, x: any) => s + Number(x.amount), 0);
    if (canteen.length) {
      tables.push({ title: `كانتين ${r.month}`, columns: ["التاريخ", "الصنف", "المبلغ"], rows: canteen.map((x: any) => [x.entry_date, x.item, money(x.amount)]), footer: ["الإجمالي", "", money(canteenTotal)] });
    }
    const other = (r.other ?? []).filter((x: any) => x.status === "active");
    const otherTotal = other.reduce((s: number, x: any) => s + Number(x.amount), 0);
    if (other.length) {
      tables.push({ title: `استقطاعات أخرى ${r.month}`, columns: ["التاريخ", "النوع", "المبلغ"], rows: other.map((x: any) => [x.entry_date, deductionLabels[x.category] ?? x.category, money(x.amount)]) });
    }
    const total = installmentDue + canteenTotal + otherTotal;
    const text = total > 0
      ? `استقطاعات ${r.month}: قسط سلفة ${money(installmentDue)} + كانتين ${money(canteenTotal)} + أخرى ${money(otherTotal)} = ${money(total)} ج.`
      : `مفيش استقطاعات عليك في ${r.month}`;
    return { text, tables };
  },
  my_requests(r) {
    const tables: Table[] = [];
    const perms = r.permissions ?? [];
    const leaves = r.leaves ?? [];
    if (perms.length) tables.push({ title: "الأذونات", columns: ["التاريخ", "الساعات", "الحالة", "السبب"], rows: perms.map((p: any) => [p.perm_date, p.hours_approved ?? p.hours_requested, statusLabels[p.status] ?? p.status, dash(p.reason)]) });
    if (leaves.length) tables.push({ title: "الأجازات", columns: ["من", "إلى", "أيام", "الحالة", "السبب"], rows: leaves.map((l: any) => [l.from_date, l.to_date, l.days, statusLabels[l.status] ?? l.status, dash(l.reason)]) });
    const pend = perms.filter((p: any) => p.status === "pending").length + leaves.filter((l: any) => l.status === "pending").length;
    return { text: tables.length ? (pend ? `عندك ${pend} طلب لسه معلّق.` : "دي آخر طلباتك:") : "مفيش طلبات مسجلة ليك.", tables };
  },
  day_attendance(r) {
    const b = r.board ?? [];
    const present = b.filter((x: any) => x.check_in).length;
    const late = b.filter((x: any) => x.status === "متأخر").length;
    const absent = b.filter((x: any) => x.status === "غياب").length;
    const none = b.filter((x: any) => x.status === "لم يسجل").length;
    return {
      text: `حضور يوم ${r.date}: ${present} حضروا (منهم ${late} متأخر) — غياب ${absent} — لسه مسجّلوش ${none}.`,
      tables: b.length ? [{
        title: `لوحة يوم ${r.date}`,
        columns: ["الموظف", "الحالة", "دخول", "انصراف", "تأخير (د)", "ملاحظة"],
        rows: b.map((x: any) => [x.name, x.status, hhmm(x.check_in), hhmm(x.check_out), Number(x.late_minutes || 0) || "—", dash(x.note)]),
      }] : [],
    };
  },
  attendance_summary(r) {
    const per = [...(r.per_employee ?? [])].sort((a: any, b: any) => b.late - a.late || b.late_minutes - a.late_minutes);
    const top = per.find((x: any) => x.late > 0);
    return {
      text: top
        ? `من ${r.from} لـ ${r.to} — أكتر واحد اتأخر: ${top.name} (${top.late} مرة / ${top.late_minutes} دقيقة).`
        : `من ${r.from} لـ ${r.to} — مفيش تأخيرات مسجلة`,
      tables: per.length ? [{
        title: "ملخص الحضور بالموظف",
        columns: ["الموظف", "حضور", "تأخير", "دقايق التأخير", "غياب"],
        rows: per.map((x: any) => [x.name, x.present, x.late, x.late_minutes, x.absent]),
      }] : [],
    };
  },
  list_employees(r) {
    const rows = (r ?? []).map((e: any) => [e.id, e.name, e.active ? "نشط" : "موقوف", e.attendance_exempt ? "مرتبات فقط" : "حضور", `${dash(e.checkin_from)}–${dash(e.checkin_to)}`, `${dash(e.checkout_from)}–${dash(e.checkout_to)}`, e.leave_balance ?? "—"]);
    return {
      text: `${rows.length} موظف (${(r ?? []).filter((e: any) => e.active).length} نشط).`,
      tables: rows.length ? [{ title: "الموظفين", columns: ["#", "الاسم", "الحالة", "النوع", "الحضور", "الانصراف", "رصيد أجازات"], rows }] : [],
    };
  },
  pending_approvals(r) {
    const tables: Table[] = [];
    const perms = r.permissions ?? [];
    const leaves = r.leaves ?? [];
    const setts = r.partner_settlements ?? [];
    const exps = r.unconfirmed_expenses ?? [];
    if (perms.length) tables.push({ title: "أذونات معلقة", columns: ["#", "الموظف", "التاريخ", "ساعات", "السبب"], rows: perms.map((p: any) => [p.id, p.employees?.name ?? "—", p.perm_date, p.hours_requested, dash(p.reason)]) });
    if (leaves.length) tables.push({ title: "أجازات معلقة", columns: ["#", "الموظف", "من", "إلى", "السبب"], rows: leaves.map((l: any) => [l.id, l.employees?.name ?? "—", l.from_date, l.to_date, dash(l.reason)]) });
    if (setts.length) tables.push({ title: "سدادات مستنية تأكيد", columns: ["#", "المبلغ", "التاريخ", "سجّلها", "ملاحظة"], rows: setts.map((s: any) => [s.id, money(s.amount), s.settle_date, dash(s.created_by_name), dash(s.note)]) });
    if (exps.length) tables.push({ title: "مصروفات غير مؤكدة", columns: ["#", "التاريخ", "البند", "المبلغ", "سجّلها"], rows: exps.map((e: any) => [e.id, e.expense_date, expenseLabels[e.category] ?? e.category, money(e.amount), dash(e.created_by_name)]) });
    const text = tables.length
      ? `المعلقات: ${perms.length} إذن — ${leaves.length} أجازة — ${setts.length} سداد — ${exps.length} مصروف غير مؤكد.`
      : "مفيش حاجة معلقة محتاجة قرار";
    return { text, tables };
  },
  expenses(r) {
    const active = (r.rows ?? []).filter((x: any) => x.status === "active");
    return {
      text: `مصروفات ${r.month}: الإجمالي ${money(r.total)} ج${r.unconfirmed ? ` — منها ${r.unconfirmed} لسه مستنية تأكيد` : ""}.`,
      tables: active.length ? [{
        title: `مصروفات ${r.month}`,
        columns: ["#", "التاريخ", "البند", "المبلغ", "الوصف", "الحالة"],
        rows: active.map((x: any) => [x.id, x.expense_date, expenseLabels[x.category] ?? x.category, money(x.amount), dash(x.description), x.confirmed_at ? "مؤكد" : "مستني تأكيد"]),
        footer: ["", "", "الإجمالي", money(r.total), "", ""],
      }] : [],
    };
  },
  partner_summary(r) {
    const net = Number(r.total_owed_to_us) - Number(r.total_owed_by_us);
    return {
      text: `مديونية Air Ocean: لنا عندهم ${money(r.total_owed_to_us)} ج — علينا ليهم ${money(r.total_owed_by_us)} ج — الصافي ${money(Math.abs(net))} ج ${net >= 0 ? "لنا" : "علينا"}${r.pending_settlements ? ` — ${r.pending_settlements} سداد مستني تأكيد` : ""}.`,
      tables: (r.entries ?? []).length ? [{
        title: "القيود المفتوحة",
        columns: ["#", "الاتجاه", "النوع", "الوصف", "المبلغ", "المسدد", "المتبقي", "التاريخ"],
        rows: (r.entries ?? []).map((e: any) => [e.id, e.direction, kindLabels[e.kind] ?? e.kind, dash(e.description), money(e.amount), money(e.paid), money(e.remaining), e.date]),
      }] : [],
    };
  },
  payroll_summary(r) {
    const rows = [...(r.rows ?? [])].sort((a: any, b: any) =>
      (b.attendance_deduction + b.financial_deduction) - (a.attendance_deduction + a.financial_deduction) || String(a.name).localeCompare(String(b.name), "ar"));
    const totalNet = rows.reduce((s: number, x: any) => s + Number(x.net), 0);
    const totalSalary = rows.reduce((s: number, x: any) => s + Number(x.salary), 0);
    return {
      text: `مرتبات الفترة ${r.from} → ${r.to}: إجمالي المرتبات ${money(totalSalary)} ج — إجمالي الصافي ${money(totalNet)} ج لعدد ${rows.length} موظف.`,
      tables: rows.length ? [{
        title: "المرتبات والخصومات",
        columns: ["الموظف", "المرتب", "أيام الخصم", "خصم الحضور", "استقطاعات مالية", "الصافي"],
        rows: rows.map((x: any) => [x.name, money(x.salary), x.attendance_deduction_days, money(x.attendance_deduction), money(x.financial_deduction), money(x.net)]),
        footer: ["الإجمالي", money(totalSalary), "", "", "", money(totalNet)],
      }] : [],
    };
  },
  loans_list(r) {
    const rows = r ?? [];
    const act = rows.filter((l: any) => l.status === "active");
    const remaining = act.reduce((s: number, l: any) => s + Number(l.remaining), 0);
    return {
      text: rows.length ? `${act.length} سلفة سارية — إجمالي المتبقي ${money(remaining)} ج.` : "مفيش سلف مسجلة.",
      tables: rows.length ? [{
        title: "السلف",
        columns: ["الموظف", "المبلغ", "أقساط", "البداية", "المسدد", "المتبقي", "الحالة"],
        rows: rows.map((l: any) => [l.employee, money(l.amount), l.installments, l.start, money(l.paid), money(l.remaining), statusLabels[l.status] ?? l.status]),
      }] : [],
    };
  },
  owner_ledger(r) {
    const rows = r ?? [];
    const lent = rows.filter((x: any) => x.direction === "سلّفته").reduce((s: number, x: any) => s + Number(x.remaining), 0);
    const borrowed = rows.filter((x: any) => x.direction === "استلفت منه").reduce((s: number, x: any) => s + Number(x.remaining), 0);
    return {
      text: rows.length ? `دفترك الشخصي: ليك بره ${money(lent)} ج — عليك ${money(borrowed)} ج.` : "الدفتر الشخصي فاضي.",
      tables: rows.length ? [{
        title: "الدفتر الشخصي",
        columns: ["الشخص", "الاتجاه", "المبلغ", "المسدد", "المتبقي", "التاريخ", "ملاحظة"],
        rows: rows.map((x: any) => [x.person, x.direction, money(x.amount), money(x.paid), money(x.remaining), x.date, dash(x.note)]),
      }] : [],
    };
  },
  db_select(r) {
    if (!Array.isArray(r) || r.length === 0 || typeof r[0] !== "object") {
      return { text: Array.isArray(r) && r.length === 0 ? "مفيش نتايج للاستعلام ده." : "", tables: [] };
    }
    const columns = Object.keys(r[0]).slice(0, 8);
    const rows = r.slice(0, 60).map((row: any) => columns.map((k) => {
      const v = row[k];
      if (v === null || v === undefined) return "—";
      if (typeof v === "object") return JSON.stringify(v).slice(0, 40);
      return typeof v === "string" && statusLabels[v] ? statusLabels[v] : String(v);
    }));
    return { text: `لقيت ${r.length} صف.`, tables: [{ title: "نتيجة الاستعلام", columns, rows }] };
  },
};

function safeRender(name: string, result: unknown, today: string): Rendered | null {
  const fn = RENDERERS[name];
  if (!fn) return null;
  try { return fn(result, today); } catch { return null; }
}

// Read tools that ARE the answer: when a turn's first round calls only these
// (successfully), we reply deterministically and never do a second LLM round.
const SHORTCUT_TOOLS = new Set([
  "payroll_summary", "day_attendance", "attendance_summary", "pending_approvals",
  "expenses", "partner_summary", "loans_list", "owner_ledger",
  "my_today", "my_month_summary", "my_deductions", "my_requests",
]);

// Non-sensitive action tools: successful round-0 actions also reply
// deterministically (the RPCs return Arabic messages).
const ACTION_LABELS: Record<string, (a: any, res: any) => string> = {
  add_canteen: (a) => `اتسجل كانتين "${a.item}" بـ${money(a.amount)} ج`,
  add_other_deduction: (a) => `اتسجل استقطاع ${deductionLabels[a.category] ?? a.category} بـ${money(a.amount)} ج`,
  add_expense: (a) => `اتسجل مصروف ${expenseLabels[a.category] ?? a.category} بـ${money(a.amount)} ج (مستني تأكيد الـ Owner)`,
  add_partner_entry: (a) => `اتسجل قيد مديونية ${money(a.amount)} ج`,
  add_partner_settlement: (a) => `اتسجل سداد ${money(a.amount)} ج (مستني تأكيد الـ Owner)`,
  send_notification: () => "الإشعار اتبعت",
  set_hr_note: () => "الملاحظة اتسجلت",
  mark_missing_checkouts: (_a, res) => res && typeof res === "object" && "updated" in res ? `راجعت الانصرافات — عدّلت ${res.updated} سجل` : "راجعت الانصرافات الناقصة",
  request_permission: () => "طلب الإذن اتقدم — مستني موافقة الإدارة",
  request_leave: () => "طلب الأجازة اتقدم — مستني موافقة الإدارة",
};

const hasArabic = (s: string) => /[؀-ۿ]/.test(s);

// direct mode: chip-triggered reads that skip the LLM completely.
const DIRECT_GATES: Record<string, (ctx: Ctx) => boolean> = {
  my_today: (c) => !!c.employeeId,
  my_month_summary: (c) => !!c.employeeId,
  my_deductions: (c) => !!c.employeeId,
  my_requests: (c) => !!c.employeeId,
  day_attendance: (c) => c.role === "hr" || c.role === "owner",
  attendance_summary: (c) => c.role === "hr" || c.role === "owner",
  list_employees: (c) => c.role === "hr" || c.role === "owner",
  pending_approvals: (c) => c.role === "hr" || c.role === "owner",
  expenses: (c) => c.role === "hr" || c.role === "owner",
  partner_summary: (c) => c.role === "hr" || c.role === "owner",
  payroll_summary: (c) => c.role === "owner",
  loans_list: (c) => c.role === "owner",
  owner_ledger: (c) => c.role === "owner",
};

// ---------------------------------------------------------------------------
// Tool schemas (OpenAI format), assembled per role.
// ---------------------------------------------------------------------------
function t(name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []) {
  return { type: "function", function: { name, description, parameters: { type: "object", properties, required } } };
}

// MiniMax sometimes emits its NATIVE tool-call format as plain text content
// instead of the structured `tool_calls` field. Parse it so the agent stays
// robust to both formats (and the XML never leaks to the user).
function coerce(v: string): unknown {
  const s = v.trim();
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null") return null;
  return s;
}
function parseNativeToolCalls(content: string) {
  const calls: Array<{ id: string; type: string; function: { name: string; arguments: string } }> = [];
  const invokeRe = /<invoke name="([^"]+)">([\s\S]*?)<\/invoke>/g;
  let m: RegExpExecArray | null;
  while ((m = invokeRe.exec(content)) !== null) {
    const params: Record<string, unknown> = {};
    const paramRe = /<parameter name="([^"]+)">([\s\S]*?)<\/parameter>/g;
    let pm: RegExpExecArray | null;
    while ((pm = paramRe.exec(m[2])) !== null) params[pm[1]] = coerce(pm[2]);
    calls.push({ id: `native_${calls.length}`, type: "function", function: { name: m[1], arguments: JSON.stringify(params) } });
  }
  return calls;
}
function cleanReply(text: string): string {
  return String(text ?? "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/<minimax:tool_call>[\s\S]*?<\/minimax:tool_call>/g, "")
    .replace(/<invoke name=[\s\S]*?<\/invoke>/g, "")
    .trim();
}

function toolsForRole(role: Role, hasPortal: boolean) {
  const month = { type: "string", description: "الشهر YYYY-MM (الافتراضي الشهر الحالي)" };
  const date = { type: "string", description: "التاريخ YYYY-MM-DD (الافتراضي النهارده)" };
  const tools: unknown[] = [];

  if (hasPortal) {
    tools.push(
      t("my_today", "سجل حضوري النهارده"),
      t("my_month_summary", "ملخص حضوري في شهر", { month }),
      t("my_deductions", "سلفي واستقطاعاتي (كانتين/أخرى) وجدول الأقساط", { month }),
      t("my_requests", "طلباتي (أذونات وأجازات) وحالتها"),
      t("request_permission", "تقديم طلب إذن ساعة أو ساعتين", { date: { type: "string", description: "يوم الإذن YYYY-MM-DD" }, hours: { type: "integer", enum: [1, 2] }, reason: { type: "string" } }, ["date", "hours", "reason"]),
      t("request_leave", "تقديم طلب أجازة", { from: { type: "string" }, to: { type: "string" }, cover_employee_id: { type: "integer", description: "رقم الموظف البديل" }, reason: { type: "string" } }, ["from", "to", "cover_employee_id", "reason"]),
    );
  }

  if (role === "hr" || role === "owner") {
    tools.push(
      t("day_attendance", "لوحة حضور يوم كامل لكل الموظفين (مين حضر/اتأخر/غاب)", { date }),
      t("attendance_summary", "ملخص الحضور لكل موظف في فترة", { from: { type: "string" }, to: { type: "string" } }),
      t("list_employees", "قائمة الموظفين بمواعيد حضورهم وأرقامهم"),
      t("pending_approvals", "كل المعلقات: أذونات وأجازات وسدادات ومصروفات تحتاج قرار"),
      t("expenses", "مصروفات الشركة في شهر", { month }),
      t("partner_summary", "ملخص مديونية Air Ocean: لنا وعلينا والقيود المفتوحة"),
      t("db_select", "استعلام مرن من جدول مسموح لما الأدوات الجاهزة مش كفاية", {
        table: { type: "string", description: "اسم الجدول" },
        columns: { type: "string", description: "أعمدة مفصولة بفواصل، الافتراضي *" },
        filters: { type: "array", items: { type: "object", properties: { column: { type: "string" }, op: { type: "string", enum: ["eq", "gte", "lte", "like"] }, value: {} }, required: ["column", "op", "value"] } },
        order: { type: "string" }, ascending: { type: "boolean" }, limit: { type: "integer" },
      }, ["table"]),
      t("add_canteen", "تسجيل مشتريات كانتين على موظف (تتخصم من مرتبه)", { employee_id: { type: "integer" }, item: { type: "string" }, amount: { type: "number" }, date, note: { type: "string" } }, ["employee_id", "item", "amount"]),
      t("add_other_deduction", "تسجيل استقطاع (تلفيات/جزاء/زي/أخرى)", { employee_id: { type: "integer" }, category: { type: "string", enum: ["damage", "penalty", "uniform", "other"] }, amount: { type: "number" }, date, note: { type: "string" } }, ["employee_id", "category", "amount"]),
      t("add_expense", "تسجيل مصروف شركة", { date, category: { type: "string", enum: ["water", "electricity", "gas", "internet", "rent", "maintenance", "stationery", "other"] }, amount: { type: "number" }, description: { type: "string" } }, ["category", "amount"]),
      t("add_partner_entry", "تسجيل قيد مديونية Air Ocean", { direction: { type: "string", enum: ["owed_to_us", "owed_by_us"], description: "owed_to_us = لنا عندهم" }, kind: { type: "string", enum: ["invoice", "loan", "deal", "other"] }, amount: { type: "number" }, date, description: { type: "string" }, due_date: { type: "string" } }, ["direction", "kind", "amount", "description"]),
      t("add_partner_settlement", "تسجيل سداد على قيد مديونية (يفضل معلق لحد تأكيد الـ Owner)", { entry_id: { type: "integer" }, amount: { type: "number" }, date, note: { type: "string" } }, ["entry_id", "amount"]),
      t("send_notification", "إرسال إشعار للفريق كله أو لموظف", { scope: { type: "string", enum: ["team", "employee"] }, employee_id: { type: "integer" }, title: { type: "string" }, body: { type: "string" } }, ["scope", "title", "body"]),
      t("set_hr_note", "كتابة ملاحظة إدارية على يوم موظف", { employee_id: { type: "integer" }, date, note: { type: "string" } }, ["employee_id", "note"]),
      t("mark_missing_checkouts", "مراجعة سجلات بدون انصراف ليوم", { date }),
      t("set_official_holiday", "⚠️ تسجيل أجازة رسمية (يحتاج تأكيد المستخدم)", { date: { type: "string" }, label: { type: "string" } }, ["date"]),
    );
  }

  if (role === "owner") {
    tools.push(
      t("payroll_summary", "ملخص المرتبات والصافي بعد كل الخصومات لفترة", { from: { type: "string" }, to: { type: "string" } }),
      t("loans_list", "كل السلف وأرصدتها"),
      t("owner_ledger", "الدفتر الشخصي: مين سالف ومين سدد"),
      t("add_loan", "⚠️ تسجيل سلفة بأقساط (يحتاج تأكيد المستخدم)", { employee_id: { type: "integer" }, amount: { type: "number" }, installments: { type: "integer" }, start_month: { type: "string", description: "YYYY-MM" }, note: { type: "string" } }, ["employee_id", "amount", "installments", "start_month"]),
      t("decide_permission", "⚠️ الموافقة/الرفض على طلب إذن (يحتاج تأكيد المستخدم)", { id: { type: "integer" }, approve: { type: "boolean" }, hours_approved: { type: "integer", enum: [1, 2] }, note: { type: "string" } }, ["id", "approve"]),
      t("decide_leave", "⚠️ الموافقة/الرفض على طلب أجازة (يحتاج تأكيد المستخدم)", { id: { type: "integer" }, approve: { type: "boolean" }, note: { type: "string" } }, ["id", "approve"]),
      t("confirm_expense", "⚠️ تأكيد مصروف (يحتاج تأكيد المستخدم)", { id: { type: "integer" } }, ["id"]),
      t("decide_partner_settlement", "⚠️ تأكيد/رفض سداد مديونية (يحتاج تأكيد المستخدم)", { id: { type: "integer" }, approve: { type: "boolean" }, note: { type: "string" } }, ["id", "approve"]),
      t("void_financial", "⚠️ إلغاء سجل مالي بسبب (يحتاج تأكيد المستخدم)", { kind: { type: "string", enum: ["loan", "canteen", "other", "expense", "partner_entry", "partner_settlement"] }, id: { type: "integer" }, reason: { type: "string" } }, ["kind", "id", "reason"]),
      t("reset_attendance_day", "⚠️ مسح سجل حضور يوم لموظف (يحتاج تأكيد المستخدم)", { employee_id: { type: "integer" }, date: { type: "string" }, reason: { type: "string" } }, ["employee_id", "date"]),
    );
  }
  return tools;
}

function systemPrompt(ctx: Ctx, roster: string): string {
  const roleAr = ctx.role === "owner" ? "المالك (Owner)" : ctx.role === "hr" ? "مسؤول HR" : "موظف";
  return `انت "مساعد Air Ocean Line" — مساعد ذكي داخل نظام الحضور والموارد البشرية للشركة. بتتكلم عربي مصري واضح ومختصر.

المستخدم الحالي: ${ctx.name} — دوره: ${roleAr}. تاريخ اليوم: ${todayCairo()} (توقيت القاهرة). يوم الراحة الأسبوعي: الجمعة.${roster}

قواعد صارمة:
1. أي رقم أو معلومة عن الشركة لازم تيجي من الأدوات — ممنوع تخمّن أو تختلق. لو الأداة رجّعت فاضي قول "مش لاقي بيانات".
2. الأدوات اللي عليها ⚠️ بترجع "بانتظار التأكيد" — قول للمستخدم إن العملية جاهزة ومستنية ضغطة "تنفيذ" اللي هتظهرله، ومتقولش إنها اتنفذت.
3. صلاحياتك = صلاحيات المستخدم نفسه. لو موظف طلب حاجة إدارية اشرح بأدب إنها للإدارة فقط.
4. لما تحتاج رقم موظف استخدم أرقام القائمة اللي فوق مباشرة — متفترضش أرقام من دماغك.
5. المبالغ بالجنيه المصري.
6. ممنوع تكتب جداول markdown في ردك نهائيًا — النظام بيعرض جداول منسقة تلقائيًا من نتايج الأدوات. اكتب خلاصة قصيرة (سطر أو اتنين) بس.
7. خلّي تفكيرك الداخلي مختصر جدًا — سطر واحد يكفي — وبعده نفّذ على طول.

معلومات النظام: الحضور بـ GPS (نطاق 1000م من مكتب العطارين) + QR يومي. نافذة الحضور العامة 08:00–11:00 والانصراف 16:00–19:00 (عبدالرحمن من 13:00/18:00، حبيبة 12:00–13:00/17:00–19:00). التأخير >15 دقيقة: أول مرة في الشهر إنذار وبعدها خصم ربع يوم. الأذونات: 3 شهريًا غير متتالية (ساعة أو ساعتين). الأجازات: يومين شهريًا غير متتاليين بموظف بديل، من رصيد سنوي. السلف بأقساط شهرية بتتخصم من المرتب تلقائيًا هي والكانتين والاستقطاعات. المصروفات وسدادات المديونية بيأكدها الـ Owner. صافي المرتب = المرتب − خصم الغياب/التأخير − الاستقطاعات المالية.`;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: cors });

  const started = Date.now();
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
    }

    const body = await req.json();
    const { data: myCtx } = await userClient.rpc("get_my_context_v1");
    const role: Role = (myCtx?.role as Role) ?? "employee";
    const ctx: Ctx = {
      role,
      employeeId: myCtx?.employee?.id ?? null,
      name: myCtx?.employee?.name ?? myCtx?.admin_name ?? userData.user.email ?? "مستخدم",
      userId: userData.user.id,
      client: userClient,
    };
    const today = todayCairo();
    const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // -------- direct mode: a chip tapped in the UI → run ONE read tool with
    // no LLM at all. Deterministic text + table straight from the database.
    if (body.direct) {
      const { tool, args = {} } = body.direct as { tool: string; args?: Record<string, unknown> };
      const gate = DIRECT_GATES[tool];
      if (!gate) return new Response(JSON.stringify({ error: "bad_tool", reply: "الأداة دي مش متاحة للتشغيل المباشر." }), { status: 400, headers: cors });
      if (!gate(ctx)) return new Response(JSON.stringify({ error: "forbidden", reply: "دي مش متاحة لدورك." }), { status: 403, headers: cors });
      const result = await runTool(tool, args, ctx);
      const failed = !!(result && typeof result === "object" && "error" in (result as Record<string, unknown>));
      const rendered = failed ? null : safeRender(tool, result, today);
      const reply = failed ? `❌ ${(result as any).error}` : (rendered?.text || "تمام ✅");
      await service.from("assistant_logs").insert({
        user_id: ctx.userId, role: ctx.role, question: `[مباشر] ${tool}`,
        reply_summary: reply.slice(0, 500), tools_used: [{ name: tool, ok: !failed, direct: true }],
        duration_ms: Date.now() - started,
      });
      return new Response(JSON.stringify({ reply, tables: rendered?.tables ?? [], actions: [{ name: tool, ok: !failed }], proposals: [] }), { headers: cors });
    }

    // -------- confirm_action: execute a previously proposed sensitive action
    if (body.confirm_action) {
      const { name, args } = body.confirm_action as { name: string; args: Record<string, unknown> };
      const def = SENSITIVE[name];
      if (!def) return new Response(JSON.stringify({ error: "bad_action" }), { status: 400, headers: cors });
      const { data, error } = await ctx.client.rpc(def.rpc, def.map(args));
      const result = error ? { error: error.message } : data;
      await service.from("assistant_logs").insert({
        user_id: ctx.userId, role: ctx.role, question: `[تنفيذ مؤكد] ${name}`,
        reply_summary: JSON.stringify(result).slice(0, 500),
        tools_used: [{ name, args, confirmed: true }], duration_ms: Date.now() - started,
      });
      return new Response(JSON.stringify({ result, summary: def.summary(args) }), { headers: cors });
    }

    // -------- normal chat turn (rate limit counts LLM turns only)
    const [{ count }, { data: cfgRow }] = await Promise.all([
      service.from("assistant_logs").select("id", { count: "exact", head: true })
        .eq("user_id", ctx.userId).gte("created_at", new Date(Date.now() - 60_000).toISOString())
        .not("question", "ilike", "[مباشر]%"),
      service.from("assistant_config").select("*").eq("id", 1).single(),
    ]);
    if ((count ?? 0) >= 20) {
      return new Response(JSON.stringify({ error: "rate_limited", reply: "استنى شوية — عدد كبير من الرسائل في وقت قصير." }), { status: 429, headers: cors });
    }
    if (!cfgRow) return new Response(JSON.stringify({ error: "no_config" }), { status: 500, headers: cors });

    // For admins, inject the active roster so employee lookups don't need a
    // separate tool round (Dahl is flaky on multi-round loops — single-round wins).
    let roster = "";
    if (ctx.role === "hr" || ctx.role === "owner") {
      const { data: emps } = await ctx.client.from("employees").select("id,name,active").eq("active", true).order("id");
      if (emps?.length) {
        roster = "\n\nأرقام الموظفين (استخدمها مباشرة بدون ما تنادي list_employees): " +
          emps.map((e) => `${e.name}=${e.id}`).join("، ") + ".";
      }
    }

    const history = Array.isArray(body.messages) ? body.messages.slice(-8) : [];
    const userQuestion = history.length ? String(history[history.length - 1]?.content ?? "") : "";
    const messages: Array<Record<string, unknown>> = [
      { role: "system", content: systemPrompt(ctx, roster) },
      ...history,
    ];
    const tools = toolsForRole(ctx.role, !!ctx.employeeId);
    const executed: Array<{ name: string; ok: boolean; summary: string }> = [];
    const proposals: Array<{ name: string; args: Record<string, unknown>; summary: string }> = [];
    const allTables: Table[] = [];
    let reply = "";
    let retriedNoTools = false;

    // A timeout/abort REJECTS fetch — never let that bubble into a 500.
    const llmFetch = (payload: unknown): Promise<Response | null> =>
      fetch(`${cfgRow.base_url}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfgRow.api_key}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(55_000),
      }).catch(() => null);

    for (let round = 0; round < (cfgRow.max_tool_rounds ?? 5); round++) {
      const resp = await llmFetch({
        model: cfgRow.model,
        temperature: Number(cfgRow.temperature ?? 0.2),
        max_tokens: cfgRow.max_tokens ?? 3000,
        messages,
        tools,
        tool_choice: "auto",
      });
      if (!resp || !resp.ok) {
        if (resp) console.error("LLM error", resp.status, (await resp.text()).slice(0, 300));
        else console.error("LLM timeout/unreachable");
        // If we already gathered tool results, do one no-tools retry so the
        // user gets a real answer instead of a generic failure.
        if (executed.length > 0 && !retriedNoTools) {
          retriedNoTools = true;
          messages.push({ role: "system", content: "لخّص إجابتك النهائية للمستخدم من نتائج الأدوات اللي فوق بدون أي جدول markdown. لو الأداة رجعت خطأ صلاحية، قول إن ده مش متاح لدوره. متستخدمش أدوات تاني." });
          const r2 = await llmFetch({ model: cfgRow.model, temperature: 0.2, max_tokens: cfgRow.max_tokens ?? 3000, messages });
          if (r2?.ok) {
            const d2 = await r2.json();
            reply = cleanReply(d2.choices?.[0]?.message?.content ?? "");
          }
        }
        // If a write already succeeded, report success — don't scare the user
        // with a provider error when the action itself went through.
        if (!reply) {
          reply = executed.some((e) => e.ok)
            ? (allTables.length ? "دي النتيجة من البيانات مباشرة" : "تمام، نفّذت اللي طلبته ✅")
            : "النموذج واخد وقت أطول من الطبيعي — جرب تاني، أو استخدم الأزرار السريعة لنتيجة فورية.";
        }
        break;
      }
      const data = await resp.json();
      const msg = data.choices?.[0]?.message ?? {};

      // Accept both structured tool_calls and MiniMax's native XML format.
      let toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
      if (toolCalls.length === 0 && typeof msg.content === "string" && msg.content.includes("<invoke name=")) {
        toolCalls = parseNativeToolCalls(msg.content);
      }

      if (toolCalls.length > 0) {
        // Replay hygiene: Dahl/vLLM rejects null content; <think> + native XML
        // blocks bloat context (a cause of 400s) — strip them from the replay.
        const cleanContent = cleanReply(msg.content ?? "");
        messages.push({ role: "assistant", content: cleanContent, tool_calls: toolCalls });
        const roundCalls: Array<{ name: string; args: any; result: any; ok: boolean; rendered: Rendered | null; sensitive: boolean }> = [];
        for (const tc of toolCalls) {
          const name = tc.function?.name ?? "";
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { /* keep {} */ }
          let resultStr: string;
          if (SENSITIVE[name]) {
            const summary = SENSITIVE[name].summary(args);
            proposals.push({ name, args, summary });
            roundCalls.push({ name, args, result: null, ok: true, rendered: null, sensitive: true });
            resultStr = JSON.stringify({ status: "awaiting_user_confirmation", summary, note: "العملية محضّرة — المستخدم لازم يدوس زرار تنفيذ اللي ظاهر له. متقولش إنها اتنفذت." });
          } else {
            // Role-gate reads even if the model hallucinates a call outside its
            // schema — otherwise RLS returns empty rows and the table shows zeros.
            const result = DIRECT_GATES[name] && !DIRECT_GATES[name](ctx)
              ? { error: "دي مش متاحة لدورك." }
              : await runTool(name, args, ctx);
            const ok = !(result && typeof result === "object" && "error" in (result as Record<string, unknown>));
            const rendered = ok ? safeRender(name, result, today) : null;
            if (rendered && rendered.tables.length && allTables.length < 4) allTables.push(...rendered.tables.slice(0, 4 - allTables.length));
            roundCalls.push({ name, args, result, ok, rendered, sensitive: false });
            executed.push({ name, ok, summary: ok ? `تم تنفيذ ${name}` : `فشل ${name}` });
            resultStr = JSON.stringify(result ?? null);
            if (resultStr.length > 6000) resultStr = resultStr.slice(0, 6000) + "…(اتقطع — كمّل بفلاتر أدق)";
          }
          messages.push({ role: "tool", tool_call_id: tc.id, content: resultStr });
        }

        // -------- deterministic short-circuits (round 0 only) --------
        if (round === 0 && !roundCalls.some((rc) => rc.sensitive)) {
          // (a) pure read-report turn: the rendered result IS the answer.
          const allReads = roundCalls.every((rc) => SHORTCUT_TOOLS.has(rc.name) && rc.ok && rc.rendered);
          if (allReads && roundCalls.length > 0 && roundCalls.length <= 2) {
            reply = roundCalls.map((rc) => rc.rendered!.text).filter(Boolean).join("\n");
            break;
          }
          // (b) pure action turn with Arabic (business) outcomes: confirm from
          // the RPC's own message — no LLM needed to say "done".
          const allActions = roundCalls.every((rc) => ACTION_LABELS[rc.name]);
          const outcomesArabic = roundCalls.every((rc) => {
            if (rc.ok) return true;
            const msg = String((rc.result as any)?.message ?? (rc.result as any)?.error ?? "");
            return hasArabic(msg);
          });
          if (allActions && roundCalls.length > 0 && outcomesArabic) {
            reply = roundCalls.map((rc) => {
              if (!rc.ok) return `❌ ${(rc.result as any)?.message ?? (rc.result as any)?.error}`;
              const resMsg = (rc.result as any)?.message;
              return `✅ ${typeof resMsg === "string" && resMsg ? resMsg : ACTION_LABELS[rc.name](rc.args, rc.result)}`;
            }).join("\n");
            break;
          }
        }
        continue;
      }

      reply = cleanReply(msg.content ?? "");
      break;
    }

    if (!reply && proposals.length === 0) reply = "معرفتش أكمل الرد — جرب تاني أو بسّط السؤال.";
    if (!reply && proposals.length > 0) reply = "جهزتلك العملية — راجعها ودوس تنفيذ.";

    await service.from("assistant_logs").insert({
      user_id: ctx.userId, role: ctx.role, question: userQuestion.slice(0, 500),
      reply_summary: reply.slice(0, 500),
      tools_used: [...executed.map((e) => ({ name: e.name, ok: e.ok })), ...proposals.map((p) => ({ name: p.name, proposed: true }))],
      duration_ms: Date.now() - started,
    });

    return new Response(JSON.stringify({ reply, actions: executed, proposals, tables: allTables }), { headers: cors });
  } catch (e) {
    console.error("assistant error", e);
    return new Response(JSON.stringify({ error: "internal", reply: "حصل خطأ غير متوقع — حاول تاني." }), { status: 500, headers: cors });
  }
});

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, FileSpreadsheet, Pencil, Receipt, Vault, Wallet, TrendingUp } from "lucide-react";
import { supabase, todayIso } from "../../lib/supabase";

import { monthRangeFor } from "../../lib/dates";
import { csvCell, downloadTextFile, money } from "../../lib/format";
import { expenseCategoryLabels, statusLabels } from "../../lib/labels";
import { Bar, Metric, StatusBadge } from "../../ui/legacy";
import { useUid, useVoidDialog, maskActor, FinanceEditModal } from "./shared";
import { SkeletonTableRows } from "../../ui/primitives";

const PAID_FROM_LABELS = { treasury: "من الخزنة", external: "من مكان آخر" };

function ExpensesView({ context, onToast }) {
  const role = context?.role || "employee";
  const isOwner = role === "owner";
  const uid = useUid();
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [rows, setRows] = useState([]);
  const [canteen, setCanteen] = useState([]);
  const [deductions, setDeductions] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ date: todayIso(), category: "electricity", amount: "", description: "", paidFrom: "treasury" });
  const [safeBalance, setSafeBalance] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const { requestVoid, voidDialog } = useVoidDialog(onToast, () => loadData());
  const range = useMemo(() => monthRangeFor(month), [month]);

  useEffect(() => {
    loadData();
  }, [range.from, range.to]);

  async function loadData() {
    setLoading(true);
    // "كل الفلوس الخارجة" = مصروفات الشركة + استقطاعات الموظفين (كانتين+أخرى) + السلف المصروفة هذا الشهر.
    const [exp, cant, oth, ln, treasury] = await Promise.all([
      supabase.from("company_expenses").select("*").gte("expense_date", range.from).lte("expense_date", range.to).order("expense_date", { ascending: false }),
      supabase.from("canteen_entries").select("amount,status").eq("status", "active").gte("entry_date", range.from).lte("entry_date", range.to),
      supabase.from("other_deductions").select("amount,status").eq("status", "active").gte("entry_date", range.from).lte("entry_date", range.to),
      supabase.from("emp_loans").select("amount,status,start_month").eq("status", "active").eq("start_month", month),
      // Current safe balance = Σ(in) − Σ(out) over active treasury entries.
      supabase.from("treasury_entries").select("direction,amount,status").eq("status", "active"),
    ]);
    setRows(exp.data || []);
    setCanteen(cant.data || []);
    setDeductions(oth.data || []);
    setLoans(ln.data || []);
    setSafeBalance((treasury.data || []).reduce((s, e) => s + (e.direction === "in" ? 1 : -1) * Number(e.amount), 0));
    setLoading(false);
  }

  const summary = useMemo(() => {
    const active = rows.filter((r) => r.status === "active");
    const total = active.reduce((sum, r) => sum + Number(r.amount), 0);
    const unconfirmed = active.filter((r) => !r.confirmed_at).length;
    const byCategory = active.reduce((acc, r) => {
      acc.set(r.category, (acc.get(r.category) || 0) + Number(r.amount));
      return acc;
    }, new Map());
    const canteenTotal = canteen.reduce((s, x) => s + Number(x.amount), 0);
    const deductionTotal = deductions.reduce((s, x) => s + Number(x.amount), 0);
    const loansTotal = loans.reduce((s, x) => s + Number(x.amount), 0);
    const grandOut = total + canteenTotal + deductionTotal + loansTotal;
    return { total, unconfirmed, byCategory, canteenTotal, deductionTotal, loansTotal, grandOut };
  }, [rows, canteen, deductions, loans]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("add_company_expense_v1", {
      p_date: form.date,
      p_category: form.category,
      p_amount: Number(form.amount),
      p_description: form.description || null,
      p_paid_from: form.paidFrom,
    });
    setBusy(false);
    if (error || data?.error) onToast(data?.message || "تعذر تسجيل المصروف.");
    else {
      // Show the remaining safe balance right away when it came out of the safe.
      const fromSafe = data.paid_from === "treasury" && data.confirmed && safeBalance !== null;
      const remaining = fromSafe ? safeBalance - Number(form.amount) : null;
      onToast(
        data.confirmed
          ? `تم تسجيل المصروف وتأكيده.${remaining !== null ? ` المتاح بالخزنة: ${money(remaining)} ج.` : ""}`
          : "تم تسجيل المصروف — في انتظار تأكيد المالك."
      );
      setForm((f) => ({ ...f, amount: "", description: "" }));
      loadData();
    }
  }

  async function confirmExpense(id) {
    // Optimistic: flip the badge immediately so the change is visible at once.
    setRows((current) => current.map((r) => (r.id === id ? { ...r, confirmed_at: new Date().toISOString() } : r)));
    const { data, error } = await supabase.rpc("confirm_expense_v1", { p_id: id });
    if (error || data?.error) {
      onToast(data?.message || "تعذر التأكيد.");
    } else {
      onToast("تم تأكيد المصروف.");
    }
    loadData();
  }

  async function saveEdit(values) {
    setBusy(true);
    const { data, error } = await supabase.rpc("edit_company_expense_v1", {
      p_id: editRow.id,
      p_date: values.date,
      p_category: values.category,
      p_amount: Number(values.amount),
      p_description: values.description || null,
      p_paid_from: values.paidFrom,
    });
    setBusy(false);
    if (error || data?.error) return onToast(data?.message || "تعذر تعديل المصروف.");
    setEditRow(null);
    onToast("تم تعديل المصروف.");
    loadData();
  }

  function exportCsvFile() {
    const header = ["التاريخ", "البند", "المبلغ", "الوصف", "سجّله", "مؤكد", "الحالة"];
    const lines = rows.map((r) => [
      r.expense_date,
      expenseCategoryLabels[r.category] || r.category,
      r.amount,
      r.description || "",
      maskActor(r.created_by_name, role) || "",
      r.confirmed_at ? "نعم" : "لا",
      statusLabels[r.status] || r.status,
    ].map(csvCell).join(","));
    downloadTextFile(`expenses-${month}.csv`, "﻿" + `${header.map(csvCell).join(",")}\n${lines.join("\n")}`);
  }

  const canVoid = (row) =>
    isOwner || (row.created_by === uid && row.expense_date === todayIso() && !row.confirmed_at && row.status === "active");

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-title between">
          <div><Receipt size={20} /><h2>المصروفات</h2></div>
          <div className="toolbar">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            <button className="secondary" onClick={exportCsvFile} disabled={rows.length === 0}>
              <FileSpreadsheet size={16} /> Excel
            </button>
          </div>
        </div>
        <div className="stats-grid compact-stats">
          <Metric label={`إجمالي ${month}`} value={`${money(summary.total)} ج`} tone="gold" icon={Banknote} />
          <Metric label="غير مؤكد" value={summary.unconfirmed} tone={summary.unconfirmed ? "warn" : "ok"} icon={AlertTriangle} />
          <Metric label="عدد المصروفات" value={rows.filter((r) => r.status === "active").length} icon={Receipt} />
          {safeBalance !== null && (
            <Metric label="المتاح بالخزنة" value={`${money(safeBalance)} ج`} tone={safeBalance >= 0 ? "ok" : "danger"} icon={Vault} />
          )}
        </div>
        {summary.byCategory.size > 0 && (
          <div className="stack">
            {[...summary.byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([category, value]) => (
              <Bar key={category} label={expenseCategoryLabels[category] || category} value={value} max={Math.max(summary.total, 1)} />
            ))}
          </div>
        )}
      </section>

      {isOwner && (
        <section className="panel">
          <div className="panel-title"><Wallet size={20} /><h2>إجمالي المدفوعات — {month}</h2></div>
          <div className="stats-grid compact-stats">
            <Metric label="الإجمالي الشامل" value={`${money(summary.grandOut)} ج`} tone="danger" icon={TrendingUp} />
            <Metric label="مصروفات الشركة" value={`${money(summary.total)} ج`} tone="gold" icon={Receipt} />
            <Metric label="استقطاعات الموظفين" value={`${money(summary.canteenTotal + summary.deductionTotal)} ج`} tone="warn" icon={Banknote} />
            <Metric label="سلف مصروفة" value={`${money(summary.loansTotal)} ج`} tone="warn" icon={Wallet} />
          </div>
          <p className="muted">الإجمالي الشامل = مصروفات الشركة + الكانتين + الخصومات الأخرى + السلف المصروفة هذا الشهر.</p>
        </section>
      )}

      <form className="panel form" onSubmit={submit}>
        <div className="panel-title"><Receipt size={20} /><h2>تسجيل مصروف</h2></div>
        <div className="form-grid">
          <label>التاريخ<input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required /></label>
          <label>البند<select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>{Object.entries(expenseCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <div className="form-grid">
          <label>المبلغ<input type="number" min="0.5" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required /></label>
          <label>مصدر الدفع
            <select value={form.paidFrom} onChange={(e) => setForm((f) => ({ ...f, paidFrom: e.target.value }))}>
              <option value="treasury">من الخزنة (يتخصم من الرصيد)</option>
              <option value="external">من مكان آخر (بنك/غيره)</option>
            </select>
          </label>
        </div>
        <label>الوصف<input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="مثال: فاتورة كهرباء يوليو" /></label>
        <button className="primary" disabled={busy}>{busy ? "جارٍ التسجيل..." : "تسجيل مصروف"}</button>
        <p className="muted">
          {form.paidFrom === "treasury" ? "المصروف ده هيتخصم من رصيد الخزنة بعد التأكيد." : "المصروف ده مش هيأثر على رصيد الخزنة."}
          {!isOwner && " ويظهر للمالك لاعتماده."}
        </p>
      </form>

      <section className="panel">
        <div className="panel-title"><FileSpreadsheet size={20} /><h2>مصروفات {month}</h2></div>
        <div className="table-wrap cards-on-mobile">
          <table>
            <thead><tr><th>التاريخ</th><th>البند</th><th>المبلغ</th><th>المصدر</th><th>الوصف</th><th>سجّله</th><th>الحالة</th><th>إجراء</th></tr></thead>
            <tbody>
              {loading && <SkeletonTableRows colSpan={8} />}
              {!loading && rows.length === 0 && <tr><td colSpan="8">لا توجد مصروفات في {month}.</td></tr>}
              {!loading && rows.map((row) => (
                <tr key={row.id}>
                  <td data-label="التاريخ" dir="ltr">{row.expense_date}</td>
                  <td data-label="البند">{expenseCategoryLabels[row.category] || row.category}</td>
                  <td data-label="المبلغ">{money(row.amount)} ج</td>
                  <td data-label="المصدر">{PAID_FROM_LABELS[row.paid_from] || "—"}</td>
                  <td data-label="الوصف" className="note-cell">{row.description || "-"}</td>
                  <td data-label="سجّله">{maskActor(row.created_by_name, role) || "-"}</td>
                  <td data-label="الحالة">
                    {row.status === "voided" ? <StatusBadge status="voided" /> : row.confirmed_at ? <StatusBadge status="confirmed" /> : <StatusBadge status="pending" />}
                  </td>
                  <td data-label="إجراء" className="card-actions">
                    <span className="approval-actions">
                      {row.status === "active" && !row.confirmed_at && (
                        isOwner
                          ? <button onClick={() => confirmExpense(row.id)}>تأكيد</button>
                          : <span className="badge">قرار المالك فقط</span>
                      )}
                      {isOwner && row.status === "active" && (
                        <button className="link" onClick={() => setEditRow(row)}><Pencil size={14} /> تعديل</button>
                      )}
                      {row.status === "active" && canVoid(row) && (
                        <button className="danger-link" onClick={() => requestVoid("expense", row.id)}>إلغاء</button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {voidDialog}
      <FinanceEditModal
        open={Boolean(editRow)}
        title="تعديل المصروف"
        busy={busy}
        fields={editRow ? [
          { name: "date", label: "التاريخ", type: "date", value: editRow.expense_date },
          { name: "category", label: "البند", type: "select", value: editRow.category,
            options: Object.entries(expenseCategoryLabels).map(([value, label]) => ({ value, label })) },
          { name: "amount", label: "المبلغ", type: "number", min: "0.5", step: "0.01", value: String(editRow.amount) },
          { name: "paidFrom", label: "مصدر الدفع", type: "select", value: editRow.paid_from || "external",
            options: [{ value: "treasury", label: "من الخزنة" }, { value: "external", label: "من مكان آخر" }] },
          { name: "description", label: "الوصف", type: "text", value: editRow.description || "" },
        ] : []}
        onSubmit={saveEdit}
        onCancel={() => setEditRow(null)}
      />
    </div>
  );
}

export default ExpensesView;

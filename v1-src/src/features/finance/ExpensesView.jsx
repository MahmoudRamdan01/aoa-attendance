import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, FileSpreadsheet, Receipt, RefreshCcw, Wallet, TrendingUp } from "lucide-react";
import { supabase, todayIso } from "../../lib/supabase";

import { monthRangeFor } from "../../lib/dates";
import { csvCell, downloadTextFile, money } from "../../lib/format";
import { expenseCategoryLabels, statusLabels } from "../../lib/labels";
import { Bar, Metric, StatusBadge } from "../../ui/legacy";
import { useUid, useVoidDialog, maskActor } from "./shared";

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
  const [form, setForm] = useState({ date: todayIso(), category: "electricity", amount: "", description: "" });
  const { requestVoid, voidDialog } = useVoidDialog(onToast, () => loadData());
  const range = useMemo(() => monthRangeFor(month), [month]);

  useEffect(() => {
    loadData();
  }, [range.from, range.to]);

  async function loadData() {
    setLoading(true);
    // "كل الفلوس الخارجة" = مصروفات الشركة + استقطاعات الموظفين (كانتين+أخرى) + السلف المصروفة هذا الشهر.
    const [exp, cant, oth, ln] = await Promise.all([
      supabase.from("company_expenses").select("*").gte("expense_date", range.from).lte("expense_date", range.to).order("expense_date", { ascending: false }),
      supabase.from("canteen_entries").select("amount,status").eq("status", "active").gte("entry_date", range.from).lte("entry_date", range.to),
      supabase.from("other_deductions").select("amount,status").eq("status", "active").gte("entry_date", range.from).lte("entry_date", range.to),
      supabase.from("emp_loans").select("amount,status,start_month").eq("status", "active").eq("start_month", month),
    ]);
    setRows(exp.data || []);
    setCanteen(cant.data || []);
    setDeductions(oth.data || []);
    setLoans(ln.data || []);
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
    });
    setBusy(false);
    if (error || data?.error) onToast(data?.message || "تعذر تسجيل المصروف.");
    else {
      onToast(data.confirmed ? "تم تسجيل المصروف وتأكيده." : "تم تسجيل المصروف — في انتظار تأكيد المالك.");
      setForm((f) => ({ ...f, amount: "", description: "" }));
      loadData();
    }
  }

  async function confirmExpense(id) {
    const { data, error } = await supabase.rpc("confirm_expense_v1", { p_id: id });
    if (error || data?.error) onToast(data?.message || "تعذر التأكيد.");
    else {
      onToast("تم تأكيد المصروف.");
      loadData();
    }
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
    downloadTextFile(`expenses-${month}.csv`, "Feff" + `${header.map(csvCell).join(",")}\n${lines.join("\n")}`);
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
            <button className="secondary" onClick={loadData}><RefreshCcw size={16} /> تحديث</button>
          </div>
        </div>
        <div className="stats-grid compact-stats">
          <Metric label={`إجمالي ${month}`} value={`${money(summary.total)} ج`} tone="gold" icon={Banknote} />
          <Metric label="غير مؤكد" value={summary.unconfirmed} tone={summary.unconfirmed ? "warn" : "ok"} icon={AlertTriangle} />
          <Metric label="عدد المصروفات" value={rows.filter((r) => r.status === "active").length} icon={Receipt} />
        </div>
        {summary.byCategory.size > 0 && (
          <div className="stack">
            {[...summary.byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([category, value]) => (
              <Bar key={category} label={expenseCategoryLabels[category] || category} value={value} max={Math.max(summary.total, 1)} />
            ))}
          </div>
        )}
      </section>

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

      <form className="panel form" onSubmit={submit}>
        <div className="panel-title"><Receipt size={20} /><h2>تسجيل مصروف</h2></div>
        <div className="form-grid">
          <label>التاريخ<input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required /></label>
          <label>البند<select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>{Object.entries(expenseCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <div className="form-grid">
          <label>المبلغ<input type="number" min="0.5" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required /></label>
          <label>الوصف<input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="مثال: فاتورة كهرباء يوليو" /></label>
        </div>
        <button className="primary" disabled={busy}>{busy ? "جارٍ التسجيل..." : "تسجيل مصروف"}</button>
        {!isOwner && <p className="muted">المصروف يُسجَّل فورًا ويظهر للمالك لاعتماده.</p>}
      </form>

      <section className="panel">
        <div className="panel-title"><FileSpreadsheet size={20} /><h2>مصروفات {month}</h2></div>
        <div className="table-wrap cards-on-mobile">
          <table>
            <thead><tr><th>التاريخ</th><th>البند</th><th>المبلغ</th><th>الوصف</th><th>سجّله</th><th>الحالة</th><th>إجراء</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan="7">جارٍ التحميل...</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan="7">لا توجد مصروفات في {month}.</td></tr>}
              {!loading && rows.map((row) => (
                <tr key={row.id}>
                  <td data-label="التاريخ" dir="ltr">{row.expense_date}</td>
                  <td data-label="البند">{expenseCategoryLabels[row.category] || row.category}</td>
                  <td data-label="المبلغ">{money(row.amount)} ج</td>
                  <td data-label="الوصف" className="note-cell">{row.description || "-"}</td>
                  <td data-label="سجّله">{maskActor(row.created_by_name, role) || "-"}</td>
                  <td data-label="الحالة">
                    {row.status === "voided" ? <StatusBadge status="voided" /> : row.confirmed_at ? <StatusBadge status="confirmed" /> : <StatusBadge status="pending" />}
                  </td>
                  <td data-label="إجراء">
                    <span className="approval-actions">
                      {row.status === "active" && !row.confirmed_at && (
                        isOwner
                          ? <button onClick={() => confirmExpense(row.id)}>تأكيد</button>
                          : <span className="badge">قرار المالك فقط</span>
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
    </div>
  );
}

export default ExpensesView;

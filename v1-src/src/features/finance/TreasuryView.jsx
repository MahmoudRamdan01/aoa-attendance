import { useEffect, useMemo, useState } from "react";
import { Vault, Wallet, PiggyBank, ArrowDownCircle, ArrowUpCircle, RefreshCcw, Users, Banknote } from "lucide-react";
import { supabase, todayIso } from "../../lib/supabase";
import { money } from "../../lib/format";
import { Metric, StatusBadge } from "../../ui/legacy";
import { voidFinancial, maskActor } from "./shared";

function TreasuryView({ context, onToast }) {
  const role = context?.role || "employee";
  const isOwner = role === "owner";
  const [entries, setEntries] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [hold, setHold] = useState({ mode: "safe", employeeId: "", name: "", amount: "", note: "", date: todayIso() });
  const [spend, setSpend] = useState({ mode: "safe", employeeId: "", name: "", amount: "", note: "", date: todayIso() });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [ent, emp] = await Promise.all([
      supabase.from("treasury_entries").select("*").order("entry_date", { ascending: false }).order("id", { ascending: false }).limit(600),
      supabase.from("employees").select("id,name,active").eq("active", true).order("id"),
    ]);
    setEntries(ent.data || []);
    setEmployees(emp.data || []);
    setLoading(false);
  }

  const stats = useMemo(() => {
    const active = entries.filter((e) => e.status === "active");
    const inTotal = active.filter((e) => e.direction === "in").reduce((s, e) => s + Number(e.amount), 0);
    const outTotal = active.filter((e) => e.direction === "out").reduce((s, e) => s + Number(e.amount), 0);
    const spentMonth = active.filter((e) => e.direction === "out" && e.entry_date.startsWith(month))
      .reduce((s, e) => s + Number(e.amount), 0);
    // Per-holder custody balance (in − out). Owner name masked for HR.
    const holders = new Map();
    active.forEach((e) => {
      const key = maskActor(e.holder_name, role) || "الخزنة";
      const cur = holders.get(key) || { name: key, held: 0 };
      cur.held += (e.direction === "in" ? 1 : -1) * Number(e.amount);
      holders.set(key, cur);
    });
    return {
      balance: inTotal - outTotal,
      inTotal,
      outTotal,
      spentMonth,
      holders: [...holders.values()].filter((h) => Math.abs(h.held) > 0.001).sort((a, b) => b.held - a.held),
    };
  }, [entries, month]);

  const monthEntries = useMemo(
    () => entries.filter((e) => e.entry_date.startsWith(month)),
    [entries, month]
  );

  function holderArgs(form) {
    if (form.mode === "employee") return { p_holder_employee_id: Number(form.employeeId), p_holder_name: null };
    if (form.mode === "other") return { p_holder_employee_id: null, p_holder_name: form.name.trim() };
    return { p_holder_employee_id: null, p_holder_name: null }; // safe → "الخزنة"
  }

  async function submitHold(event) {
    event.preventDefault();
    if (hold.mode === "employee" && !hold.employeeId) return onToast("اختار الموظف.");
    if (hold.mode === "other" && !hold.name.trim()) return onToast("اكتب اسم صاحب العهدة.");
    setBusy("hold");
    const { data, error } = await supabase.rpc("add_treasury_hold_v1", {
      ...holderArgs(hold),
      p_amount: Number(hold.amount),
      p_note: hold.note || null,
      p_date: hold.date,
    });
    setBusy("");
    if (error || data?.error) return onToast(data?.message || "تعذر تسجيل العهدة.");
    onToast(`تم تسجيل عهدة لـ ${data.holder}.`);
    setHold((f) => ({ ...f, amount: "", note: "" }));
    loadData();
  }

  async function submitSpend(event) {
    event.preventDefault();
    if (spend.mode === "employee" && !spend.employeeId) return onToast("اختار الموظف.");
    if (spend.mode === "other" && !spend.name.trim()) return onToast("اكتب اسم من قام بالصرف.");
    setBusy("spend");
    const { data, error } = await supabase.rpc("add_treasury_spend_v1", {
      p_amount: Number(spend.amount),
      p_note: spend.note || null,
      ...holderArgs(spend),
      p_category: null,
      p_date: spend.date,
    });
    setBusy("");
    if (error || data?.error) return onToast(data?.message || "تعذر تسجيل الصرف.");
    onToast(data.confirmed ? "تم الصرف وأُضيف للمصروفات." : "تم الصرف — في انتظار تأكيد المالك.");
    setSpend((f) => ({ ...f, amount: "", note: "" }));
    loadData();
  }

  const canVoid = (row) => isOwner || (row.created_by_name && row.entry_date === todayIso() && row.status === "active");

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-title between">
          <div><Vault size={20} /><h2>الخزنة</h2></div>
          <div className="toolbar">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            <button className="secondary" onClick={loadData}><RefreshCcw size={16} /> تحديث</button>
          </div>
        </div>
        <div className="stats-grid compact-stats">
          <Metric label="رصيد الخزنة الحالي" value={`${money(stats.balance)} ج`} tone={stats.balance >= 0 ? "ok" : "danger"} icon={Vault} />
          <Metric label="إجمالي العهد" value={`${money(stats.inTotal)} ج`} icon={PiggyBank} />
          <Metric label="المصروف (كلي)" value={`${money(stats.outTotal)} ج`} tone="warn" icon={Wallet} />
          <Metric label={`المصروف ${month}`} value={`${money(stats.spentMonth)} ج`} tone="gold" icon={Banknote} />
        </div>
        <p className="muted">يُضاف أي صرف من الخزنة تلقائيًا إلى صفحة «المصروفات» والإجمالي.</p>
      </section>

      {stats.holders.length > 0 && (
        <section className="panel">
          <div className="panel-title"><Users size={20} /><h2>العُهد المفتوحة (لدى من)</h2></div>
          <div className="list">
            {stats.holders.map((h) => (
              <div className="list-row compact-row" key={h.name}>
                <div><strong>{h.name}</strong><span>بحوزته حاليًا</span></div>
                <strong className={h.held >= 0 ? "" : "ledger-net danger"}>{money(h.held)} ج</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid two">
        <form className="panel form" onSubmit={submitHold}>
          <div className="panel-title"><ArrowDownCircle size={20} /><h2>تسجيل عهدة / إضافة للخزنة</h2></div>
          <HolderPicker form={hold} setForm={setHold} employees={employees} whoLabel="لدى من" />
          <div className="form-grid">
            <label>المبلغ<input type="number" min="0.5" step="0.01" value={hold.amount} onChange={(e) => setHold((f) => ({ ...f, amount: e.target.value }))} required /></label>
            <label>التاريخ<input type="date" value={hold.date} onChange={(e) => setHold((f) => ({ ...f, date: e.target.value }))} required /></label>
          </div>
          <label>البيان / ملاحظة<input value={hold.note} onChange={(e) => setHold((f) => ({ ...f, note: e.target.value }))} placeholder="مثال: عهدة مشتريات المكتب" /></label>
          <button className="primary" disabled={busy === "hold"}>{busy === "hold" ? "جارٍ الحفظ..." : "تسجيل العهدة"}</button>
        </form>

        <form className="panel form" onSubmit={submitSpend}>
          <div className="panel-title"><ArrowUpCircle size={20} /><h2>صرف من الخزنة</h2></div>
          <HolderPicker form={spend} setForm={setSpend} employees={employees} whoLabel="الصرف من عهدة" />
          <div className="form-grid">
            <label>المبلغ<input type="number" min="0.5" step="0.01" value={spend.amount} onChange={(e) => setSpend((f) => ({ ...f, amount: e.target.value }))} required /></label>
            <label>التاريخ<input type="date" value={spend.date} onChange={(e) => setSpend((f) => ({ ...f, date: e.target.value }))} required /></label>
          </div>
          <label>بيان الصرف<input value={spend.note} onChange={(e) => setSpend((f) => ({ ...f, note: e.target.value }))} placeholder="مثال: ورق طباعة" required /></label>
          <button className="primary" disabled={busy === "spend"}>{busy === "spend" ? "جارٍ الصرف..." : "تسجيل الصرف"}</button>
          {!isOwner && <p className="muted">الصرف يُسجَّل فورًا ويظهر للمالك لاعتماده.</p>}
        </form>
      </div>

      <section className="panel">
        <div className="panel-title"><Vault size={20} /><h2>حركة الخزنة — {month}</h2></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>التاريخ</th><th>النوع</th><th>مع/من</th><th>المبلغ</th><th>البيان</th><th>الحالة</th><th>إجراء</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan="7">جارٍ التحميل...</td></tr>}
              {!loading && monthEntries.length === 0 && <tr><td colSpan="7">لا توجد حركة في {month}.</td></tr>}
              {!loading && monthEntries.map((row) => (
                <tr key={row.id}>
                  <td dir="ltr">{row.entry_date}</td>
                  <td>{row.direction === "in"
                    ? <span className="badge ok">عهدة</span>
                    : <span className="badge warn">صرف</span>}</td>
                  <td>{maskActor(row.holder_name, role) || "الخزنة"}</td>
                  <td>{money(row.amount)} ج</td>
                  <td className="note-cell">{row.note || (row.direction === "out" ? "صرف" : "-")}</td>
                  <td>{row.status === "voided" ? <StatusBadge status="voided" /> : <StatusBadge status="active" />}</td>
                  <td>
                    {row.status === "active" && canVoid(row) && (
                      <button className="danger-link" onClick={() => voidFinancial("treasury", row.id, onToast, loadData)}>إلغاء</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// Holder selector: the safe itself, a team member, or a free-text name.
function HolderPicker({ form, setForm, employees, whoLabel }) {
  return (
    <div className="form-grid">
      <label>{whoLabel}
        <select value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))}>
          <option value="safe">الخزنة</option>
          <option value="employee">موظف من التيم</option>
          <option value="other">شخص آخر (اكتب الاسم)</option>
        </select>
      </label>
      {form.mode === "employee" && (
        <label>الموظف
          <select value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}>
            <option value="">اختر…</option>
            {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
        </label>
      )}
      {form.mode === "other" && (
        <label>الاسم<input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="اسم صاحب العهدة" /></label>
      )}
    </div>
  );
}

export default TreasuryView;

import { useEffect, useMemo, useState } from "react";
import { Vault, Wallet, PiggyBank, ArrowDownCircle, ArrowUpCircle, Coins, HandCoins, Landmark, Pencil, RefreshCcw, Scale, Users, Banknote, Receipt } from "lucide-react";
import { supabase, todayIso } from "../../lib/supabase";
import { money } from "../../lib/format";
import { Metric, StatusBadge } from "../../ui/legacy";
import { useVoidDialog, maskActor, FinanceEditModal } from "./shared";

function TreasuryView({ context, onToast }) {
  const role = context?.role || "employee";
  const isOwner = role === "owner";
  const [entries, setEntries] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [receivables, setReceivables] = useState({ loans: [], installments: [], partnerEntries: [], settlements: [] });
  const [payrollData, setPayrollData] = useState({ salaries: [], attendance: [], canteen: [], other: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [hold, setHold] = useState({ mode: "safe", employeeId: "", name: "", amount: "", note: "", date: todayIso() });
  const [spend, setSpend] = useState({ mode: "safe", employeeId: "", name: "", amount: "", note: "", date: todayIso() });
  const [income, setIncome] = useState({ client: "", amount: "", note: "", date: todayIso() });
  const { requestVoid, voidDialog } = useVoidDialog(onToast, () => loadData());
  const [editRow, setEditRow] = useState(null);
  const [editBusy, setEditBusy] = useState(false);

  async function saveEdit(values) {
    setEditBusy(true);
    const { data, error } = await supabase.rpc("edit_treasury_entry_v1", {
      p_id: editRow.id,
      p_amount: Number(values.amount),
      p_note: values.note || null,
      p_date: values.date,
      p_holder_employee_id: null,
      p_holder_name: values.holder || null,
    });
    setEditBusy(false);
    if (error || data?.error) return onToast(data?.message || "تعذر تعديل الحركة.");
    setEditRow(null);
    onToast("تم تعديل الحركة.");
    loadData();
  }

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [ent, emp, loans, inst, partner, settle] = await Promise.all([
      supabase.from("treasury_entries").select("*").order("entry_date", { ascending: false }).order("id", { ascending: false }).limit(600),
      supabase.from("employees").select("id,name,active").eq("active", true).order("id"),
      // Company receivables for the financial-position card.
      supabase.from("emp_loans").select("id,amount,status").eq("status", "active"),
      supabase.from("emp_loan_installments").select("loan_id,employee_id,amount,due_month"),
      supabase.from("partner_ledger_entries").select("id,direction,amount,status").eq("status", "active"),
      supabase.from("partner_settlements").select("entry_id,amount,status").eq("status", "confirmed"),
    ]);
    setEntries(ent.data || []);
    setEmployees(emp.data || []);
    setReceivables({
      loans: loans.data || [],
      installments: inst.data || [],
      partnerEntries: partner.data || [],
      settlements: settle.data || [],
    });
    // Net payroll liability for the current month — owner eyes only.
    if (isOwner) {
      const monthStart = `${todayIso().slice(0, 7)}-01`;
      const [sal, att, cant, oth] = await Promise.all([
        supabase.from("salaries").select("employee_id,monthly_salary"),
        supabase.from("attendance").select("employee_id,status,deduction_days").gte("work_date", monthStart).lte("work_date", todayIso()),
        supabase.from("canteen_entries").select("employee_id,amount").eq("status", "active").gte("entry_date", monthStart).lte("entry_date", todayIso()),
        supabase.from("other_deductions").select("employee_id,amount").eq("status", "active").gte("entry_date", monthStart).lte("entry_date", todayIso()),
      ]);
      setPayrollData({
        salaries: sal.data || [],
        attendance: att.data || [],
        canteen: cant.data || [],
        other: oth.data || [],
      });
    }
    setLoading(false);
  }

  const stats = useMemo(() => {
    const active = entries.filter((e) => e.status === "active");
    const inTotal = active.filter((e) => e.direction === "in").reduce((s, e) => s + Number(e.amount), 0);
    const outTotal = active.filter((e) => e.direction === "out").reduce((s, e) => s + Number(e.amount), 0);
    // «قبض من عميل» (إيراد) مقابل «عهدة» (تمويل من المالك) — كلاهما داخل الخزنة.
    const incomeTotal = active.filter((e) => e.direction === "in" && e.entry_kind === "income").reduce((s, e) => s + Number(e.amount), 0);
    const custodyTotal = inTotal - incomeTotal;
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
      incomeTotal,
      custodyTotal,
      spentMonth,
      holders: [...holders.values()].filter((h) => Math.abs(h.held) > 0.001).sort((a, b) => b.held - a.held),
    };
  }, [entries, month]);

  const monthEntries = useMemo(
    () => entries.filter((e) => e.entry_date.startsWith(month)),
    [entries, month]
  );

  // المركز المالي للشركة: النقدية + المستحقات القائمة. الدفتر الشخصي
  // والمصروفات الشخصية خارج الحساب تمامًا (بقرار المالك).
  const position = useMemo(() => {
    const currentMonth = todayIso().slice(0, 7);
    // Loan installments due in past months were already deducted from payroll —
    // the rest of each active loan is still owed to the company (same
    // convention as صفحة الاستقطاعات).
    const paidByLoan = receivables.installments.reduce((acc, i) => {
      if (i.due_month < currentMonth) acc.set(i.loan_id, (acc.get(i.loan_id) || 0) + Number(i.amount));
      return acc;
    }, new Map());
    const loansOutstanding = receivables.loans.reduce(
      (sum, loan) => sum + Math.max(0, Number(loan.amount) - (paidByLoan.get(loan.id) || 0)),
      0
    );
    const settledByEntry = receivables.settlements.reduce((acc, s) => {
      acc.set(s.entry_id, (acc.get(s.entry_id) || 0) + Number(s.amount));
      return acc;
    }, new Map());
    const partnerRemaining = (direction) => receivables.partnerEntries
      .filter((e) => e.direction === direction)
      .reduce((sum, e) => sum + Math.max(0, Number(e.amount) - (settledByEntry.get(e.id) || 0)), 0);
    const partnerToUs = partnerRemaining("owed_to_us");
    const partnerByUs = partnerRemaining("owed_by_us");
    const partnerNet = partnerToUs - partnerByUs;
    return {
      loansOutstanding,
      partnerToUs,
      partnerByUs,
      partnerNet,
      total: stats.balance + loansOutstanding + partnerNet,
    };
  }, [receivables, stats.balance]);

  // التزام مرتبات الشهر الحالي بعد كل الخصومات (نفس حساب صفحة الرواتب).
  const netPayroll = useMemo(() => {
    if (!isOwner || payrollData.salaries.length === 0) return null;
    const currentMonth = todayIso().slice(0, 7);
    const activeLoanIds = new Set(receivables.loans.map((loan) => loan.id));
    const finBy = new Map();
    receivables.installments.forEach((i) => {
      if (i.due_month === currentMonth && activeLoanIds.has(i.loan_id)) {
        finBy.set(i.employee_id, (finBy.get(i.employee_id) || 0) + Number(i.amount));
      }
    });
    [...payrollData.canteen, ...payrollData.other].forEach((row) => {
      finBy.set(row.employee_id, (finBy.get(row.employee_id) || 0) + Number(row.amount));
    });
    const daysBy = new Map();
    payrollData.attendance.forEach((row) => {
      const days = Number(row.deduction_days || 0) + (row.status === "absent" ? 1 : 0);
      if (days > 0) daysBy.set(row.employee_id, (daysBy.get(row.employee_id) || 0) + days);
    });
    return payrollData.salaries.reduce((sum, row) => {
      const salary = Number(row.monthly_salary || 0);
      const attDeduction = (daysBy.get(row.employee_id) || 0) * (salary / 30);
      return sum + Math.max(0, salary - attDeduction - (finBy.get(row.employee_id) || 0));
    }, 0);
  }, [isOwner, payrollData, receivables]);

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

  async function submitIncome(event) {
    event.preventDefault();
    setBusy("income");
    const { data, error } = await supabase.rpc("add_treasury_income_v1", {
      p_amount: Number(income.amount),
      p_note: income.note || null,
      p_client_name: income.client || null,
      p_date: income.date,
    });
    setBusy("");
    if (error || data?.error) return onToast(data?.message || "تعذر تسجيل القبض.");
    onToast(`تم تسجيل قبض من ${data.client}.`);
    setIncome((f) => ({ ...f, client: "", amount: "", note: "" }));
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

  // عهدة (تمويل) / قبض عميل (إيراد) / صرف — لون مميّز لكل نوع.
  function kindBadge(row) {
    const kind = row.entry_kind || (row.direction === "out" ? "spend" : "custody");
    if (kind === "income") return <span className="badge ok">قبض عميل</span>;
    if (kind === "spend") return <span className="badge warn">صرف</span>;
    return <span className="badge muted">عهدة</span>;
  }

  return (
    <div className="stack">
      {isOwner && (
      <section className="panel">
        <div className="panel-title"><Landmark size={20} /><h2>المركز المالي للشركة</h2></div>
        <div className="stats-grid compact-stats">
          <Metric label="السيولة النقدية (الخزنة)" value={`${money(stats.balance)} ج`} tone={stats.balance >= 0 ? "ok" : "danger"} icon={Vault} />
          <Metric label="سلف مستحقة على الموظفين" value={`${money(position.loansOutstanding)} ج`} icon={HandCoins} />
          <Metric
            label="صافي مستحقات Air Ocean"
            value={`${money(Math.abs(position.partnerNet))} ج ${position.partnerNet >= 0 ? "لنا" : "علينا"}`}
            tone={position.partnerNet >= 0 ? "ok" : "danger"}
            icon={Scale}
          />
          <Metric label="إجمالي أموال الشركة" value={`${money(position.total)} ج`} tone={position.total >= 0 ? "gold" : "danger"} icon={Coins} />
          {netPayroll !== null && (
            <>
              <Metric label={`مرتبات ${todayIso().slice(0, 7)} بعد الخصومات`} value={`${money(netPayroll)} ج`} tone="warn" icon={Banknote} />
              <Metric
                label="الصافي بعد سداد المرتبات"
                value={`${money(position.total - netPayroll)} ج`}
                tone={position.total - netPayroll >= 0 ? "ok" : "danger"}
                icon={Wallet}
              />
            </>
          )}
        </div>
        <p className="muted">
          الإجمالي = السيولة النقدية بالخزنة + السلف القائمة على الموظفين (تُحصَّل من الرواتب)
          + صافي مستحقات Air Ocean (مستحق لنا {money(position.partnerToUs)} ج − مستحق علينا {money(position.partnerByUs)} ج).
          لا يشمل هذا الإجمالي الدفتر الشخصي أو المصروفات الشخصية.
          {netPayroll !== null && " مرتبات الشهر تُعرض كالتزام مستحق بعد كل الخصومات، والصافي بعد سدادها = الإجمالي − المرتبات."}
        </p>
      </section>
      )}

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
          <Metric label="مقبوضات العملاء" value={`${money(stats.incomeTotal)} ج`} tone="ok" icon={Receipt} />
          <Metric label="عُهد التمويل" value={`${money(stats.custodyTotal)} ج`} icon={PiggyBank} />
          <Metric label="المصروف (كلي)" value={`${money(stats.outTotal)} ج`} tone="warn" icon={Wallet} />
          <Metric label={`المصروف ${month}`} value={`${money(stats.spentMonth)} ج`} tone="gold" icon={Banknote} />
        </div>
        <p className="muted">
          الرصيد = (مقبوضات العملاء + عُهد التمويل) − المصروف. أي صرف من الخزنة يُضاف تلقائيًا إلى صفحة «المصروفات»،
          والمصروف يُخصم من الرصيد بعد تأكيد المالك فقط.
        </p>
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

      <form className="panel form" onSubmit={submitIncome}>
        <div className="panel-title"><Receipt size={20} /><h2>قبض من عميل (إيراد الشحنات)</h2></div>
        <p className="muted">أي فلوس بتدخل الخزنة من عميل (مصاريف شحنة، دفعة، تحصيل) سجّلها هنا — بتزوّد رصيد الخزنة فورًا.</p>
        <div className="form-grid">
          <label>العميل / الجهة<input value={income.client} onChange={(e) => setIncome((f) => ({ ...f, client: e.target.value }))} placeholder="اسم العميل (اختياري)" /></label>
          <label>المبلغ<input type="number" min="0.5" step="0.01" value={income.amount} onChange={(e) => setIncome((f) => ({ ...f, amount: e.target.value }))} required /></label>
          <label>التاريخ<input type="date" value={income.date} onChange={(e) => setIncome((f) => ({ ...f, date: e.target.value }))} required /></label>
        </div>
        <label>البيان / رقم الشحنة<input value={income.note} onChange={(e) => setIncome((f) => ({ ...f, note: e.target.value }))} placeholder="مثال: مصاريف شحنة رقم 1234" /></label>
        <button className="primary" disabled={busy === "income"}>{busy === "income" ? "جارٍ الحفظ..." : "تسجيل القبض"}</button>
      </form>

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
        <div className="table-wrap cards-on-mobile">
          <table>
            <thead><tr><th>التاريخ</th><th>النوع</th><th>مع/من</th><th>المبلغ</th><th>البيان</th><th>الحالة</th><th>إجراء</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan="7">جارٍ التحميل...</td></tr>}
              {!loading && monthEntries.length === 0 && <tr><td colSpan="7">لا توجد حركة في {month}.</td></tr>}
              {!loading && monthEntries.map((row) => (
                <tr key={row.id}>
                  <td data-label="التاريخ" dir="ltr">{row.entry_date}</td>
                  <td data-label="النوع">{kindBadge(row)}</td>
                  <td data-label="مع/من">{maskActor(row.holder_name, role) || "الخزنة"}</td>
                  <td data-label="المبلغ">{money(row.amount)} ج</td>
                  <td data-label="البيان" className="note-cell">{row.note || (row.direction === "out" ? "صرف" : "-")}</td>
                  <td data-label="الحالة">{row.status === "voided" ? <StatusBadge status="voided" /> : <StatusBadge status="active" />}</td>
                  <td data-label="إجراء" className="card-actions">
                    <span className="approval-actions">
                      {isOwner && row.status === "active" && (
                        <button className="link" onClick={() => setEditRow(row)}><Pencil size={14} /> تعديل</button>
                      )}
                      {row.status === "active" && canVoid(row) && (
                        <button className="danger-link" onClick={() => requestVoid("treasury", row.id)}>إلغاء</button>
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
        title={editRow?.direction === "in" ? "تعديل العهدة" : "تعديل الصرف"}
        busy={editBusy}
        fields={editRow ? [
          { name: "date", label: "التاريخ", type: "date", value: editRow.entry_date },
          { name: "amount", label: "المبلغ", type: "number", min: "0.5", step: "0.01", value: String(editRow.amount) },
          { name: "holder", label: "مع/من", type: "text", value: editRow.holder_name || "" },
          { name: "note", label: "البيان", type: "text", value: editRow.note || "" },
        ] : []}
        onSubmit={saveEdit}
        onCancel={() => setEditRow(null)}
      />
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

import { useEffect, useMemo, useState } from "react";
import { Banknote, FileSpreadsheet, Receipt, Wallet, TrendingUp } from "lucide-react";
import { supabase, todayIso } from "../../lib/supabase";
import { cls } from "../../lib/cls";
import { monthRangeFor } from "../../lib/dates";
import { csvCell, downloadTextFile, money } from "../../lib/format";
import { deductionCategoryLabels, statusLabels } from "../../lib/labels";
import { Metric, StatusBadge } from "../../ui/legacy";
import { Pencil } from "lucide-react";
import { useUid, useVoidDialog, maskActor, FinanceEditModal } from "./shared";
import { SkeletonList, SkeletonTableRows } from "../../ui/primitives";

function DeductionsView({ context, onToast }) {
  const role = context?.role || "employee";
  const isAdmin = role === "hr" || role === "owner";
  if (isAdmin) return <DeductionsAdmin context={context} onToast={onToast} />;
  if (!context?.employee) return <p className="muted">لا يوجد ملف موظف مرتبط بحسابك.</p>;
  return <DeductionsEmployee context={context} />;
}

function DeductionsEmployee({ context }) {
  const empId = context.employee.id;
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [loans, setLoans] = useState([]);
  const [installments, setInstallments] = useState([]);
  const [canteen, setCanteen] = useState([]);
  const [others, setOthers] = useState([]);
  const [loading, setLoading] = useState(true);
  const range = useMemo(() => monthRangeFor(month), [month]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from("emp_loans").select("*").eq("employee_id", empId).order("created_at", { ascending: false }),
      supabase.from("emp_loan_installments").select("*").eq("employee_id", empId).order("due_month"),
      supabase.from("canteen_entries").select("*").eq("employee_id", empId).gte("entry_date", range.from).lte("entry_date", range.to).order("entry_date", { ascending: false }),
      supabase.from("other_deductions").select("*").eq("employee_id", empId).gte("entry_date", range.from).lte("entry_date", range.to).order("entry_date", { ascending: false }),
    ]).then(([l, i, c, o]) => {
      setLoans(l.data || []);
      setInstallments(i.data || []);
      setCanteen(c.data || []);
      setOthers(o.data || []);
      setLoading(false);
    });
  }, [empId, range.from, range.to]);

  const activeLoanIds = useMemo(() => new Set(loans.filter((l) => l.status === "active").map((l) => l.id)), [loans]);
  const summary = useMemo(() => {
    const monthInstallment = installments
      .filter((i) => activeLoanIds.has(i.loan_id) && i.due_month === month)
      .reduce((sum, i) => sum + Number(i.amount), 0);
    const canteenTotal = canteen.filter((c) => c.status === "active").reduce((sum, c) => sum + Number(c.amount), 0);
    const otherTotal = others.filter((o) => o.status === "active").reduce((sum, o) => sum + Number(o.amount), 0);
    const loanRemaining = loans
      .filter((l) => l.status === "active")
      .reduce((sum, l) => {
        const paid = installments
          .filter((i) => i.loan_id === l.id && i.due_month < todayIso().slice(0, 7))
          .reduce((s, i) => s + Number(i.amount), 0);
        return sum + Math.max(0, Number(l.amount) - paid);
      }, 0);
    return { monthInstallment, canteenTotal, otherTotal, loanRemaining, monthTotal: monthInstallment + canteenTotal + otherTotal };
  }, [loans, installments, canteen, others, activeLoanIds, month]);

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-title between">
          <div><Banknote size={20} /><h2>استقطاعاتي</h2></div>
          <div className="toolbar">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        </div>
        <div className="stats-grid compact-stats">
          <Metric label={`إجمالي استقطاعات ${month}`} value={`${money(summary.monthTotal)} ج`} tone="gold" icon={Banknote} />
          <Metric label="قسط السلفة" value={`${money(summary.monthInstallment)} ج`} tone="warn" icon={Wallet} />
          <Metric label="كانتين الشهر" value={`${money(summary.canteenTotal)} ج`} tone="info" icon={Receipt} />
          <Metric label="متبقي سلف" value={`${money(summary.loanRemaining)} ج`} tone="danger" icon={TrendingUp} />
        </div>
        <p className="muted">الاستقطاعات دي بتتخصم تلقائيًا من مرتب الشهر.</p>
      </section>

      <section className="panel">
        <div className="panel-title"><Wallet size={20} /><h2>سلفي</h2></div>
        <div className="list">
          {loading && <SkeletonList />}
          {!loading && loans.length === 0 && <p className="muted">لا توجد سلف مسجلة.</p>}
          {loans.map((loan) => {
            const schedule = installments.filter((i) => i.loan_id === loan.id);
            const paid = schedule.filter((i) => i.due_month < todayIso().slice(0, 7)).reduce((s, i) => s + Number(i.amount), 0);
            return (
              <div className="list-row" key={loan.id}>
                <div>
                  <strong>سلفة {money(loan.amount)} ج</strong>
                  <span>{loan.installments_count} قسط · بداية {loan.start_month}</span>
                </div>
                {loan.status === "active" ? (
                  <p>مسدد: {money(paid)} ج · متبقي: {money(Math.max(0, loan.amount - paid))} ج</p>
                ) : (
                  <p><StatusBadge status="voided" /> {loan.void_reason || ""}</p>
                )}
                {loan.note && <p className="muted">{loan.note}</p>}
                {loan.status === "active" && (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>الشهر</th><th>القسط</th><th>الحالة</th></tr></thead>
                      <tbody>
                        {schedule.map((i) => (
                          <tr key={i.id}>
                            <td dir="ltr">{i.due_month}</td>
                            <td>{money(i.amount)} ج</td>
                            <td><StatusBadge status={i.due_month < todayIso().slice(0, 7) ? "settled" : "pending"} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid two">
        <section className="panel">
          <div className="panel-title"><Receipt size={20} /><h2>كانتين {month}</h2></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>التاريخ</th><th>الصنف</th><th>المبلغ</th><th>الحالة</th></tr></thead>
              <tbody>
                {!loading && canteen.length === 0 && <tr><td colSpan="4">لا توجد مشتريات.</td></tr>}
                {canteen.map((row) => (
                  <tr key={row.id}>
                    <td dir="ltr">{row.entry_date}</td>
                    <td>{row.item}</td>
                    <td>{money(row.amount)} ج</td>
                    <td><StatusBadge status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <div className="panel-title"><Banknote size={20} /><h2>استقطاعات أخرى {month}</h2></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>ملاحظة</th><th>الحالة</th></tr></thead>
              <tbody>
                {!loading && others.length === 0 && <tr><td colSpan="5">لا توجد استقطاعات.</td></tr>}
                {others.map((row) => (
                  <tr key={row.id}>
                    <td dir="ltr">{row.entry_date}</td>
                    <td>{deductionCategoryLabels[row.category] || row.category}</td>
                    <td>{money(row.amount)} ج</td>
                    <td className="note-cell">{row.note || "-"}</td>
                    <td><StatusBadge status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function DeductionsAdmin({ context, onToast }) {
  const role = context?.role || "employee";
  const isOwner = role === "owner";
  const uid = useUid();
  const [tab, setTab] = useState("loans");
  const [employees, setEmployees] = useState([]);
  const [month, setMonth] = useState(() => todayIso().slice(0, 7));
  const [empFilter, setEmpFilter] = useState("all");
  const [loans, setLoans] = useState([]);
  const [installments, setInstallments] = useState([]);
  const [canteen, setCanteen] = useState([]);
  const [others, setOthers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loanForm, setLoanForm] = useState({ employeeId: "", amount: "", installments: 3, startMonth: todayIso().slice(0, 7), note: "" });
  const [canteenForm, setCanteenForm] = useState({ employeeId: "", item: "", amount: "", date: todayIso(), note: "" });
  const [otherForm, setOtherForm] = useState({ employeeId: "", category: "damage", amount: "", date: todayIso(), note: "" });
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null); // { kind, row }
  const [editBusy, setEditBusy] = useState(false);
  const { requestVoid, voidDialog } = useVoidDialog(onToast, () => loadData());
  const range = useMemo(() => monthRangeFor(month), [month]);

  async function saveEdit(values) {
    setEditBusy(true);
    const rpc = { loan: "edit_loan_v1", canteen: "edit_canteen_entry_v1", other: "edit_other_deduction_v1" }[edit.kind];
    const args = edit.kind === "loan"
      ? { p_id: edit.row.id, p_amount: Number(values.amount), p_installments: Number(values.installments), p_start_month: values.startMonth, p_note: values.note || null }
      : edit.kind === "canteen"
        ? { p_id: edit.row.id, p_item: values.item, p_amount: Number(values.amount), p_date: values.date, p_note: values.note || null }
        : { p_id: edit.row.id, p_category: values.category, p_amount: Number(values.amount), p_date: values.date, p_note: values.note || null };
    const { data, error } = await supabase.rpc(rpc, args);
    setEditBusy(false);
    if (error || data?.error) return onToast(data?.message || "تعذر التعديل.");
    setEdit(null);
    onToast("تم التعديل.");
    loadData();
  }

  const editFields = () => {
    if (!edit) return [];
    const r = edit.row;
    if (edit.kind === "loan") return [
      { name: "amount", label: "المبلغ", type: "number", min: "0.5", step: "0.01", value: String(r.amount) },
      { name: "installments", label: "عدد الأقساط", type: "number", min: "1", value: String(r.installments_count) },
      { name: "startMonth", label: "شهر البداية", type: "month", value: r.start_month },
      { name: "note", label: "ملاحظة", type: "text", value: r.note || "" },
    ];
    if (edit.kind === "canteen") return [
      { name: "date", label: "التاريخ", type: "date", value: r.entry_date },
      { name: "item", label: "الصنف", type: "text", value: r.item || "" },
      { name: "amount", label: "المبلغ", type: "number", min: "0.5", step: "0.01", value: String(r.amount) },
      { name: "note", label: "ملاحظة", type: "text", value: r.note || "" },
    ];
    return [
      { name: "date", label: "التاريخ", type: "date", value: r.entry_date },
      { name: "category", label: "النوع", type: "select", value: r.category,
        options: Object.entries(deductionCategoryLabels).map(([value, label]) => ({ value, label })) },
      { name: "amount", label: "المبلغ", type: "number", min: "0.5", step: "0.01", value: String(r.amount) },
      { name: "note", label: "ملاحظة", type: "text", value: r.note || "" },
    ];
  };

  useEffect(() => {
    supabase.from("employees").select("id,name,active").eq("active", true).order("id").then(({ data }) => {
      const list = data || [];
      setEmployees(list);
      if (list[0]) {
        const first = String(list[0].id);
        setLoanForm((f) => (f.employeeId ? f : { ...f, employeeId: first }));
        setCanteenForm((f) => (f.employeeId ? f : { ...f, employeeId: first }));
        setOtherForm((f) => (f.employeeId ? f : { ...f, employeeId: first }));
      }
    });
  }, []);

  useEffect(() => {
    loadData();
  }, [range.from, range.to]);

  async function loadData() {
    setLoading(true);
    // Loans are visible to HR too (owner decision) — the RLS allows it, and
    // the owner's own name is masked below for non-owner viewers.
    const [c, o, l, i] = await Promise.all([
      supabase.from("canteen_entries").select("*").gte("entry_date", range.from).lte("entry_date", range.to).order("entry_date", { ascending: false }),
      supabase.from("other_deductions").select("*").gte("entry_date", range.from).lte("entry_date", range.to).order("entry_date", { ascending: false }),
      supabase.from("emp_loans").select("*").order("created_at", { ascending: false }),
      supabase.from("emp_loan_installments").select("*").order("due_month"),
    ]);
    setCanteen(c.data || []);
    setOthers(o.data || []);
    setLoans(l?.data || []);
    setInstallments(i?.data || []);
    setLoading(false);
  }

  // Employee-name lookup with the owner's name masked for HR (amounts stay).
  const empName = useMemo(
    () => new Map(employees.map((e) => [e.id, maskActor(e.name, role) || e.name])),
    [employees, role]
  );
  const canVoid = (row) =>
    isOwner || (row.created_by === uid && row.entry_date === todayIso() && row.status === "active");

  async function submitLoan(event) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("add_loan_v1", {
      p_employee_id: Number(loanForm.employeeId),
      p_amount: Number(loanForm.amount),
      p_installments: Number(loanForm.installments),
      p_start_month: loanForm.startMonth,
      p_note: loanForm.note || null,
    });
    setBusy(false);
    if (error || data?.error) onToast(data?.message || "تعذر تسجيل السلفة.");
    else {
      onToast(`تم تسجيل السلفة — القسط الشهري ${money(data.installment)} ج${data.last_installment !== data.installment ? ` والأخير ${money(data.last_installment)} ج` : ""}.`);
      setLoanForm((f) => ({ ...f, amount: "", note: "" }));
      loadData();
    }
  }

  async function submitCanteen(event) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("add_canteen_entry_v1", {
      p_employee_id: Number(canteenForm.employeeId),
      p_item: canteenForm.item,
      p_amount: Number(canteenForm.amount),
      p_date: canteenForm.date,
      p_note: canteenForm.note || null,
    });
    setBusy(false);
    if (error || data?.error) onToast(data?.message || "تعذر تسجيل الكانتين.");
    else {
      onToast("تم تسجيل مشتريات الكانتين.");
      setCanteenForm((f) => ({ ...f, item: "", amount: "", note: "" }));
      loadData();
    }
  }

  async function submitOther(event) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("add_other_deduction_v1", {
      p_employee_id: Number(otherForm.employeeId),
      p_category: otherForm.category,
      p_amount: Number(otherForm.amount),
      p_date: otherForm.date,
      p_note: otherForm.note || null,
    });
    setBusy(false);
    if (error || data?.error) onToast(data?.message || "تعذر تسجيل الاستقطاع.");
    else {
      onToast("تم تسجيل الاستقطاع.");
      setOtherForm((f) => ({ ...f, amount: "", note: "" }));
      loadData();
    }
  }

  function exportRows(kind) {
    const source = kind === "canteen" ? canteen : others;
    const rows = source.filter((r) => empFilter === "all" || String(r.employee_id) === empFilter);
    const header = kind === "canteen"
      ? ["التاريخ", "الموظف", "الصنف", "المبلغ", "ملاحظة", "سجّله", "الحالة"]
      : ["التاريخ", "الموظف", "النوع", "المبلغ", "ملاحظة", "سجّله", "الحالة"];
    const lines = rows.map((r) => [
      r.entry_date,
      empName.get(r.employee_id) || r.employee_id,
      kind === "canteen" ? r.item : (deductionCategoryLabels[r.category] || r.category),
      r.amount,
      r.note || "",
      maskActor(r.created_by_name, role) || "",
      statusLabels[r.status] || r.status,
    ].map(csvCell).join(","));
    downloadTextFile(`${kind}-${month}.csv`, "﻿" + `${header.map(csvCell).join(",")}\n${lines.join("\n")}`);
  }

  const employeeSelect = (value, onChange) => (
    <select value={value} onChange={onChange} required>
      {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
    </select>
  );

  const filteredCanteen = canteen.filter((r) => empFilter === "all" || String(r.employee_id) === empFilter);
  const filteredOthers = others.filter((r) => empFilter === "all" || String(r.employee_id) === empFilter);
  const filteredLoans = loans.filter((r) => empFilter === "all" || String(r.employee_id) === empFilter);

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-title between">
          <div><Banknote size={20} /><h2>الاستقطاعات</h2></div>
          <div className="toolbar">
            <select value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}>
              <option value="all">كل الموظفين</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{empName.get(emp.id) || emp.name}</option>)}
            </select>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        </div>
        <div className="tabs compact-tabs">
          <button className={cls(tab === "loans" && "active")} onClick={() => setTab("loans")}>سلف</button>
          <button className={cls(tab === "canteen" && "active")} onClick={() => setTab("canteen")}>كانتين</button>
          <button className={cls(tab === "other" && "active")} onClick={() => setTab("other")}>أخرى</button>
        </div>

        {tab === "loans" && (
          <div className="stack">
            <form className="form" onSubmit={submitLoan}>
              <div className="form-grid">
                <label>الموظف{employeeSelect(loanForm.employeeId, (e) => setLoanForm((f) => ({ ...f, employeeId: e.target.value })))}</label>
                <label>المبلغ<input type="number" min="1" step="0.01" value={loanForm.amount} onChange={(e) => setLoanForm((f) => ({ ...f, amount: e.target.value }))} required placeholder="مثال: 3000" /></label>
              </div>
              <div className="form-grid">
                <label>عدد الأقساط<input type="number" min="1" max="60" value={loanForm.installments} onChange={(e) => setLoanForm((f) => ({ ...f, installments: e.target.value }))} required /></label>
                <label>شهر أول قسط<input type="month" value={loanForm.startMonth} onChange={(e) => setLoanForm((f) => ({ ...f, startMonth: e.target.value }))} required /></label>
              </div>
              <label>ملاحظة<input value={loanForm.note} onChange={(e) => setLoanForm((f) => ({ ...f, note: e.target.value }))} placeholder="اختياري" /></label>
              <button className="primary" disabled={busy}>{busy ? "جارٍ التسجيل..." : "تسجيل سلفة"}</button>
              <p className="muted">القسط بيتخصم تلقائيًا من مرتب كل شهر بداية من شهر أول قسط.</p>
            </form>
            <div className="table-wrap cards-on-mobile">
              <table>
                <thead><tr><th>الموظف</th><th>الأصل</th><th>الأقساط</th><th>مسدد</th><th>متبقي</th><th>بداية</th><th>الحالة</th><th>إجراء</th></tr></thead>
                <tbody>
                  {loading && <SkeletonTableRows colSpan={8} />}
                  {!loading && filteredLoans.length === 0 && <tr><td colSpan="8">لا توجد سلف.</td></tr>}
                  {!loading && filteredLoans.map((loan) => {
                    const schedule = installments.filter((i) => i.loan_id === loan.id);
                    const paid = loan.status === "active"
                      ? schedule.filter((i) => i.due_month < todayIso().slice(0, 7)).reduce((s, i) => s + Number(i.amount), 0)
                      : 0;
                    return (
                      <tr key={loan.id}>
                        <td data-label="الموظف">{empName.get(loan.employee_id) || loan.employee_id}</td>
                        <td data-label="الأصل">{money(loan.amount)} ج</td>
                        <td data-label="الأقساط">{loan.installments_count} × {money(schedule[0]?.amount || loan.amount / loan.installments_count)} ج</td>
                        <td data-label="مسدد">{money(paid)} ج</td>
                        <td data-label="متبقي"><strong>{money(Math.max(0, loan.amount - paid))} ج</strong></td>
                        <td data-label="بداية" dir="ltr">{loan.start_month}</td>
                        <td data-label="الحالة"><StatusBadge status={loan.status} /></td>
                        <td data-label="إجراء" className="card-actions">{loan.status === "active" ? (
                          <span className="approval-actions">
                            {isOwner && <button className="link" onClick={() => setEdit({ kind: "loan", row: loan })}><Pencil size={14} /> تعديل</button>}
                            <button className="danger-link" onClick={() => requestVoid("loan", loan.id)}>إلغاء</button>
                          </span>
                        ) : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "canteen" && (
          <div className="stack">
            <form className="form" onSubmit={submitCanteen}>
              <div className="form-grid">
                <label>الموظف{employeeSelect(canteenForm.employeeId, (e) => setCanteenForm((f) => ({ ...f, employeeId: e.target.value })))}</label>
                <label>الصنف<input value={canteenForm.item} onChange={(e) => setCanteenForm((f) => ({ ...f, item: e.target.value }))} required placeholder="مثال: مياه + شيبسي" /></label>
              </div>
              <div className="form-grid">
                <label>المبلغ<input type="number" min="0.5" step="0.01" value={canteenForm.amount} onChange={(e) => setCanteenForm((f) => ({ ...f, amount: e.target.value }))} required /></label>
                <label>التاريخ<input type="date" value={canteenForm.date} onChange={(e) => setCanteenForm((f) => ({ ...f, date: e.target.value }))} required /></label>
              </div>
              <label>ملاحظة<input value={canteenForm.note} onChange={(e) => setCanteenForm((f) => ({ ...f, note: e.target.value }))} placeholder="اختياري" /></label>
              <button className="primary" disabled={busy}>{busy ? "جارٍ التسجيل..." : "تسجيل كانتين"}</button>
            </form>
            <div className="toolbar">
              <button className="secondary" onClick={() => exportRows("canteen")} disabled={filteredCanteen.length === 0}>
                <FileSpreadsheet size={16} /> Excel
              </button>
            </div>
            <div className="table-wrap cards-on-mobile">
              <table>
                <thead><tr><th>التاريخ</th><th>الموظف</th><th>الصنف</th><th>المبلغ</th><th>سجّله</th><th>الحالة</th><th>إجراء</th></tr></thead>
                <tbody>
                  {loading && <SkeletonTableRows colSpan={7} />}
                  {!loading && filteredCanteen.length === 0 && <tr><td colSpan="7">لا توجد مشتريات في {month}.</td></tr>}
                  {!loading && filteredCanteen.map((row) => (
                    <tr key={row.id}>
                      <td data-label="التاريخ" dir="ltr">{row.entry_date}</td>
                      <td data-label="الموظف">{empName.get(row.employee_id) || row.employee_id}</td>
                      <td data-label="الصنف">{row.item}</td>
                      <td data-label="المبلغ">{money(row.amount)} ج</td>
                      <td data-label="سجّله">{maskActor(row.created_by_name, role) || "-"}</td>
                      <td data-label="الحالة"><StatusBadge status={row.status} /></td>
                      <td data-label="إجراء" className="card-actions">{row.status === "active" ? (
                        <span className="approval-actions">
                          {isOwner && <button className="link" onClick={() => setEdit({ kind: "canteen", row })}><Pencil size={14} /> تعديل</button>}
                          {canVoid(row) && <button className="danger-link" onClick={() => requestVoid("canteen", row.id)}>إلغاء</button>}
                        </span>
                      ) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "other" && (
          <div className="stack">
            <form className="form" onSubmit={submitOther}>
              <div className="form-grid">
                <label>الموظف{employeeSelect(otherForm.employeeId, (e) => setOtherForm((f) => ({ ...f, employeeId: e.target.value })))}</label>
                <label>النوع<select value={otherForm.category} onChange={(e) => setOtherForm((f) => ({ ...f, category: e.target.value }))}>{Object.entries(deductionCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              </div>
              <div className="form-grid">
                <label>المبلغ<input type="number" min="0.5" step="0.01" value={otherForm.amount} onChange={(e) => setOtherForm((f) => ({ ...f, amount: e.target.value }))} required /></label>
                <label>التاريخ<input type="date" value={otherForm.date} onChange={(e) => setOtherForm((f) => ({ ...f, date: e.target.value }))} required /></label>
              </div>
              <label>ملاحظة<input value={otherForm.note} onChange={(e) => setOtherForm((f) => ({ ...f, note: e.target.value }))} placeholder="اكتب السبب بوضوح" /></label>
              <button className="primary" disabled={busy}>{busy ? "جارٍ التسجيل..." : "تسجيل استقطاع"}</button>
            </form>
            <div className="toolbar">
              <button className="secondary" onClick={() => exportRows("other")} disabled={filteredOthers.length === 0}>
                <FileSpreadsheet size={16} /> Excel
              </button>
            </div>
            <div className="table-wrap cards-on-mobile">
              <table>
                <thead><tr><th>التاريخ</th><th>الموظف</th><th>النوع</th><th>المبلغ</th><th>ملاحظة</th><th>سجّله</th><th>الحالة</th><th>إجراء</th></tr></thead>
                <tbody>
                  {loading && <SkeletonTableRows colSpan={8} />}
                  {!loading && filteredOthers.length === 0 && <tr><td colSpan="8">لا توجد استقطاعات في {month}.</td></tr>}
                  {!loading && filteredOthers.map((row) => (
                    <tr key={row.id}>
                      <td data-label="التاريخ" dir="ltr">{row.entry_date}</td>
                      <td data-label="الموظف">{empName.get(row.employee_id) || row.employee_id}</td>
                      <td data-label="النوع">{deductionCategoryLabels[row.category] || row.category}</td>
                      <td data-label="المبلغ">{money(row.amount)} ج</td>
                      <td data-label="ملاحظة" className="note-cell">{row.note || "-"}</td>
                      <td data-label="سجّله">{maskActor(row.created_by_name, role) || "-"}</td>
                      <td data-label="الحالة"><StatusBadge status={row.status} /></td>
                      <td data-label="إجراء" className="card-actions">{row.status === "active" ? (
                        <span className="approval-actions">
                          {isOwner && <button className="link" onClick={() => setEdit({ kind: "other", row })}><Pencil size={14} /> تعديل</button>}
                          {canVoid(row) && <button className="danger-link" onClick={() => requestVoid("other", row.id)}>إلغاء</button>}
                        </span>
                      ) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
      {voidDialog}
      <FinanceEditModal
        open={Boolean(edit)}
        title={edit?.kind === "loan" ? "تعديل السلفة" : edit?.kind === "canteen" ? "تعديل الكانتين" : "تعديل الاستقطاع"}
        busy={editBusy}
        fields={editFields()}
        onSubmit={saveEdit}
        onCancel={() => setEdit(null)}
      />
    </div>
  );
}

export default DeductionsView;

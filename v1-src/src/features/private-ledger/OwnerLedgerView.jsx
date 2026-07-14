import { useEffect, useMemo, useState } from "react";
import { Banknote, RefreshCcw, Wallet, TrendingUp, Users } from "lucide-react";
import { supabase, todayIso } from "../../lib/supabase";

import { money, normalizeArabicName } from "../../lib/format";

import { Metric, StatusBadge } from "../../ui/legacy";

function OwnerLedgerView({ onToast }) {
  const [entries, setEntries] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ person: "", direction: "lent", amount: "", date: todayIso(), note: "" });
  const [payFor, setPayFor] = useState(null);
  const [payForm, setPayForm] = useState({ amount: "", date: todayIso(), note: "" });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [e, p] = await Promise.all([
      supabase.from("owner_ledger_entries").select("*").order("entry_date", { ascending: false }).order("id", { ascending: false }),
      supabase.from("owner_ledger_payments").select("*").order("pay_date", { ascending: false }),
    ]);
    setEntries(e.data || []);
    setPayments(p.data || []);
    setLoading(false);
  }

  const enriched = useMemo(() => {
    const byEntry = payments.reduce((acc, p) => {
      const list = acc.get(p.entry_id) || [];
      list.push(p);
      acc.set(p.entry_id, list);
      return acc;
    }, new Map());
    return entries.map((entry) => {
      const list = byEntry.get(entry.id) || [];
      const paid = list.reduce((sum, p) => sum + Number(p.amount), 0);
      return { ...entry, payments: list, paid, remaining: Math.max(0, Number(entry.amount) - paid) };
    });
  }, [entries, payments]);

  // Group by NORMALIZED name so different spellings (فورة/فوره) merge into one.
  const byPerson = useMemo(() => {
    const map = new Map();
    enriched.forEach((entry) => {
      const key = normalizeArabicName(entry.person);
      const cur = map.get(key) || { label: entry.person, entries: [] };
      cur.entries.push(entry);
      map.set(key, cur);
    });
    return [...map.values()].map((g) => [g.label, g.entries]);
  }, [enriched]);

  // Top summary: net remaining per person (sorted by size), for a quick "who owes what".
  const debtors = useMemo(() => {
    return byPerson
      .map(([person, list]) => ({ person, net: list.reduce((s, e) => s + (e.direction === "lent" ? e.remaining : -e.remaining), 0) }))
      .filter((x) => Math.abs(x.net) > 0.01)
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  }, [byPerson]);

  const totals = useMemo(() => {
    const lent = enriched.filter((e) => e.direction === "lent").reduce((sum, e) => sum + e.remaining, 0);
    const borrowed = enriched.filter((e) => e.direction === "borrowed").reduce((sum, e) => sum + e.remaining, 0);
    return { lent, borrowed, net: lent - borrowed };
  }, [enriched]);

  async function submitEntry(event) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("owner_ledger_entries").insert({
      person: form.person.trim(),
      direction: form.direction,
      amount: Number(form.amount),
      entry_date: form.date,
      note: form.note.trim() || null,
    });
    setBusy(false);
    if (error) onToast("تعذر التسجيل: " + error.message);
    else {
      onToast("تم التسجيل في الدفتر.");
      setForm((f) => ({ ...f, person: "", amount: "", note: "" }));
      loadData();
    }
  }

  async function submitPayment(event, entryId) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("owner_ledger_payments").insert({
      entry_id: entryId,
      amount: Number(payForm.amount),
      pay_date: payForm.date,
      note: payForm.note.trim() || null,
    });
    setBusy(false);
    if (error) onToast("تعذر تسجيل الدفعة: " + error.message);
    else {
      onToast("تم تسجيل الدفعة.");
      setPayFor(null);
      setPayForm({ amount: "", date: todayIso(), note: "" });
      loadData();
    }
  }

  async function removeEntry(id) {
    if (!confirm("تحذف القيد ده وكل دفعاته نهائيًا؟")) return;
    const { error } = await supabase.from("owner_ledger_entries").delete().eq("id", id);
    if (error) onToast("تعذر الحذف: " + error.message);
    else {
      onToast("تم الحذف.");
      loadData();
    }
  }

  async function removePayment(id) {
    if (!confirm("تحذف الدفعة دي؟")) return;
    const { error } = await supabase.from("owner_ledger_payments").delete().eq("id", id);
    if (error) onToast("تعذر الحذف: " + error.message);
    else {
      onToast("تم حذف الدفعة.");
      loadData();
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-title between">
          <div><Wallet size={20} /><h2>الدفتر الشخصي</h2></div>
          <button className="secondary" onClick={loadData}><RefreshCcw size={16} /> تحديث</button>
        </div>
        <div className="stats-grid compact-stats">
          <Metric label="سلّفته لناس" value={`${money(totals.lent)} ج`} tone="ok" icon={TrendingUp} />
          <Metric label="عليّ لناس" value={`${money(totals.borrowed)} ج`} tone="danger" icon={Banknote} />
          <Metric label="الصافي" value={`${money(Math.abs(totals.net))} ج ${totals.net >= 0 ? "ليك" : "عليك"}`} tone={totals.net >= 0 ? "ok" : "warn"} icon={Wallet} />
        </div>
        <p className="muted">الدفتر ده شخصي — محدش بيشوفه غيرك حتى الـ HR.</p>
      </section>

      {debtors.length > 0 && (
        <section className="panel">
          <div className="panel-title"><Users size={20} /><h2>إجمالي كل شخص</h2></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>الشخص</th><th>المتبقي</th><th>لصالح مين</th></tr></thead>
              <tbody>
                {debtors.map((x) => (
                  <tr key={x.person}>
                    <td>{x.person}</td>
                    <td>{money(Math.abs(x.net))} ج</td>
                    <td>{x.net >= 0 ? <span className="badge ok">ليك</span> : <span className="badge danger">عليك</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <form className="panel form" onSubmit={submitEntry}>
        <div className="panel-title"><Wallet size={20} /><h2>قيد جديد</h2></div>
        <div className="form-grid">
          <label>الاسم<input value={form.person} onChange={(e) => setForm((f) => ({ ...f, person: e.target.value }))} required placeholder="اسم الشخص" /></label>
          <label>الاتجاه<select value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}><option value="lent">سلّفته فلوس</option><option value="borrowed">استلفت منه</option></select></label>
        </div>
        <div className="form-grid">
          <label>المبلغ<input type="number" min="0.5" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required /></label>
          <label>التاريخ<input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required /></label>
        </div>
        <label>ملاحظة<input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="اختياري" /></label>
        <button className="primary" disabled={busy}>{busy ? "جار التسجيل..." : "تسجيل"}</button>
      </form>

      {loading && <p className="muted">جاري التحميل...</p>}
      {!loading && byPerson.length === 0 && (
        <section className="panel"><p className="muted">الدفتر فاضي — سجّل أول قيد.</p></section>
      )}
      {byPerson.map(([person, personEntries]) => {
        const personRemaining = personEntries.reduce((sum, e) => sum + (e.direction === "lent" ? e.remaining : -e.remaining), 0);
        return (
          <section className="panel" key={person}>
            <div className="panel-title between">
              <div><Wallet size={20} /><h2>{person}</h2></div>
              <span className="badge">{personRemaining >= 0 ? `ليك ${money(personRemaining)} ج` : `عليك ${money(-personRemaining)} ج`}</span>
            </div>
            <div className="list">
              {personEntries.map((entry) => (
                <div className="list-row" key={entry.id}>
                  <div>
                    <strong>{entry.direction === "lent" ? "سلّفته" : "استلفت"} {money(entry.amount)} ج</strong>
                    <span>{entry.entry_date}{entry.note ? ` · ${entry.note}` : ""}</span>
                  </div>
                  <p>سدد: {money(entry.paid)} ج · متبقي: <strong>{money(entry.remaining)} ج</strong> {entry.remaining <= 0 && <StatusBadge status="settled" />}</p>
                  {entry.payments.length > 0 && (
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>التاريخ</th><th>المبلغ</th><th>ملاحظة</th><th>إجراء</th></tr></thead>
                        <tbody>
                          {entry.payments.map((p) => (
                            <tr key={p.id}>
                              <td dir="ltr">{p.pay_date}</td>
                              <td>{money(p.amount)} ج</td>
                              <td className="note-cell">{p.note || "-"}</td>
                              <td><button className="danger-link" onClick={() => removePayment(p.id)}>حذف</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {payFor === entry.id ? (
                    <form className="form" onSubmit={(e) => submitPayment(e, entry.id)}>
                      <div className="form-grid">
                        <label>المبلغ<input type="number" min="0.5" step="0.01" value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))} required /></label>
                        <label>التاريخ<input type="date" value={payForm.date} onChange={(e) => setPayForm((f) => ({ ...f, date: e.target.value }))} required /></label>
                      </div>
                      <label>ملاحظة<input value={payForm.note} onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))} placeholder="اختياري" /></label>
                      <div className="actions-row">
                        <button className="primary" disabled={busy}>تسجيل الدفعة</button>
                        <button type="button" className="secondary" onClick={() => setPayFor(null)}>إلغاء</button>
                      </div>
                    </form>
                  ) : (
                    <div className="actions-row">
                      {entry.remaining > 0 && (
                        <button className="secondary" type="button" onClick={() => { setPayFor(entry.id); setPayForm({ amount: String(entry.remaining), date: todayIso(), note: "" }); }}>
                          تسجيل دفعة
                        </button>
                      )}
                      <button className="danger-link" type="button" onClick={() => removeEntry(entry.id)}>حذف القيد</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default OwnerLedgerView;

import { useEffect, useMemo, useState } from "react";
import { Banknote, ChevronLeft, Pencil, Plus, RefreshCcw, Search, Trash2, TrendingUp, Users, Wallet, X } from "lucide-react";
import { supabase, todayIso } from "../../lib/supabase";
import { cls } from "../../lib/cls";
import { money, normalizeArabicName } from "../../lib/format";
import { Metric, StatusBadge } from "../../ui/legacy";

const emptyEntryForm = () => ({ person: "", direction: "lent", amount: "", date: todayIso(), note: "" });
const emptyPayForm = () => ({ amount: "", date: todayIso(), note: "" });

function OwnerLedgerView({ onToast, onNavigate, routeParam }) {
  const [entries, setEntries] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState(null);

  // Forms: new entry, edit entry, add payment, edit payment.
  const [entryForm, setEntryForm] = useState(emptyEntryForm);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [editEntryId, setEditEntryId] = useState(null);
  const [editEntryForm, setEditEntryForm] = useState(emptyEntryForm);
  const [payForId, setPayForId] = useState(null);
  const [payForm, setPayForm] = useState(emptyPayForm);
  const [editPayId, setEditPayId] = useState(null);
  const [editPayForm, setEditPayForm] = useState(emptyPayForm);

  useEffect(() => { loadData(); }, []);

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

  function resetForms() {
    setShowEntryForm(false);
    setEntryForm(emptyEntryForm());
    setEditEntryId(null);
    setPayForId(null);
    setPayForm(emptyPayForm());
    setEditPayId(null);
  }

  const enriched = useMemo(() => {
    const byEntry = payments.reduce((acc, p) => {
      const list = acc.get(p.entry_id) || [];
      list.push(p);
      acc.set(p.entry_id, list);
      return acc;
    }, new Map());
    return entries.map((entry) => {
      const list = (byEntry.get(entry.id) || []).slice().sort((a, b) => String(a.pay_date).localeCompare(String(b.pay_date)));
      const paid = list.reduce((sum, p) => sum + Number(p.amount), 0);
      return { ...entry, payments: list, paid, remaining: Math.max(0, Number(entry.amount) - paid) };
    });
  }, [entries, payments]);

  // Group by NORMALIZED name so different spellings (فورة/فوره) merge into one person.
  const byPerson = useMemo(() => {
    const map = new Map();
    enriched.forEach((entry) => {
      const key = normalizeArabicName(entry.person);
      const cur = map.get(key) || { key, label: entry.person, entries: [] };
      cur.entries.push(entry);
      map.set(key, cur);
    });
    return [...map.values()]
      .map((g) => {
        const net = g.entries.reduce((s, e) => s + (e.direction === "lent" ? e.remaining : -e.remaining), 0);
        const lastDate = g.entries.reduce((m, e) => (e.entry_date > m ? e.entry_date : m), "");
        return { ...g, net, lastDate };
      })
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.label.localeCompare(b.label, "ar"));
  }, [enriched]);

  const totals = useMemo(() => {
    const lent = enriched.filter((e) => e.direction === "lent").reduce((sum, e) => sum + e.remaining, 0);
    const borrowed = enriched.filter((e) => e.direction === "borrowed").reduce((sum, e) => sum + e.remaining, 0);
    return { lent, borrowed, net: lent - borrowed };
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return byPerson.filter((p) => !q || (p.label || "").includes(q));
  }, [byPerson, query]);

  const selectedPerson = useMemo(
    () => (selectedKey ? byPerson.find((p) => p.key === selectedKey) : null),
    [byPerson, selectedKey]
  );

  // Restore selection from a deep link (#/ownerbook/<key>).
  useEffect(() => {
    if (routeParam && byPerson.some((p) => p.key === routeParam)) setSelectedKey(routeParam);
  }, [routeParam, byPerson]);

  function selectPerson(key) {
    setSelectedKey(key);
    resetForms();
    onNavigate?.("ownerbook", [key]);
  }
  function backToList() {
    setSelectedKey(null);
    resetForms();
    onNavigate?.("ownerbook", [], { replace: true });
  }

  // ---- Mutations -------------------------------------------------------
  async function submitEntry(event, personName) {
    event.preventDefault();
    const person = (personName ?? entryForm.person).trim();
    if (!person) return onToast("اكتب اسم الشخص.");
    setBusy(true);
    const { error } = await supabase.from("owner_ledger_entries").insert({
      person,
      direction: entryForm.direction,
      amount: Number(entryForm.amount),
      entry_date: entryForm.date,
      note: entryForm.note.trim() || null,
    });
    setBusy(false);
    if (error) return onToast("تعذر التسجيل: " + error.message);
    onToast("تم التسجيل في الدفتر.");
    setShowEntryForm(false);
    setEntryForm(emptyEntryForm());
    await loadData();
    if (personName) setSelectedKey(normalizeArabicName(person));
  }

  function startEditEntry(entry) {
    setEditEntryId(entry.id);
    setEditEntryForm({
      person: entry.person,
      direction: entry.direction,
      amount: String(entry.amount),
      date: entry.entry_date,
      note: entry.note || "",
    });
  }
  async function saveEntry(event, id) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("owner_ledger_entries").update({
      direction: editEntryForm.direction,
      amount: Number(editEntryForm.amount),
      entry_date: editEntryForm.date,
      note: editEntryForm.note.trim() || null,
    }).eq("id", id);
    setBusy(false);
    if (error) return onToast("تعذر التعديل: " + error.message);
    onToast("تم تعديل القيد.");
    setEditEntryId(null);
    loadData();
  }
  async function removeEntry(id) {
    if (!confirm("تحذف القيد ده وكل دفعاته نهائيًا؟")) return;
    const { error } = await supabase.from("owner_ledger_entries").delete().eq("id", id);
    if (error) return onToast("تعذر الحذف: " + error.message);
    onToast("تم الحذف.");
    loadData();
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
    if (error) return onToast("تعذر تسجيل الدفعة: " + error.message);
    onToast("تم تسجيل الدفعة.");
    setPayForId(null);
    setPayForm(emptyPayForm());
    loadData();
  }
  function startEditPayment(p) {
    setEditPayId(p.id);
    setEditPayForm({ amount: String(p.amount), date: p.pay_date, note: p.note || "" });
  }
  async function savePayment(event, id) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("owner_ledger_payments").update({
      amount: Number(editPayForm.amount),
      pay_date: editPayForm.date,
      note: editPayForm.note.trim() || null,
    }).eq("id", id);
    setBusy(false);
    if (error) return onToast("تعذر تعديل الدفعة: " + error.message);
    onToast("تم تعديل الدفعة.");
    setEditPayId(null);
    loadData();
  }
  async function removePayment(id) {
    if (!confirm("تحذف الدفعة دي؟")) return;
    const { error } = await supabase.from("owner_ledger_payments").delete().eq("id", id);
    if (error) return onToast("تعذر الحذف: " + error.message);
    onToast("تم حذف الدفعة.");
    loadData();
  }

  // ---- Detail view -----------------------------------------------------
  if (selectedPerson) {
    const person = selectedPerson;
    return (
      <div className="stack">
        <section className="panel">
          <div className="panel-title between">
            <div><Wallet size={20} /><h2>{person.label}</h2></div>
            <button className="secondary" onClick={backToList}><ChevronLeft size={16} /> رجوع للقايمة</button>
          </div>
          <div className="emp-meta">
            <span className={cls("badge", Math.abs(person.net) < 0.01 ? "muted" : person.net > 0 ? "ok" : "danger")}>
              {Math.abs(person.net) < 0.01 ? "متسوّي" : person.net > 0 ? `ليك ${money(person.net)} ج` : `عليك ${money(-person.net)} ج`}
            </span>
            <span className="badge">{person.entries.length} قيد</span>
          </div>
          <p className="muted">الدفتر ده شخصي — محدش بيشوفه غيرك حتى الـ HR.</p>
        </section>

        {/* Add a new entry for this person */}
        <section className="panel">
          <div className="panel-title between">
            <div><Plus size={20} /><h2>قيد جديد لـ {person.label}</h2></div>
            {!showEntryForm && <button className="secondary" onClick={() => { setEntryForm({ ...emptyEntryForm(), person: person.label }); setShowEntryForm(true); }}><Plus size={16} /> إضافة</button>}
          </div>
          {showEntryForm && (
            <form className="form" onSubmit={(e) => submitEntry(e, person.label)}>
              <div className="form-grid">
                <label>الاتجاه<select value={entryForm.direction} onChange={(e) => setEntryForm((f) => ({ ...f, direction: e.target.value }))}><option value="lent">سلّفته فلوس</option><option value="borrowed">استلفت منه</option></select></label>
                <label>المبلغ<input type="number" min="0.5" step="0.01" value={entryForm.amount} onChange={(e) => setEntryForm((f) => ({ ...f, amount: e.target.value }))} required /></label>
              </div>
              <div className="form-grid">
                <label>التاريخ<input type="date" value={entryForm.date} onChange={(e) => setEntryForm((f) => ({ ...f, date: e.target.value }))} required /></label>
                <label>ملاحظة<input value={entryForm.note} onChange={(e) => setEntryForm((f) => ({ ...f, note: e.target.value }))} placeholder="اختياري" /></label>
              </div>
              <div className="actions-row">
                <button className="primary" disabled={busy}>{busy ? "..." : "تسجيل القيد"}</button>
                <button type="button" className="secondary" onClick={() => { setShowEntryForm(false); setEntryForm(emptyEntryForm()); }}>إلغاء</button>
              </div>
            </form>
          )}
        </section>

        {person.entries.map((entry) => (
          <section className="panel" key={entry.id}>
            {editEntryId === entry.id ? (
              <form className="form" onSubmit={(e) => saveEntry(e, entry.id)}>
                <div className="panel-title"><Pencil size={18} /><h2>تعديل القيد</h2></div>
                <div className="form-grid">
                  <label>الاتجاه<select value={editEntryForm.direction} onChange={(e) => setEditEntryForm((f) => ({ ...f, direction: e.target.value }))}><option value="lent">سلّفته فلوس</option><option value="borrowed">استلفت منه</option></select></label>
                  <label>المبلغ<input type="number" min="0.5" step="0.01" value={editEntryForm.amount} onChange={(e) => setEditEntryForm((f) => ({ ...f, amount: e.target.value }))} required /></label>
                </div>
                <div className="form-grid">
                  <label>التاريخ<input type="date" value={editEntryForm.date} onChange={(e) => setEditEntryForm((f) => ({ ...f, date: e.target.value }))} required /></label>
                  <label>ملاحظة<input value={editEntryForm.note} onChange={(e) => setEditEntryForm((f) => ({ ...f, note: e.target.value }))} placeholder="اختياري" /></label>
                </div>
                <div className="actions-row">
                  <button className="primary" disabled={busy}>حفظ التعديل</button>
                  <button type="button" className="secondary" onClick={() => setEditEntryId(null)}>إلغاء</button>
                </div>
              </form>
            ) : (
              <>
                <div className="panel-title between">
                  <div>
                    <Banknote size={18} />
                    <h2>{entry.direction === "lent" ? "سلّفته" : "استلفت"} {money(entry.amount)} ج</h2>
                  </div>
                  <span className="badge">{entry.entry_date}</span>
                </div>
                <p className="muted">
                  سدد: {money(entry.paid)} ج · متبقي: <strong>{money(entry.remaining)} ج</strong>
                  {entry.remaining <= 0 && <> <StatusBadge status="settled" /></>}
                  {entry.note ? ` · ${entry.note}` : ""}
                </p>

                {entry.payments.length > 0 && (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>التاريخ</th><th>المبلغ</th><th>ملاحظة</th><th>إجراء</th></tr></thead>
                      <tbody>
                        {entry.payments.map((p) => (
                          editPayId === p.id ? (
                            <tr key={p.id}>
                              <td dir="ltr"><input type="date" value={editPayForm.date} onChange={(e) => setEditPayForm((f) => ({ ...f, date: e.target.value }))} /></td>
                              <td><input type="number" min="0.5" step="0.01" value={editPayForm.amount} onChange={(e) => setEditPayForm((f) => ({ ...f, amount: e.target.value }))} /></td>
                              <td><input value={editPayForm.note} onChange={(e) => setEditPayForm((f) => ({ ...f, note: e.target.value }))} placeholder="ملاحظة" /></td>
                              <td>
                                <div className="actions-row tight">
                                  <button className="link" type="button" onClick={(e) => savePayment(e, p.id)} disabled={busy}>حفظ</button>
                                  <button className="danger-link" type="button" onClick={() => setEditPayId(null)}>إلغاء</button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <tr key={p.id}>
                              <td dir="ltr">{p.pay_date}</td>
                              <td>{money(p.amount)} ج</td>
                              <td className="note-cell">{p.note || "—"}</td>
                              <td>
                                <div className="actions-row tight">
                                  <button className="link" type="button" onClick={() => startEditPayment(p)}><Pencil size={14} /> تعديل</button>
                                  <button className="danger-link" type="button" onClick={() => removePayment(p.id)}><Trash2 size={14} /> حذف</button>
                                </div>
                              </td>
                            </tr>
                          )
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {payForId === entry.id ? (
                  <form className="form" onSubmit={(e) => submitPayment(e, entry.id)}>
                    <div className="form-grid">
                      <label>المبلغ<input type="number" min="0.5" step="0.01" value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))} required /></label>
                      <label>التاريخ<input type="date" value={payForm.date} onChange={(e) => setPayForm((f) => ({ ...f, date: e.target.value }))} required /></label>
                    </div>
                    <label>ملاحظة<input value={payForm.note} onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))} placeholder="اختياري (مثلاً: سداد جزئي)" /></label>
                    <div className="actions-row">
                      <button className="primary" disabled={busy}>تسجيل الدفعة</button>
                      <button type="button" className="secondary" onClick={() => setPayForId(null)}>إلغاء</button>
                    </div>
                  </form>
                ) : (
                  <div className="actions-row">
                    {entry.remaining > 0 && (
                      <button className="secondary" type="button" onClick={() => { setPayForId(entry.id); setPayForm({ amount: String(entry.remaining), date: todayIso(), note: "" }); }}>
                        <Plus size={16} /> تسجيل دفعة
                      </button>
                    )}
                    <button className="secondary" type="button" onClick={() => startEditEntry(entry)}><Pencil size={16} /> تعديل القيد</button>
                    <button className="danger-link" type="button" onClick={() => removeEntry(entry.id)}><Trash2 size={16} /> حذف القيد</button>
                  </div>
                )}
              </>
            )}
          </section>
        ))}
      </div>
    );
  }

  // ---- List view (person cards) ---------------------------------------
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
        <p className="muted">الدفتر ده شخصي — محدش بيشوفه غيرك حتى الـ HR. دوس على أي شخص تشوف كل قيوده وتضيف/تعدّل/تحذف.</p>
      </section>

      <section className="panel">
        <div className="panel-title between">
          <div><Users size={20} /><h2>الأشخاص</h2></div>
          {!showEntryForm && <button className="secondary" onClick={() => { setEntryForm(emptyEntryForm()); setShowEntryForm(true); }}><Plus size={16} /> قيد جديد</button>}
        </div>

        {showEntryForm && (
          <form className="form" onSubmit={(e) => submitEntry(e)}>
            <div className="form-grid">
              <label>الاسم<input value={entryForm.person} onChange={(e) => setEntryForm((f) => ({ ...f, person: e.target.value }))} required placeholder="اسم الشخص" /></label>
              <label>الاتجاه<select value={entryForm.direction} onChange={(e) => setEntryForm((f) => ({ ...f, direction: e.target.value }))}><option value="lent">سلّفته فلوس</option><option value="borrowed">استلفت منه</option></select></label>
            </div>
            <div className="form-grid">
              <label>المبلغ<input type="number" min="0.5" step="0.01" value={entryForm.amount} onChange={(e) => setEntryForm((f) => ({ ...f, amount: e.target.value }))} required /></label>
              <label>التاريخ<input type="date" value={entryForm.date} onChange={(e) => setEntryForm((f) => ({ ...f, date: e.target.value }))} required /></label>
            </div>
            <label>ملاحظة<input value={entryForm.note} onChange={(e) => setEntryForm((f) => ({ ...f, note: e.target.value }))} placeholder="اختياري" /></label>
            <div className="actions-row">
              <button className="primary" disabled={busy}>{busy ? "جارٍ التسجيل..." : "تسجيل"}</button>
              <button type="button" className="secondary" onClick={() => { setShowEntryForm(false); setEntryForm(emptyEntryForm()); }}>إلغاء</button>
            </div>
          </form>
        )}

        {byPerson.length > 3 && (
          <label className="field-search">
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث باسم الشخص..." />
          </label>
        )}

        {loading && <p className="muted">جارٍ التحميل...</p>}
        {!loading && byPerson.length === 0 && <p className="muted">الدفتر فاضي — سجّل أول قيد.</p>}

        {filtered.length > 0 && (
          <div className="emp-grid">
            {filtered.map((p) => {
              const settled = Math.abs(p.net) < 0.01;
              return (
                <button key={p.key} type="button" className="emp-card" onClick={() => selectPerson(p.key)}>
                  <span className="emp-avatar">{(p.label || "?").slice(0, 1)}</span>
                  <span className="emp-card-body">
                    <strong>{p.label}</strong>
                    <span className={cls("ledger-net", settled ? "muted" : p.net > 0 ? "ok" : "danger")}>
                      {settled ? "متسوّي" : p.net > 0 ? `ليك ${money(p.net)} ج` : `عليك ${money(-p.net)} ج`}
                    </span>
                  </span>
                  <ChevronLeft size={18} />
                </button>
              );
            })}
          </div>
        )}
        {!loading && byPerson.length > 0 && filtered.length === 0 && <p className="muted">لا توجد نتائج للبحث.</p>}
      </section>
    </div>
  );
}

export default OwnerLedgerView;

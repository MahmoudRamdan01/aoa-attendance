import { useEffect, useMemo, useState } from "react";
import { Banknote, Bell, FileSpreadsheet, RefreshCcw, Scale, Search, TrendingUp } from "lucide-react";
import { supabase, todayIso } from "../../lib/supabase";
import { cls } from "../../lib/cls";

import { csvCell, downloadTextFile, money } from "../../lib/format";
import { partnerDirectionLabels, partnerKindLabels, statusLabels } from "../../lib/labels";
import { Metric, StatusBadge } from "../../ui/legacy";
import { useVoidDialog, maskActor } from "./shared";

function PartnerLedgerView({ context, onToast }) {
  const role = context?.role || "employee";
  const isOwner = role === "owner";
  const [entries, setEntries] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [directionFilter, setDirectionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ direction: "owed_to_us", kind: "invoice", amount: "", date: todayIso(), description: "", dueDate: "" });
  const [settleFor, setSettleFor] = useState(null);
  const [settleForm, setSettleForm] = useState({ amount: "", date: todayIso(), note: "" });
  const [expanded, setExpanded] = useState(null);
  const { requestVoid, voidDialog } = useVoidDialog(onToast, () => loadData());

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [e, s] = await Promise.all([
      supabase.from("partner_ledger_entries").select("*").order("entry_date", { ascending: false }).order("id", { ascending: false }),
      supabase.from("partner_settlements").select("*").order("created_at", { ascending: false }),
    ]);
    setEntries(e.data || []);
    setSettlements(s.data || []);
    setLoading(false);
  }

  const enriched = useMemo(() => {
    const byEntry = settlements.reduce((acc, s) => {
      const list = acc.get(s.entry_id) || [];
      list.push(s);
      acc.set(s.entry_id, list);
      return acc;
    }, new Map());
    return entries.map((entry) => {
      const list = byEntry.get(entry.id) || [];
      const paid = list.filter((s) => s.status === "confirmed").reduce((sum, s) => sum + Number(s.amount), 0);
      const remaining = Math.max(0, Number(entry.amount) - paid);
      const derived = entry.status === "voided" ? "voided" : remaining <= 0 ? "settled" : paid > 0 ? "partial" : "open";
      return { ...entry, settlements: list, paid, remaining, derived };
    });
  }, [entries, settlements]);

  const totals = useMemo(() => {
    const active = enriched.filter((e) => e.status === "active");
    const toUs = active.filter((e) => e.direction === "owed_to_us").reduce((sum, e) => sum + e.remaining, 0);
    const byUs = active.filter((e) => e.direction === "owed_by_us").reduce((sum, e) => sum + e.remaining, 0);
    return { toUs, byUs, net: toUs - byUs };
  }, [enriched]);

  const pendingSettlements = useMemo(() => {
    const nameByEntry = new Map(entries.map((e) => [e.id, e.description]));
    return settlements
      .filter((s) => s.status === "pending")
      .map((s) => ({ ...s, entryDescription: nameByEntry.get(s.entry_id) || `قيد #${s.entry_id}` }));
  }, [settlements, entries]);

  const visible = enriched.filter((entry) => {
    const matchesDirection = directionFilter === "all" || entry.direction === directionFilter;
    const matchesStatus = statusFilter === "all" || entry.derived === statusFilter;
    const matchesSearch = !search.trim() || (entry.description || "").toLowerCase().includes(search.trim().toLowerCase());
    return matchesDirection && matchesStatus && matchesSearch;
  });

  async function submitEntry(event) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("add_partner_entry_v1", {
      p_direction: form.direction,
      p_kind: form.kind,
      p_amount: Number(form.amount),
      p_date: form.date,
      p_description: form.description,
      p_due_date: form.dueDate || null,
    });
    setBusy(false);
    if (error || data?.error) onToast(data?.message || "تعذر تسجيل القيد.");
    else {
      onToast("تم تسجيل القيد.");
      setForm((f) => ({ ...f, amount: "", description: "", dueDate: "" }));
      loadData();
    }
  }

  async function submitSettlement(event, entryId) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("add_partner_settlement_v1", {
      p_entry_id: entryId,
      p_amount: Number(settleForm.amount),
      p_date: settleForm.date,
      p_note: settleForm.note || null,
    });
    setBusy(false);
    if (error || data?.error) onToast(data?.message || "تعذر تسجيل السداد.");
    else {
      onToast(data.confirmed ? "تم تسجيل السداد وتأكيده." : "تم تسجيل السداد — في انتظار تأكيد المالك.");
      setSettleFor(null);
      setSettleForm({ amount: "", date: todayIso(), note: "" });
      loadData();
    }
  }

  async function decideSettlement(id, approve) {
    const { data, error } = await supabase.rpc("decide_partner_settlement_v1", {
      p_id: id,
      p_approve: approve,
      p_note: approve ? "تم التأكيد" : "تم الرفض",
    });
    if (error || data?.error) onToast(data?.message || "تعذر البت في السداد.");
    else {
      onToast(approve ? "تم تأكيد السداد." : "تم رفض السداد.");
      loadData();
    }
  }

  function exportEntries() {
    const header = ["التاريخ", "الاتجاه", "النوع", "الوصف", "الأصل", "مسدد", "متبقي", "الحالة", "استحقاق", "سجّله"];
    const lines = enriched.map((e) => [
      e.entry_date,
      partnerDirectionLabels[e.direction],
      partnerKindLabels[e.kind],
      e.description,
      e.amount,
      e.paid.toFixed(2),
      e.remaining.toFixed(2),
      statusLabels[e.derived] || e.derived,
      e.due_date || "",
      maskActor(e.created_by_name, role) || "",
    ].map(csvCell).join(","));
    downloadTextFile(`partner-ledger-${todayIso()}.csv`, "Feff" + `${header.map(csvCell).join(",")}\n${lines.join("\n")}`);
  }

  function exportSettlements() {
    const nameByEntry = new Map(entries.map((e) => [e.id, e.description]));
    const header = ["التاريخ", "القيد", "المبلغ", "الحالة", "ملاحظة", "سجّله"];
    const lines = settlements.map((s) => [
      s.settle_date,
      nameByEntry.get(s.entry_id) || s.entry_id,
      s.amount,
      statusLabels[s.status] || s.status,
      s.note || "",
      maskActor(s.created_by_name, role) || "",
    ].map(csvCell).join(","));
    downloadTextFile(`partner-settlements-${todayIso()}.csv`, "Feff" + `${header.map(csvCell).join(",")}\n${lines.join("\n")}`);
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-title between">
          <div><Scale size={20} /><h2>مديونية Air Ocean</h2></div>
          <div className="toolbar">
            <button className="secondary" onClick={exportEntries} disabled={entries.length === 0}><FileSpreadsheet size={16} /> القيود</button>
            <button className="secondary" onClick={exportSettlements} disabled={settlements.length === 0}><FileSpreadsheet size={16} /> السدادات</button>
            <button className="secondary" onClick={loadData}><RefreshCcw size={16} /> تحديث</button>
          </div>
        </div>
        <div className="stats-grid compact-stats">
          <Metric label="مستحق لنا" value={`${money(totals.toUs)} ج`} tone="ok" icon={TrendingUp} />
          <Metric label="مستحق علينا" value={`${money(totals.byUs)} ج`} tone="danger" icon={Banknote} />
          <Metric label="الصافي" value={`${money(Math.abs(totals.net))} ج ${totals.net >= 0 ? "لصالحنا" : "مستحق علينا"}`} tone={totals.net >= 0 ? "ok" : "warn"} icon={Scale} />
          <Metric label="سدادات معلقة" value={pendingSettlements.length} tone={pendingSettlements.length ? "warn" : "ok"} icon={Bell} />
        </div>
        <p className="muted">جميع القيود والسدادات محفوظة بالكامل — لا يُحذف أي شيء، ويُسجَّل الإلغاء مع أسبابه.</p>
      </section>

      {pendingSettlements.length > 0 && (
        <section className="panel">
          <div className="panel-title"><Bell size={20} /><h2>سدادات تحتاج تأكيد</h2></div>
          <div className="list">
            {pendingSettlements.map((s) => (
              <div className="approval-row" key={s.id}>
                <div>
                  <strong>{money(s.amount)} ج</strong>
                  <span>{s.entryDescription} · {s.settle_date}</span>
                  {s.note && <p>{s.note}</p>}
                  <p className="muted">سجله: {maskActor(s.created_by_name, role) || "-"}</p>
                </div>
                <div className="approval-actions">
                  {!isOwner && <span className="badge">قرار المالك فقط</span>}
                  {isOwner && (
                    <>
                      <button onClick={() => decideSettlement(s.id, true)}>تأكيد</button>
                      <button className="danger-link" onClick={() => decideSettlement(s.id, false)}>رفض</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <form className="panel form" onSubmit={submitEntry}>
        <div className="panel-title"><Scale size={20} /><h2>تسجيل قيد جديد</h2></div>
        <div className="form-grid">
          <label>الاتجاه<select value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}>{Object.entries(partnerDirectionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>النوع<select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>{Object.entries(partnerKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <div className="form-grid">
          <label>المبلغ<input type="number" min="0.5" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required /></label>
          <label>التاريخ<input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required /></label>
        </div>
        <label>الوصف<input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} required placeholder="مثال: فاتورة شحن يوليو / سلفة نقدية" /></label>
        <label>تاريخ استحقاق (اختياري)<input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} /></label>
        <button className="primary" disabled={busy}>{busy ? "جارٍ التسجيل..." : "تسجيل القيد"}</button>
      </form>

      <section className="panel">
        <div className="panel-title between">
          <div><FileSpreadsheet size={20} /><h2>القيود</h2></div>
          <div className="toolbar table-filters">
            <div className="tabs compact-tabs no-margin">
              <button className={cls(directionFilter === "all" && "active")} onClick={() => setDirectionFilter("all")}>الكل</button>
              <button className={cls(directionFilter === "owed_to_us" && "active")} onClick={() => setDirectionFilter("owed_to_us")}>مستحق لنا</button>
              <button className={cls(directionFilter === "owed_by_us" && "active")} onClick={() => setDirectionFilter("owed_by_us")}>مستحق علينا</button>
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">كل الحالات</option>
              <option value="open">مفتوح</option>
              <option value="partial">سداد جزئي</option>
              <option value="settled">مُسدد</option>
              <option value="voided">ملغي</option>
            </select>
            <label className="search-field">
              <Search size={16} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث في الوصف" />
            </label>
          </div>
        </div>
        <div className="list">
          {loading && <p className="muted">جارٍ التحميل...</p>}
          {!loading && visible.length === 0 && <p className="muted">لا توجد قيود مطابقة.</p>}
          {!loading && visible.map((entry) => (
            <div className="approval-row" key={entry.id}>
              <div>
                <strong>{entry.description}</strong>
                <span>{partnerDirectionLabels[entry.direction]} · {partnerKindLabels[entry.kind]} · {entry.entry_date}</span>
                <p>الأصل: {money(entry.amount)} ج · مسدد: {money(entry.paid)} ج · متبقي: <strong>{money(entry.remaining)} ج</strong></p>
                {entry.due_date && <p className="muted">استحقاق: {entry.due_date}</p>}
                {entry.status === "voided" && <p className="muted">سبب الإلغاء: {entry.void_reason || "-"}</p>}
                {expanded === entry.id && entry.settlements.length > 0 && (
                  <div className="list">
                    {entry.settlements.map((s) => (
                      <div className="list-row compact-row" key={s.id}>
                        <div>
                          <strong>{money(s.amount)} ج</strong>
                          <span>{s.settle_date} · {maskActor(s.created_by_name, role) || "-"}</span>
                        </div>
                        <StatusBadge status={s.status} />
                      </div>
                    ))}
                  </div>
                )}
                {settleFor === entry.id && (
                  <form className="form" onSubmit={(e) => submitSettlement(e, entry.id)}>
                    <div className="form-grid">
                      <label>مبلغ السداد<input type="number" min="0.5" step="0.01" max={entry.remaining} value={settleForm.amount} onChange={(e) => setSettleForm((f) => ({ ...f, amount: e.target.value }))} required /></label>
                      <label>التاريخ<input type="date" value={settleForm.date} onChange={(e) => setSettleForm((f) => ({ ...f, date: e.target.value }))} required /></label>
                    </div>
                    <label>ملاحظة<input value={settleForm.note} onChange={(e) => setSettleForm((f) => ({ ...f, note: e.target.value }))} placeholder="اختياري" /></label>
                    <div className="actions-row">
                      <button className="primary" disabled={busy}>{busy ? "جارٍ التسجيل..." : "تسجيل السداد"}</button>
                      <button type="button" className="secondary" onClick={() => setSettleFor(null)}>إلغاء</button>
                    </div>
                  </form>
                )}
              </div>
              <div className="approval-actions">
                <StatusBadge status={entry.derived} />
                {entry.settlements.length > 0 && (
                  <button className="secondary" type="button" onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>
                    {expanded === entry.id ? "إخفاء السدادات" : `السدادات (${entry.settlements.length})`}
                  </button>
                )}
                {entry.status === "active" && entry.remaining > 0 && settleFor !== entry.id && (
                  <button type="button" onClick={() => { setSettleFor(entry.id); setSettleForm({ amount: String(entry.remaining), date: todayIso(), note: "" }); }}>سداد</button>
                )}
                {entry.status === "active" && isOwner && (
                  <button className="danger-link" type="button" onClick={() => requestVoid("partner_entry", entry.id)}>إلغاء القيد</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
      {voidDialog}
    </div>
  );
}

export default PartnerLedgerView;

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { supabase, todayIso } from "../../lib/supabase";
import { cls } from "../../lib/cls";
import { addDays } from "../../lib/dates";

import { StatusBadge } from "../../ui/legacy";

function RequestsView({ context, onToast }) {
  const [kind, setKind] = useState("permission");
  const [refreshKey, setRefreshKey] = useState(0);
  // The create flow sits behind the FAB (redesign spec F); the forms and
  // their RPCs are unchanged.
  const [createOpen, setCreateOpen] = useState(false);
  const refreshRequests = () => {
    setRefreshKey((key) => key + 1);
    setCreateOpen(false);
  };

  return (
    <div className="requests-screen">
      <MyRequests context={context} refreshKey={refreshKey} createOpen={createOpen} onCloseCreate={() => setCreateOpen(false)}>
        {createOpen ? (
          <section className="panel requests-create">
            <div className="panel-title between">
              <div className="tabs compact-tabs">
                <button className={cls(kind === "permission" && "active")} onClick={() => setKind("permission")}>إذن</button>
                <button className={cls(kind === "leave" && "active")} onClick={() => setKind("leave")}>أجازة</button>
              </div>
              <button type="button" className="ops-icon-btn" onClick={() => setCreateOpen(false)} aria-label="إغلاق نموذج الطلب">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            {kind === "permission" ? (
              <PermissionForm onToast={onToast} onDone={refreshRequests} />
            ) : (
              <LeaveForm context={context} onToast={onToast} onDone={refreshRequests} />
            )}
          </section>
        ) : null}
      </MyRequests>
      <button type="button" className="requests-fab" onClick={() => setCreateOpen((open) => !open)} aria-label="طلب جديد" aria-expanded={createOpen}>
        <Plus size={22} aria-hidden="true" />
      </button>
    </div>
  );
}

function PermissionForm({ onToast, onDone }) {
  const [date, setDate] = useState(todayIso());
  const [hours, setHours] = useState(1);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("request_permission_v1", {
      p_date: date,
      p_hours_requested: hours,
      p_reason: reason,
    });
    setBusy(false);
    if (error || data?.error) onToast(data?.message || "تعذر إرسال طلب الإذن.");
    else {
      setReason("");
      onToast("تم إرسال طلب الإذن.");
      onDone?.();
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <h2>طلب إذن</h2>
      <label>اليوم<input type="date" value={date} min={todayIso()} onChange={(e) => setDate(e.target.value)} /></label>
      <label>المدة المطلوبة<select value={hours} onChange={(e) => setHours(Number(e.target.value))}><option value={1}>ساعة</option><option value={2}>ساعتين</option></select></label>
      <label>السبب<input value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="اكتب السبب بوضوح" /></label>
      <button className="primary" disabled={busy}>{busy ? "جار الإرسال..." : "إرسال الطلب"}</button>
      <p className="muted">الحد: 3 أذونات شهريًا، وغير مسموح بأيام متتالية.</p>
    </form>
  );
}

function LeaveForm({ context, onToast, onDone }) {
  const minLeaveDate = addDays(todayIso(), 1);
  const [from, setFrom] = useState(minLeaveDate);
  const [to, setTo] = useState(minLeaveDate);
  const [cover, setCover] = useState("");
  const [reason, setReason] = useState("");
  const [employees, setEmployees] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("kiosk_employees").select("id,name,active").eq("active", true).order("id").then(({ data }) => {
      setEmployees((data || []).filter((emp) => emp.id !== context?.employee?.id));
    });
  }, [context?.employee?.id]);

  function updateFrom(value) {
    setFrom(value);
    if (to < value) setTo(value);
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("request_leave_v1", {
      p_from: from,
      p_to: to,
      p_cover: Number(cover),
      p_reason: reason,
    });
    setBusy(false);
    if (error || data?.error) onToast(data?.message || "تعذر إرسال طلب الأجازة.");
    else {
      setReason("");
      onToast("تم إرسال طلب الأجازة.");
      onDone?.();
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <h2>طلب أجازة</h2>
      <div className="form-grid">
        <label>من<input type="date" value={from} min={minLeaveDate} onChange={(e) => updateFrom(e.target.value)} /></label>
        <label>إلى<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <label>الموظف البديل<select value={cover} onChange={(e) => setCover(e.target.value)} required><option value="">اختار Cover</option>{employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}</select></label>
      <label>السبب<input value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="سبب الأجازة" /></label>
      <button className="primary" disabled={busy}>{busy ? "جار الإرسال..." : "إرسال الطلب"}</button>
      <p className="muted">الحد: يومين شهريًا، غير متتاليين، وتخصم من الرصيد السنوي.</p>
    </form>
  );
}

function MyRequests({ context, refreshKey, children }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | pending (spec F)

  useEffect(() => {
    if (!context?.employee?.id) return;
    setLoading(true);
    Promise.all([
      supabase.from("permissions").select("id,perm_date,hours,hours_requested,hours_approved,reason,status,decision_note,decided_at,created_at").eq("employee_id", context.employee.id).order("perm_date", { ascending: false }).limit(10),
      supabase.from("leave_requests").select("id,from_date,to_date,days,reason,status,decision_note,decided_at,created_at").eq("employee_id", context.employee.id).order("from_date", { ascending: false }).limit(10),
    ]).then(([p, l]) => {
      const nextRows = [
        ...(p.data || []).map((item) => ({
          type: "إذن",
          date: item.perm_date,
          sortDate: item.perm_date,
          status: item.status,
          meta: `${item.hours_requested || item.hours} ساعة مطلوبة${item.hours_approved ? ` · المعتمد ${item.hours_approved} ساعة` : ""}`,
          reason: item.reason,
          decision: item.decision_note,
          decidedAt: item.decided_at,
          submittedAt: item.created_at,
        })),
        ...(l.data || []).map((item) => ({
          type: "أجازة",
          date: `${item.from_date} → ${item.to_date}`,
          sortDate: item.from_date,
          status: item.status,
          meta: `${item.days} يوم`,
          reason: item.reason,
          decision: item.decision_note,
          decidedAt: item.decided_at,
          submittedAt: item.created_at,
        })),
      ].sort((a, b) => b.sortDate.localeCompare(a.sortDate));
      setRows(nextRows);
      setLoading(false);
    });
  }, [context?.employee?.id, refreshKey]);

  const visible = filter === "pending" ? rows.filter((row) => row.status === "pending") : rows;

  return (
    <>
      {/* Screen title row (design ref 07): «طلباتي» + segmented pill */}
      <div className="scr-head">
        <h2>طلباتي</h2>
        <div className="seg-pill">
          <button type="button" className={cls(filter === "all" && "active")} onClick={() => setFilter("all")}>الكل</button>
          <button type="button" className={cls(filter === "pending" && "active")} onClick={() => setFilter("pending")}>المعلّقة</button>
        </div>
      </div>

      {children}

      <div className="requests-list">
        {loading && <p className="muted">جارٍ تحميل الطلبات...</p>}
        {!loading && visible.length === 0 && (
          <p className="muted">{filter === "pending" ? "لا توجد طلبات معلّقة." : "لا توجد طلبات بعد."}</p>
        )}
        {visible.map((row, index) => (
          <div className="request-card" key={`${row.type}-${row.date}-${index}`}>
            <div className="request-card-head">
              <strong>{row.type}</strong>
              <StatusBadge status={row.status} />
            </div>
            <div className="request-card-range">{row.date} · {row.meta}</div>
            {row.reason && <p className="request-card-note">{row.reason}{row.decision ? ` — ${row.decision}` : ""}</p>}
            {!row.reason && row.decision && <p className="request-card-note">{row.decision}</p>}
          </div>
        ))}
      </div>
    </>
  );
}

export default RequestsView;

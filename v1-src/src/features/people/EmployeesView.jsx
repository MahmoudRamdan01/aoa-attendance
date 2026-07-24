import { useEffect, useMemo, useState } from "react";
import { Banknote, CalendarDays, ChevronLeft, Clock3, Plus, Power, Search, Sparkles, Trash2, UserPlus, Users } from "lucide-react";
import { supabase, todayIso } from "../../lib/supabase";
import { cls } from "../../lib/cls";
import { fmtTime12, money } from "../../lib/format";
import { deductionCategoryLabels, reqStatusLabel } from "../../lib/labels";
import { StatusBadge } from "../../ui/legacy";
import { ConfirmDialog, SkeletonList } from "../../ui/primitives";
import FaceEnrollment from "./FaceEnrollment";
import DeviceHistory from "./DeviceHistory";
import EmployeeStatement from "../payroll/EmployeeStatement";

const EMPLOYEES_CACHE_PREFIX = "aoa:employees:v1:";
const EMPLOYEES_CACHE_MAX_AGE = 10 * 60 * 1000;

function readEmployeesCache(userId) {
  if (!userId) return [];
  try {
    const cached = JSON.parse(sessionStorage.getItem(`${EMPLOYEES_CACHE_PREFIX}${userId}`) || "null");
    if (!Array.isArray(cached?.rows) || Date.now() - Number(cached.savedAt || 0) > EMPLOYEES_CACHE_MAX_AGE) return [];
    return cached.rows;
  } catch {
    return [];
  }
}

function writeEmployeesCache(userId, rows) {
  if (!userId) return;
  try {
    sessionStorage.setItem(`${EMPLOYEES_CACHE_PREFIX}${userId}`, JSON.stringify({ savedAt: Date.now(), rows }));
  } catch {
    /* The live list still works when storage is unavailable. */
  }
}

function EmployeesView({ context, session, onToast, onNavigate, routeParam }) {
  const role = context?.role || "employee";
  const isAdmin = role === "hr" || role === "owner";
  const userId = session?.user?.id;
  const [employees, setEmployees] = useState(() => readEmployeesCache(userId));
  const [loading, setLoading] = useState(() => !readEmployeesCache(userId).length);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const emptyAdd = { name: "", attendance_exempt: false, checkin_from: "", checkin_to: "", checkout_from: "", checkout_to: "", salary: "" };
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(emptyAdd);
  const [busy, setBusy] = useState(false);

  async function submitAdd(event) {
    event.preventDefault();
    if (!addForm.name.trim()) return onToast?.("اكتب اسم الموظف.");
    setBusy(true);
    const { data, error } = await supabase.rpc("owner_add_employee_v1", {
      p_name: addForm.name.trim(),
      p_attendance_exempt: addForm.attendance_exempt,
      p_checkin_from: addForm.checkin_from || null,
      p_checkin_to: addForm.checkin_to || null,
      p_checkout_from: addForm.checkout_from || null,
      p_checkout_to: addForm.checkout_to || null,
      p_salary: addForm.salary ? Number(addForm.salary) : null,
    });
    setBusy(false);
    if (error || data?.error) return onToast?.(data?.message || "تعذر إضافة الموظف.");
    onToast?.(`تمت إضافة ${data.name}.`);
    setAddForm(emptyAdd);
    setShowAdd(false);
    load();
  }

  useEffect(() => { load(); }, [userId]);
  useEffect(() => {
    if (!routeParam || !employees.length) return;
    const employee = employees.find((item) => String(item.id) === String(routeParam));
    if (employee) setSelected(employee);
  }, [employees, routeParam]);
  async function load() {
    if (!employees.length) setLoading(true);
    const { data } = await supabase
      .from("employees")
      // select * so the optional `department` column (Air Ocean DB) comes
      // along without breaking databases that don't have it.
      .select("*")
      .order("id");
    const rows = data || [];
    setEmployees(rows);
    writeEmployeesCache(userId, rows);
    setLoading(false);
  }
  // Department accordion (Air Ocean): employees carry a `department` value →
  // one clickable bar per department. Databases without departments (our
  // original system) keep the flat grid untouched.
  const [openDepts, setOpenDepts] = useState(() => new Set());
  const filtered = useMemo(() => {
    const q = query.trim();
    return employees.filter((e) => !q || (e.name || "").includes(q));
  }, [employees, query]);

  const departments = useMemo(() => {
    if (!employees.some((e) => e.department)) return null;
    const groups = new Map();
    filtered.forEach((e) => {
      const dept = e.department || "بدون قسم";
      if (!groups.has(dept)) groups.set(dept, []);
      groups.get(dept).push(e);
    });
    return [...groups.entries()].map(([name, members]) => ({ name, members }));
  }, [employees, filtered]);

  function toggleDept(name) {
    setOpenDepts((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  if (selected) {
    return (
      <EmployeeDetail
        employee={selected}
        role={role}
        onBack={() => {
          setSelected(null);
          onNavigate?.("team", [], { replace: true });
        }}
        onChanged={load}
        onDeleted={() => {
          setSelected(null);
          onNavigate?.("team", [], { replace: true });
          load();
        }}
        onToast={onToast}
      />
    );
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-title between">
          <div><Users size={20} /><h2>الموظفين</h2></div>
          <div className="toolbar">
            {isAdmin && !showAdd && <button className="secondary" onClick={() => { setAddForm(emptyAdd); setShowAdd(true); }}><UserPlus size={16} /> إضافة موظف</button>}
          </div>
        </div>
        {isAdmin && showAdd && (
          <form className="form" onSubmit={submitAdd}>
            <div className="panel-title"><Plus size={18} /><h2>موظف جديد</h2></div>
            <div className="form-grid">
              <label>الاسم<input value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} required placeholder="اسم الموظف" /></label>
              {role === "owner" && (
                <label>المرتب الشهري (ج)<input type="number" min="0" step="50" value={addForm.salary} onChange={(e) => setAddForm((f) => ({ ...f, salary: e.target.value }))} placeholder="مثال: 5000" /></label>
              )}
              <label className="check-inline"><input type="checkbox" checked={addForm.attendance_exempt} onChange={(e) => setAddForm((f) => ({ ...f, attendance_exempt: e.target.checked }))} /> مرتبات فقط (لا يسجّل حضور)</label>
            </div>
            {!addForm.attendance_exempt && (
              <div className="form-grid">
                <label>نافذة الحضور من<input type="time" value={addForm.checkin_from} onChange={(e) => setAddForm((f) => ({ ...f, checkin_from: e.target.value }))} /></label>
                <label>إلى<input type="time" value={addForm.checkin_to} onChange={(e) => setAddForm((f) => ({ ...f, checkin_to: e.target.value }))} /></label>
                <label>نافذة الانصراف من<input type="time" value={addForm.checkout_from} onChange={(e) => setAddForm((f) => ({ ...f, checkout_from: e.target.value }))} /></label>
                <label>إلى<input type="time" value={addForm.checkout_to} onChange={(e) => setAddForm((f) => ({ ...f, checkout_to: e.target.value }))} /></label>
              </div>
            )}
            <p className="muted">إذا تُركت النوافذ فارغة، ستُستخدم مواعيد النظام الافتراضية. يمكنك ربط حساب دخول له لاحقًا من «الرواتب والتقارير ← حسابات الموظفين».</p>
            <div className="actions-row">
              <button className="primary" disabled={busy}>{busy ? "جارٍ الإضافة..." : "إضافة الموظف"}</button>
              <button type="button" className="secondary" onClick={() => { setShowAdd(false); setAddForm(emptyAdd); }}>إلغاء</button>
            </div>
          </form>
        )}
        <label className="field-search">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث باسم الموظف..." />
        </label>
        {loading && <SkeletonList />}
        {departments ? (
          <div className="dept-list">
            {departments.map((dept) => {
              // Searching auto-opens the sections that contain matches.
              const open = query.trim() ? true : openDepts.has(dept.name);
              return (
                <div className={cls("dept-group", open && "open")} key={dept.name}>
                  <button type="button" className="dept-bar" aria-expanded={open} onClick={() => toggleDept(dept.name)}>
                    <span className="dept-bar-name">{dept.name}</span>
                    <span className="dept-bar-count">{dept.members.length} موظف</span>
                    <ChevronLeft size={18} className="dept-bar-chev" />
                  </button>
                  {open && (
                    <div className="emp-grid">
                      {dept.members.map((e) => <EmployeeCard key={e.id} employee={e} onOpen={() => { setSelected(e); onNavigate?.("team", [e.id]); }} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="emp-grid">
            {filtered.map((e) => <EmployeeCard key={e.id} employee={e} onOpen={() => { setSelected(e); onNavigate?.("team", [e.id]); }} />)}
          </div>
        )}
        {!loading && filtered.length === 0 && <p className="muted">لا توجد نتائج.</p>}
      </section>

      {role === "owner" && <AssistantManager employees={employees} onChanged={load} onToast={onToast} />}
    </div>
  );
}

function EmployeeCard({ employee, onOpen }) {
  return (
    <button type="button" className="emp-card" onClick={onOpen}>
      <span className="emp-avatar">{(employee.name || "?").slice(0, 1)}</span>
      <span className="emp-card-body">
        <strong>{employee.name}</strong>
        <span className="muted">{employee.active ? (employee.attendance_exempt ? "مرتبات فقط" : "نشط") : "موقوف"}</span>
      </span>
      <ChevronLeft size={18} />
    </button>
  );
}

// Owner-only bulk control for who sees the AI assistant (default OFF for all).
function AssistantManager({ employees, onChanged, onToast }) {
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const people = useMemo(() => employees.filter((e) => e.active !== false), [employees]);

  function toggle(id) {
    setPicked((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function apply(enabled) {
    if (picked.size === 0) return onToast?.("اختر موظفًا واحدًا على الأقل.");
    setBusy(true);
    const { data, error } = await supabase.rpc("owner_set_assistant_bulk_v1", { p_ids: [...picked], p_enabled: enabled });
    setBusy(false);
    if (error || data?.error) return onToast?.(data?.message || "تعذر التحديث.");
    onToast?.(enabled ? `تم تفعيل المساعد لـ ${data.count} موظف.` : `تم إخفاء المساعد عن ${data.count} موظف.`);
    setPicked(new Set());
    onChanged?.();
  }

  const enabledCount = people.filter((e) => e.assistant_enabled).length;

  return (
    <section className="panel">
      <div className="panel-title between">
        <div><Sparkles size={20} /><h2>المساعد الذكي — من يستخدمه</h2></div>
        <span className="badge">{enabledCount} مفعّل</span>
      </div>
      <p className="muted">المساعد مخفي عن الجميع افتراضيًا (باستثناء المالك). اختر الأشخاص ثم فعّله أو أوقفه لهم دفعة واحدة.</p>
      <div className="assistant-pick-grid">
        {people.map((e) => (
          <label key={e.id} className={cls("assistant-pick", picked.has(e.id) && "picked")}>
            <input type="checkbox" checked={picked.has(e.id)} onChange={() => toggle(e.id)} />
            <span>{e.name}</span>
            {e.assistant_enabled && <span className="badge ok">مفعّل</span>}
          </label>
        ))}
      </div>
      <div className="actions-row">
        <button className="primary" type="button" disabled={busy || picked.size === 0} onClick={() => apply(true)}>
          <Sparkles size={16} /> فعّل للمحددين
        </button>
        <button className="secondary" type="button" disabled={busy || picked.size === 0} onClick={() => apply(false)}>
          أوقف للمحددين
        </button>
      </div>
    </section>
  );
}

function EmployeeDetail({ employee, role, onBack, onChanged, onDeleted, onToast }) {
  // One from/to period drives the statement cards and every table below.
  const [from, setFrom] = useState(() => `${todayIso().slice(0, 7)}-01`);
  const [to, setTo] = useState(todayIso());
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [active, setActive] = useState(employee.active);
  const [assistantOn, setAssistantOn] = useState(employee.assistant_enabled !== false);
  const isOwner = role === "owner";
  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);

  async function toggleActive() {
    setActing(true);
    const next = !active;
    const { data, error } = await supabase.rpc("owner_set_employee_active_v1", { p_employee_id: employee.id, p_active: next });
    setActing(false);
    if (error || data?.error) return onToast?.(data?.message || "تعذر تحديث حالة الموظف.");
    setActive(next);
    onToast?.(next ? "تم تفعيل الموظف." : "تم توقيف الموظف.");
    onChanged?.();
  }

  async function toggleAssistant() {
    setActing(true);
    const next = !assistantOn;
    const { data, error } = await supabase.rpc("owner_set_assistant_v1", { p_employee_id: employee.id, p_enabled: next });
    setActing(false);
    if (error || data?.error) return onToast?.(data?.message || "تعذر تحديث المساعد.");
    setAssistantOn(next);
    onToast?.(next ? "تم تفعيل المساعد الذكي للموظف." : "تم إخفاء المساعد الذكي عن الموظف.");
    onChanged?.();
  }

  const [confirmDelete, setConfirmDelete] = useState(false);

  async function removeEmployee() {
    setConfirmDelete(false);
    setActing(true);
    const { data, error } = await supabase.rpc("owner_delete_employee_v1", { p_employee_id: employee.id });
    setActing(false);
    if (error || data?.error) return onToast?.(data?.message || "تعذر حذف الموظف.");
    onToast?.(`تم حذف ${data.deleted}.`);
    onDeleted?.();
  }

  useEffect(() => { load(); }, [employee.id, from, to]);
  async function load() {
    setLoading(true);
    const id = employee.id;
    const [att, cant, oth, loans, inst, leaves, perms, sal] = await Promise.all([
      supabase.from("attendance").select("*").eq("employee_id", id).gte("work_date", from).lte("work_date", to).order("work_date", { ascending: false }),
      supabase.from("canteen_entries").select("*").eq("employee_id", id).gte("entry_date", from).lte("entry_date", to).order("entry_date", { ascending: false }),
      supabase.from("other_deductions").select("*").eq("employee_id", id).gte("entry_date", from).lte("entry_date", to).order("entry_date", { ascending: false }),
      supabase.from("emp_loans").select("*").eq("employee_id", id).order("created_at", { ascending: false }),
      supabase.from("emp_loan_installments").select("*").eq("employee_id", id).order("due_month"),
      supabase.from("leave_requests").select("*, cover:employees!leave_requests_cover_employee_id_fkey(name)").eq("employee_id", id).lte("from_date", to).gte("to_date", from).order("from_date", { ascending: false }),
      supabase.from("permissions").select("*").eq("employee_id", id).gte("perm_date", from).lte("perm_date", to).order("perm_date", { ascending: false }),
      role === "owner" ? supabase.from("salaries").select("monthly_salary").eq("employee_id", id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setD({
      att: att.data || [], cant: cant.data || [], oth: oth.data || [], loans: loans.data || [],
      inst: inst.data || [], leaves: leaves.data || [], perms: perms.data || [], salary: sal.data?.monthly_salary,
    });
    setLoading(false);
  }

  const stats = useMemo(() => {
    if (!d) return null;
    const present = d.att.filter((r) => r.check_in).length;
    const late = d.att.filter((r) => r.status === "late").length;
    const absent = d.att.filter((r) => r.status === "absent").length;
    const cantTotal = d.cant.filter((x) => x.status === "active").reduce((s, x) => s + Number(x.amount), 0);
    const othTotal = d.oth.filter((x) => x.status === "active").reduce((s, x) => s + Number(x.amount), 0);
    const activeLoanIds = new Set(d.loans.filter((l) => l.status === "active").map((l) => l.id));
    const instMonth = d.inst.filter((i) => activeLoanIds.has(i.loan_id) && i.due_month >= fromMonth && i.due_month <= toMonth).reduce((s, i) => s + Number(i.amount), 0);
    // خصم الحضور/الغياب: أيام مخصومة للتأخير + كل يوم غياب = يوم كامل. القيمة = أيام × (المرتب/30).
    const attDedDays = d.att.reduce((s, r) => s + Number(r.deduction_days || 0) + (r.status === "absent" ? 1 : 0), 0);
    const dailyRate = d.salary != null ? Number(d.salary) / 30 : null;
    const attDedAmount = dailyRate != null ? attDedDays * dailyRate : 0;
    return { present, late, absent, cantTotal, othTotal, instMonth, attDedDays, attDedAmount, dedTotal: cantTotal + othTotal + instMonth + attDedAmount };
  }, [d, fromMonth, toMonth]);

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-title between">
          <div><Users size={20} /><h2>{employee.name}</h2></div>
          <button className="secondary" onClick={onBack}><ChevronLeft size={16} /> رجوع للقايمة</button>
        </div>
        <div className="emp-meta">
          <span className={cls("badge", active ? "ok" : "muted")}>{active ? "نشط" : "موقوف"}</span>
          <span className="badge">{employee.attendance_exempt ? "مرتبات فقط" : "بيسجل حضور"}</span>
          <span className="badge">رصيد أجازات: {employee.leave_balance ?? "—"}</span>
          {!employee.attendance_exempt && (
            <span className="badge">حضور {fmtTime12(employee.checkin_from) || "—"}–{fmtTime12(employee.checkin_to) || "—"} · انصراف {fmtTime12(employee.checkout_from) || "—"}–{fmtTime12(employee.checkout_to) || "—"}</span>
          )}
          {role === "owner" && d?.salary != null && <span className="badge ok">المرتب: {money(d.salary)} ج</span>}
        </div>
        <div className="actions-row">
          <button className="secondary" type="button" onClick={toggleActive} disabled={acting}>
            <Power size={16} /> {active ? "توقيف الموظف" : "تفعيل الموظف"}
          </button>
          {isOwner && (
            <button className="secondary" type="button" onClick={toggleAssistant} disabled={acting}>
              <Sparkles size={16} /> {assistantOn ? "إخفاء المساعد الذكي" : "تفعيل المساعد الذكي"}
            </button>
          )}
          {isOwner && (
            <button className="danger-link" type="button" onClick={() => setConfirmDelete(true)} disabled={acting}>
              <Trash2 size={16} /> حذف نهائي
            </button>
          )}
        </div>
        <ConfirmDialog
          open={confirmDelete}
          title={`حذف ${employee.name} نهائيًا`}
          message="سيتم حذف الموظف وكل بياناته نهائيًا. إذا كان لديه سجل حضور أو ماليات، يفضَّل إيقافه بدلًا من الحذف."
          tone="danger"
          confirmLabel="حذف نهائيًا"
          busy={acting}
          onConfirm={removeEmployee}
          onCancel={() => setConfirmDelete(false)}
        />
      </section>

      {/* كشف حساب كامل (نفس صفحة الرواتب): الكروت + الحضور اليومي، بفلتر الفترة. */}
      {isOwner && (
        <EmployeeStatement
          fixedEmployeeId={employee.id}
          fixedEmployeeName={employee.name}
          from={from}
          to={to}
          setFrom={setFrom}
          setTo={setTo}
          onToast={onToast}
        />
      )}

      {loading && <section className="panel"><SkeletonList /></section>}

      {!loading && d && stats && (
        <>
          <section className="panel">
            <div className="panel-title"><Banknote size={20} /><h2>الخصومات والاستقطاعات</h2></div>
            {(stats.attDedDays > 0 || stats.instMonth > 0 || d.cant.length || d.oth.length) ? (
              <div className="table-wrap sticky-table">
                <table>
                  <thead><tr><th>النوع</th><th>التاريخ/الشهر</th><th>المبلغ</th><th>ملاحظة</th></tr></thead>
                  <tbody>
                    {stats.attDedDays > 0 && (
                      <tr>
                        <td>خصم حضور وغياب</td>
                        <td dir="ltr">{from} → {to}</td>
                        <td>{d.salary != null ? `${money(stats.attDedAmount)} ج` : "—"}</td>
                        <td>{stats.attDedDays.toFixed(2).replace(/\.?0+$/, "")} يوم</td>
                      </tr>
                    )}
                    {stats.instMonth > 0 && <tr><td>قسط سلفة</td><td dir="ltr">{fromMonth}{fromMonth !== toMonth ? ` → ${toMonth}` : ""}</td><td>{money(stats.instMonth)} ج</td><td>—</td></tr>}
                    {d.cant.filter((x) => x.status === "active").map((x) => <tr key={`c${x.id}`}><td>كانتين: {x.item}</td><td dir="ltr">{x.entry_date}</td><td>{money(x.amount)} ج</td><td className="note-cell">{x.note || "—"}</td></tr>)}
                    {d.oth.filter((x) => x.status === "active").map((x) => <tr key={`o${x.id}`}><td>{deductionCategoryLabels[x.category] || x.category}</td><td dir="ltr">{x.entry_date}</td><td>{money(x.amount)} ج</td><td className="note-cell">{x.note || "—"}</td></tr>)}
                  </tbody>
                  <tfoot><tr><td colSpan={2}>الإجمالي</td><td>{money(stats.dedTotal)} ج</td><td></td></tr></tfoot>
                </table>
              </div>
            ) : <p className="muted">لا توجد خصومات في الفترة.</p>}
            {d.loans.length > 0 && (
              <div className="table-wrap sticky-table" style={{ marginTop: 12 }}>
                <table>
                  <thead><tr><th>السلفة</th><th>المبلغ</th><th>أقساط</th><th>البداية</th><th>الحالة</th></tr></thead>
                  <tbody>
                    {d.loans.map((l) => <tr key={l.id}><td>#{l.id}</td><td>{money(l.amount)} ج</td><td>{l.installments_count}</td><td dir="ltr">{l.start_month}</td><td><StatusBadge status={l.status} /></td></tr>)}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-title"><CalendarDays size={20} /><h2>سجل الأجازات</h2></div>
            {d.leaves.length ? (
              <div className="table-wrap sticky-table">
                <table>
                  <thead><tr><th>من</th><th>إلى</th><th>أيام</th><th>الحالة</th><th>البديل</th><th>السبب</th></tr></thead>
                  <tbody>
                    {d.leaves.map((l) => (
                      <tr key={l.id}>
                        <td dir="ltr">{l.from_date}</td><td dir="ltr">{l.to_date}</td><td>{l.days}</td>
                        <td><span className={cls("status-badge", l.status)}>{reqStatusLabel(l.status)}</span></td>
                        <td>{l.cover?.name || "—"}</td><td className="note-cell">{l.reason || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="muted">لا توجد إجازات في الفترة.</p>}
          </section>

          <section className="panel">
            <div className="panel-title"><Clock3 size={20} /><h2>سجل الأذونات</h2></div>
            {d.perms.length ? (
              <div className="table-wrap sticky-table">
                <table>
                  <thead><tr><th>التاريخ</th><th>ساعات مطلوبة</th><th>ساعات متوافقة</th><th>الحالة</th><th>السبب</th></tr></thead>
                  <tbody>
                    {d.perms.map((p) => (
                      <tr key={p.id}>
                        <td dir="ltr">{p.perm_date}</td><td>{p.hours_requested}</td><td>{p.hours_approved ?? "—"}</td>
                        <td><span className={cls("status-badge", p.status)}>{reqStatusLabel(p.status)}</span></td>
                        <td className="note-cell">{p.reason || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="muted">لا توجد أذونات في الفترة.</p>}
          </section>

          {/* بصمة الوجه والأجهزة المسجلة في الآخر. */}
          {!employee.attendance_exempt && (
            <>
              <FaceEnrollment employee={employee} onToast={onToast} />
              <DeviceHistory employee={employee} />
            </>
          )}
        </>
      )}
    </div>
  );
}

export default EmployeesView;

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, CalendarDays, Clipboard, Clock3, FileSpreadsheet, History, MessageSquare, PieChart as PieChartIcon, Printer, QrCode, RefreshCcw, Search, UserCheck, Users, UserX } from "lucide-react";
import { supabase, todayIso } from "../../lib/supabase";
import { cls } from "../../lib/cls";
import { addDays, datesBetween } from "../../lib/dates";
import { csvCell, downloadTextFile } from "../../lib/format";
import { reqStatusLabel, statusLabels } from "../../lib/labels";
import { Metric, StatusBadge } from "../../ui/legacy";
import QRCodeLib from "qrcode";
import { Cell, Pie, PieChart as RePieChart, ResponsiveContainer, Tooltip as ChartTooltip } from "recharts";

function AdminDashboard({ context, onToast }) {
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [reportDate, setReportDate] = useState(todayIso());
  const [holiday, setHoliday] = useState({ date: todayIso(), to: todayIso(), label: "" });
  const [qr, setQr] = useState({ today: "", tomorrow: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    loadAdmin();
  }, [reportDate]);

  async function loadAdmin() {
    setLoading(true);
    setError("");
    try {
      const [emp, att, perm, leave, qrData, tomorrowQr] = await Promise.all([
        supabase.from("employees").select("id,name,leave_balance,active,attendance_exempt").order("id"),
        supabase.from("attendance").select("*").eq("work_date", reportDate),
        supabase.from("permissions").select("*, employees(name)").eq("status", "pending").order("perm_date"),
        supabase.from("leave_requests").select("*, employees!leave_requests_employee_id_fkey(name), cover:employees!leave_requests_cover_employee_id_fkey(name)").eq("status", "pending").order("from_date"),
        supabase.rpc("get_daily_qr_v1"),
        supabase.rpc("get_qr_for_date_v1", { p_date: addDays(todayIso(), 1) }),
      ]);
      const failed = [emp, att, perm, leave, qrData, tomorrowQr].find((item) => item.error);
      if (failed) throw failed.error;
      // Payroll-only employees (attendance_exempt) never appear on the attendance board.
      setEmployees((emp.data || []).filter((e) => !e.attendance_exempt));
      setAttendance(att.data || []);
      setPermissions(perm.data || []);
      setLeaves(leave.data || []);
      setQr({
        today: qrData.data?.code || "",
        tomorrow: tomorrowQr.data?.code || "",
      });
    } catch (err) {
      setError(err.message || "تعذر تحميل بيانات الإدارة.");
    }
    setLoading(false);
  }

  async function reset(empId) {
    const ok = confirm("تمسح سجل اليوم للموظف ده؟ العملية هتتسجل في Audit Log.");
    if (!ok) return;
    const { data, error } = await supabase.rpc("reset_attendance_day_v1", {
      p_employee_id: empId,
      p_date: reportDate,
      p_reason: "تصحيح سجل من لوحة v1",
    });
    if (error || data?.error) onToast(data?.message || "Owner فقط يقدر يمسح السجل.");
    else {
      onToast("تم مسح سجل اليوم.");
      loadAdmin();
    }
  }

  async function decidePermission(id, approve, hoursApproved) {
    if (context.role !== "owner") {
      onToast("الموافقة على الأذونات Owner فقط.");
      return;
    }
    const { data, error } = await supabase.rpc("decide_permission_v1", {
      p_id: id,
      p_approve: approve,
      p_hours_approved: hoursApproved,
      p_note: approve ? "تمت الموافقة" : "تم الرفض",
    });
    if (error || data?.error) onToast(data?.message || "تعذر تحديث الإذن.");
    else {
      onToast("تم تحديث طلب الإذن.");
      loadAdmin();
    }
  }

  async function decideLeave(id, approve) {
    if (context.role !== "owner") {
      onToast("الموافقة على الأجازات Owner فقط.");
      return;
    }
    const { data, error } = await supabase.rpc("decide_leave_v1", {
      p_id: id,
      p_approve: approve,
      p_note: approve ? "تمت الموافقة" : "تم الرفض",
    });
    if (error || data?.error) onToast(data?.message || "تعذر تحديث الأجازة.");
    else {
      onToast("تم تحديث طلب الأجازة.");
      loadAdmin();
    }
  }

  async function submitHoliday(event) {
    event.preventDefault();
    const from = holiday.date <= holiday.to ? holiday.date : holiday.to;
    const to = holiday.date <= holiday.to ? holiday.to : holiday.date;
    let failed = null;
    for (const day of datesBetween(from, to)) {
      const { data, error } = await supabase.rpc("set_official_holiday_v1", {
        p_date: day,
        p_label: holiday.label || "أجازة رسمية",
      });
      if (error || data?.error) {
        failed = data?.message || "تعذر تسجيل الأجازة الرسمية.";
        break;
      }
    }
    if (failed) onToast(failed);
    else {
      onToast("تم تسجيل الأجازة الرسمية.");
      setHoliday({ date: todayIso(), to: todayIso(), label: "" });
    }
  }

  async function markMissingCheckouts() {
    const { data, error } = await supabase.rpc("mark_missing_checkouts_v1", {
      p_date: reportDate,
    });
    if (error || data?.error) onToast(data?.message || "تعذر مراجعة الانصراف.");
    else {
      onToast(`تمت مراجعة ${data?.processed || 0} سجل بدون انصراف.`);
      loadAdmin();
    }
  }

  const recs = useMemo(() => new Map(attendance.map((row) => [row.employee_id, row])), [attendance]);
  const adminStats = useMemo(() => {
    const active = employees.filter((emp) => emp.active !== false);
    const checkedIn = active.filter((emp) => recs.get(emp.id)?.check_in).length;
    const late = active.filter((emp) => recs.get(emp.id)?.status === "late").length;
    const pending = active.filter((emp) => recs.get(emp.id)?.status === "pending").length;
    const missingCheckout = active.filter((emp) => {
      const rec = recs.get(emp.id);
      return rec?.check_in && !rec?.check_out && ["present", "late"].includes(rec.status);
    }).length;
    const deductions = attendance.reduce((sum, rec) => sum + Number(rec.deduction_days || 0), 0);
    return {
      active: active.length,
      checkedIn,
      notRegistered: Math.max(0, active.length - checkedIn),
      late,
      pending,
      missingCheckout,
      deductions,
    };
  }, [employees, attendance, recs]);
  const filteredEmployees = useMemo(() => {
    const query = employeeQuery.trim().toLowerCase();
    return employees.filter((emp) => {
      const rec = recs.get(emp.id);
      const status = rec?.status || "none";
      const matchesStatus = statusFilter === "all" || statusFilter === status;
      const matchesQuery = !query || emp.name.toLowerCase().includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [employees, employeeQuery, statusFilter, recs]);
  const donutData = useMemo(() => {
    const active = employees.filter((emp) => emp.active !== false);
    const count = (statuses) => active.filter((emp) => statuses.includes(recs.get(emp.id)?.status)).length;
    const registered = active.filter((emp) => recs.get(emp.id)).length;
    return [
      { name: "حاضر", value: count(["present"]), color: "#10B981" },
      { name: "متأخر", value: count(["late"]), color: "#F59E0B" },
      { name: "معلّق", value: count(["pending"]), color: "#FCC107" },
      { name: "أجازة/مأمورية", value: count(["leave", "mission", "sick"]), color: "#8B5CF6" },
      { name: "غياب", value: count(["absent"]), color: "#EF4444" },
      { name: "لم يسجل", value: Math.max(0, active.length - registered), color: "#94A3B8" },
    ].filter((item) => item.value > 0);
  }, [employees, recs]);
  const canApprove = context.role === "owner";

  function exportDayCsv() {
    const header = ["الموظف", "الحالة", "حضور", "انصراف", "دقائق تأخير", "خصم أيام", "ملاحظة الموظف", "ملاحظة HR"];
    const lines = filteredEmployees.map((emp) => {
      const rec = recs.get(emp.id);
      return [
        emp.name,
        rec ? statusLabels[rec.status] || rec.status : "لم يسجل",
        rec?.check_in || "",
        rec?.check_out || "",
        rec?.late_minutes || 0,
        rec?.deduction_days || 0,
        rec?.employee_note || "",
        rec?.hr_note || "",
      ].map(csvCell).join(",");
    });
    downloadTextFile(`attendance-${reportDate}.csv`, `\ufeff${header.map(csvCell).join(",")}\n${lines.join("\n")}`);
  }

  return (
    <div className="stack">
      {error && <div className="setup-banner">{error}</div>}
      <section className="panel">
        <div className="panel-title between">
          <div><Users size={20} /><h2>جدول الحضور</h2></div>
          <div className="toolbar">
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
            <button className="secondary" onClick={exportDayCsv} disabled={loading}>
              <FileSpreadsheet size={16} /> Excel
            </button>
            <button className="secondary" onClick={markMissingCheckouts}>مراجعة الانصراف</button>
            <button className="secondary" onClick={loadAdmin}>تحديث</button>
          </div>
        </div>
        <div className="stats-grid compact-stats">
          <Metric label="الموظفون" value={adminStats.active} icon={Users} />
          <Metric label="سجلوا حضور" value={adminStats.checkedIn} tone="ok" icon={UserCheck} />
          <Metric label="لم يسجلوا" value={adminStats.notRegistered} tone="danger" icon={UserX} />
          <Metric label="تأخير" value={adminStats.late} tone="warn" icon={Clock3} />
          <Metric label="بدون انصراف" value={adminStats.missingCheckout} tone="gold" icon={AlertTriangle} />
        </div>
        <div className="toolbar table-filters">
          <label className="search-field">
            <Search size={16} />
            <input value={employeeQuery} onChange={(e) => setEmployeeQuery(e.target.value)} placeholder="بحث باسم الموظف" />
          </label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">كل الحالات</option>
            <option value="none">لم يسجل</option>
            <option value="present">حاضر</option>
            <option value="late">متأخر</option>
            <option value="pending">معلق</option>
            <option value="leave">أجازة</option>
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>الموظف</th><th>الحالة</th><th>حضور</th><th>انصراف</th><th>خصم</th><th>ملاحظات</th><th>إجراء</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan="7">جاري التحميل...</td></tr>}
              {!loading && filteredEmployees.length === 0 && <tr><td colSpan="7">لا توجد نتائج مطابقة.</td></tr>}
              {!loading && filteredEmployees.map((emp) => {
                const rec = recs.get(emp.id);
                return (
                  <tr key={emp.id}>
                    <td>{emp.name}</td>
                    <td>{rec ? <StatusBadge status={rec.status} /> : "لم يسجل"}</td>
                    <td dir="ltr">{rec?.check_in?.slice(0, 5) || "-"}</td>
                    <td dir="ltr">{rec?.check_out?.slice(0, 5) || "-"}</td>
                    <td>{rec?.deduction_days || 0} يوم</td>
                    <td>
                      <AdminNoteCell empId={emp.id} rec={rec} reportDate={reportDate} onToast={onToast} onSaved={loadAdmin} />
                    </td>
                    <td>{context.role === "owner" && rec ? <button className="danger-link" onClick={() => reset(emp.id)}>تراجع</button> : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid two">
        <section className="panel">
          <div className="panel-title"><QrCode size={20} /><h2>QR اليوم</h2></div>
          <div className="qr-stack">
            <QrDisplay label="اليوم" code={qr.today} date={todayIso()} onToast={onToast} />
            <QrDisplay label="بكرة" code={qr.tomorrow} date={addDays(todayIso(), 1)} muted onToast={onToast} />
          </div>
          <p className="muted">الكود بيتولد ويتبعت تلقائيًا للفريق مرة واحدة يوميًا. اللوحة هنا للعرض والطباعة فقط.</p>
        </section>
        <section className="panel">
          <div className="panel-title"><PieChartIcon size={20} /><h2>توزيع حالات اليوم</h2></div>
          {donutData.length > 0 ? (
            <StatusDonut data={donutData} />
          ) : (
            <p className="muted">لا توجد بيانات لليوم بعد.</p>
          )}
        </section>
      </div>

      <form className="panel form" onSubmit={submitHoliday}>
        <div className="panel-title"><CalendarDays size={20} /><h2>أجازة رسمية</h2></div>
        <div className="form-grid">
          <label>من<input type="date" value={holiday.date} onChange={(e) => setHoliday((h) => ({ ...h, date: e.target.value }))} /></label>
          <label>إلى<input type="date" value={holiday.to} onChange={(e) => setHoliday((h) => ({ ...h, to: e.target.value }))} /></label>
        </div>
        <label>السبب<input value={holiday.label} onChange={(e) => setHoliday((h) => ({ ...h, label: e.target.value }))} placeholder="مثال: عيد رسمي" /></label>
        <button className="primary">تسجيل أجازة رسمية</button>
      </form>

      <Approvals title="أذونات معلقة" rows={permissions} type="permission" canApprove={canApprove} onPermission={decidePermission} />
      <Approvals title="أجازات معلقة" rows={leaves} type="leave" canApprove={canApprove} onLeave={decideLeave} />
      <RequestsHistory />
    </div>
  );
}

// Full leave + permission history (all statuses, with dates) — filterable.
function RequestsHistory() {
  const [tab, setTab] = useState("leaves");
  const [statusFilter, setStatusFilter] = useState("all");
  const [leaves, setLeaves] = useState([]);
  const [perms, setPerms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    const [l, p] = await Promise.all([
      supabase.from("leave_requests").select("*, employees!leave_requests_employee_id_fkey(name)").order("from_date", { ascending: false }).limit(300),
      supabase.from("permissions").select("*, employees(name)").order("perm_date", { ascending: false }).limit(300),
    ]);
    setLeaves(l.data || []);
    setPerms(p.data || []);
    setLoading(false);
  }
  const rows = tab === "leaves" ? leaves : perms;
  const filtered = rows.filter((r) => statusFilter === "all" || r.status === statusFilter);

  return (
    <section className="panel">
      <div className="panel-title between">
        <div><History size={20} /><h2>سجل الأجازات والأذونات</h2></div>
        <button className="secondary" onClick={load}><RefreshCcw size={16} /> تحديث</button>
      </div>
      <div className="seg-row">
        <div className="seg">
          <button className={cls(tab === "leaves" && "active")} onClick={() => setTab("leaves")}>الأجازات</button>
          <button className={cls(tab === "perms" && "active")} onClick={() => setTab("perms")}>الأذونات</button>
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">كل الحالات</option>
          <option value="pending">معلّقة</option>
          <option value="approved">متوافق عليها</option>
          <option value="rejected">مرفوضة</option>
        </select>
      </div>
      {loading && <p className="muted">جاري التحميل...</p>}
      {!loading && filtered.length === 0 && <p className="muted">مفيش سجلات.</p>}
      {!loading && filtered.length > 0 && tab === "leaves" && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>الموظف</th><th>من</th><th>إلى</th><th>أيام</th><th>الحالة</th><th>السبب</th></tr></thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id}>
                  <td>{l.employees?.name || "—"}</td>
                  <td dir="ltr">{l.from_date}</td><td dir="ltr">{l.to_date}</td><td>{l.days}</td>
                  <td><span className={cls("status-badge", l.status)}>{reqStatusLabel(l.status)}</span></td>
                  <td className="note-cell">{l.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && filtered.length > 0 && tab === "perms" && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>الموظف</th><th>التاريخ</th><th>ساعات</th><th>الحالة</th><th>السبب</th></tr></thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>{p.employees?.name || "—"}</td>
                  <td dir="ltr">{p.perm_date}</td><td>{p.hours_approved ?? p.hours_requested}</td>
                  <td><span className={cls("status-badge", p.status)}>{reqStatusLabel(p.status)}</span></td>
                  <td className="note-cell">{p.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AdminNoteCell({ empId, rec, reportDate, onToast, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(rec?.hr_note || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValue(rec?.hr_note || "");
    setEditing(false);
  }, [rec?.hr_note, reportDate, empId]);

  async function save() {
    setBusy(true);
    const { data, error } = await supabase.rpc("set_attendance_note_v1", {
      p_employee_id: empId,
      p_date: reportDate,
      p_note: value.trim() || null,
    });
    setBusy(false);
    if (error || data?.error) {
      onToast(data?.message || "تعذر حفظ الملاحظة.");
      return;
    }
    onToast("تم حفظ الملاحظة.");
    setEditing(false);
    onSaved();
  }

  return (
    <div className="note-cell">
      {rec?.employee_note && (
        <p className="note-emp" title="ملاحظة الموظف">
          <MessageSquare size={13} /> {rec.employee_note}
        </p>
      )}
      {editing ? (
        <div className="note-edit">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="ملاحظة الإدارة (مثال: تأخير)"
            maxLength={280}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                setValue(rec?.hr_note || "");
                setEditing(false);
              }
            }}
          />
          <button className="link" onClick={save} disabled={busy}>{busy ? "..." : "حفظ"}</button>
          <button className="link-muted" onClick={() => { setValue(rec?.hr_note || ""); setEditing(false); }}>إلغاء</button>
        </div>
      ) : (
        <button className="note-hr" onClick={() => setEditing(true)} title="اكتب ملاحظة للإدارة">
          {rec?.hr_note ? rec.hr_note : <span className="muted">+ ملاحظة</span>}
        </button>
      )}
    </div>
  );
}

function Approvals({ title, rows, type, canApprove, onPermission, onLeave }) {
  return (
    <section className="panel">
      <div className="panel-title"><Bell size={20} /><h2>{title}</h2></div>
      <div className="list">
        {rows.length === 0 && <p className="muted">لا توجد طلبات معلقة.</p>}
        {rows.map((row) => (
          <div className="approval-row" key={row.id}>
            <div>
              <strong>{row.employees?.name || `موظف #${row.employee_id}`}</strong>
              <span>{type === "permission" ? `${row.perm_date} · ${row.hours_requested || row.hours} ساعة` : `${row.from_date} → ${row.to_date}`}</span>
              {type === "leave" && row.cover?.name && <span>Cover: {row.cover.name}</span>}
              <p>{row.reason || "بدون سبب"}</p>
            </div>
            <div className="approval-actions">
              {!canApprove && <span className="badge">قرار Owner فقط</span>}
              {canApprove && type === "permission" && (
                <>
                  <button onClick={() => onPermission(row.id, true, 1)}>موافقة ساعة</button>
                  <button onClick={() => onPermission(row.id, true, 2)}>موافقة ساعتين</button>
                  <button className="danger-link" onClick={() => onPermission(row.id, false, null)}>رفض</button>
                </>
              )}
              {canApprove && type === "leave" && (
                <>
                  <button onClick={() => onLeave(row.id, true)}>موافقة</button>
                  <button className="danger-link" onClick={() => onLeave(row.id, false)}>رفض</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function QrDisplay({ label, code, date, muted, onToast }) {
  const [image, setImage] = useState("");

  useEffect(() => {
    if (!code) {
      setImage("");
      return;
    }
    QRCodeLib.toDataURL(code, {
      width: 190,
      margin: 2,
      color: {
        dark: muted ? "#667085" : "#071224",
        light: "#ffffff",
      },
    }).then(setImage).catch(() => setImage(""));
  }, [code, muted]);

  async function copyCode() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    onToast?.(`تم نسخ كود ${label}.`);
  }

  return (
    <div className={cls("qr-card", muted && "muted")}>
      <div>
        <span>{label}</span>
        {date && <small>{date}</small>}
      </div>
      {image ? <img src={image} alt={`QR ${label}`} /> : <div className="qr-placeholder">QR</div>}
      <div className="qr-code">{code || "-"}</div>
      <div className="qr-actions">
        <button className="secondary" type="button" onClick={copyCode} disabled={!code}>
          <Clipboard size={15} /> نسخ
        </button>
        <button className="secondary" type="button" onClick={() => window.print()} disabled={!code}>
          <Printer size={15} /> طباعة
        </button>
      </div>
    </div>
  );
}

function StatusDonut({ data }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return (
    <>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height={220}>
          <RePieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={88}
              paddingAngle={4}
            >
              {data.map((item) => (
                <Cell key={item.name} fill={item.color} />
              ))}
            </Pie>
            <ChartTooltip />
          </RePieChart>
        </ResponsiveContainer>
      </div>
      <div className="donut-legend">
        {data.map((item) => (
          <div key={item.name}>
            <span>
              <i style={{ background: item.color }} />
              {item.name}
            </span>
            <b>
              {item.value}
              {total ? ` · ${Math.round((item.value / total) * 100)}%` : ""}
            </b>
          </div>
        ))}
      </div>
    </>
  );
}

export default AdminDashboard;

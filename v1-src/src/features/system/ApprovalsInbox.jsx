import { useEffect, useState } from "react";
import { Bell, CalendarDays, CheckCheck, ChevronRight, Clock3, Inbox, Send, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { cls } from "../../lib/cls";
import { haptic } from "../../lib/haptics";
import {
  decideLeaveRpc,
  decidePermissionRpc,
  pendingLeavesQuery,
  pendingPermissionsQuery,
} from "../../lib/approvals";
import { fmtDateTime, fmtSubmittedAt } from "../../lib/format";
import { notificationCategoryLabels } from "../../lib/labels";
import { ConfirmDialog } from "../../ui/primitives";
import PushToggle from "../../ui/PushToggle";

// «الإشعارات والطلبات» (redesign spec D) — the bell's destination for every
// role. Everyone sees their notifications; owner/hr additionally see the
// «بانتظار قرارك» approvals section with the same decide RPCs as
// AdminDashboard (shared via lib/approvals.js). Optimistic approve/reject with
// rollback; server-side owner guard unchanged.
function ApprovalsInbox({ context, onToast }) {
  const role = context?.role || "employee";
  const isAdmin = role === "hr" || role === "owner";

  const [approvals, setApprovals] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [deleteId, setDeleteId] = useState(null);

  const load = () => {
    setLoading(true);
    const jobs = [
      supabase
        .from("notifications")
        .select("id,title,body,category,read_at,created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      isAdmin ? pendingPermissionsQuery() : Promise.resolve({ data: [] }),
      isAdmin ? pendingLeavesQuery() : Promise.resolve({ data: [] }),
    ];
    Promise.all(jobs)
      .then(([notif, perm, leave]) => {
        setNotifs(notif.data || []);
        const rows = [
          ...(perm.data || []).map((item) => ({
            key: `perm-${item.id}`, kind: "permission", id: item.id,
            title: "طلب إذن", requester: item.employees?.name || `#${item.employee_id}`,
            range: `${item.perm_date} · ${item.hours_requested || item.hours || 1} ساعة`,
            note: item.reason, submittedAt: item.created_at,
            hours: item.hours_requested || item.hours || 1, sort: item.perm_date, status: "pending",
          })),
          ...(leave.data || []).map((item) => ({
            key: `leave-${item.id}`, kind: "leave", id: item.id,
            title: "طلب أجازة", requester: item.employees?.name || `#${item.employee_id}`,
            range: `${item.from_date} ← ${item.to_date} · ${item.days} يوم${item.cover?.name ? ` · البديل ${item.cover.name}` : ""}`,
            note: item.reason, submittedAt: item.created_at, sort: item.from_date, status: "pending",
          })),
        ].sort((a, b) => String(a.sort).localeCompare(String(b.sort)));
        setApprovals(rows);
        setLoading(false);
      })
      .catch(() => {
        onToast?.("تعذر تحميل الإشعارات والطلبات.");
        setLoading(false);
      });
  };

  useEffect(load, [role]);

  async function decide(item, approve) {
    if (role !== "owner") {
      onToast?.("الموافقة على الطلبات للمالك فقط.");
      return;
    }
    setBusyId(item.key);
    setApprovals((rows) => rows.map((row) => (row.key === item.key ? { ...row, status: approve ? "approved" : "rejected" } : row)));
    const { data, error } = item.kind === "permission"
      ? await decidePermissionRpc({ id: item.id, approve, hoursApproved: approve ? item.hours : null })
      : await decideLeaveRpc({ id: item.id, approve });
    setBusyId("");
    if (error || data?.error) {
      setApprovals((rows) => rows.map((row) => (row.key === item.key ? { ...row, status: "pending" } : row)));
      onToast?.(data?.message || "تعذر تحديث الطلب.");
      return;
    }
    haptic();
    onToast?.(approve ? "تمت الموافقة على الطلب." : "تم رفض الطلب.");
  }

  async function markRead(id) {
    await supabase.rpc("mark_notification_read_v1", { p_id: id });
    setNotifs((rows) => rows.map((row) => (row.id === id ? { ...row, read_at: new Date().toISOString() } : row)));
  }

  async function markAllRead() {
    setBusyId("read-all");
    const { data, error } = await supabase.rpc("mark_all_notifications_read_v1");
    setBusyId("");
    if (error || data?.error) {
      onToast?.(data?.message || "تعذر تحديث الإشعارات.");
      return;
    }
    setNotifs((rows) => rows.map((row) => ({ ...row, read_at: row.read_at || new Date().toISOString() })));
    onToast?.(`تم تعليم ${data?.count || 0} إشعار كمقروء.`);
  }

  async function deleteForAll(id) {
    const { data, error } = await supabase.rpc("owner_delete_notification_v1", { p_id: id });
    if (error || data?.error) {
      onToast?.(data?.message || "تعذر حذف الإشعار.");
      return;
    }
    setNotifs((rows) => rows.filter((row) => row.id !== id));
    onToast?.(`تم حذف الإشعار من ${data?.count || 0} مستلم.`);
  }

  const pendingCount = approvals.filter((item) => item.status === "pending").length;
  const unread = notifs.filter((row) => !row.read_at).length;

  return (
    <div className="stack approvals-screen">
      <header className="approvals-head">
        <button type="button" className="approvals-back" onClick={() => window.history.back()} aria-label="رجوع">
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        <h2>الإشعارات والطلبات</h2>
        {isAdmin ? (
          <button type="button" className="approvals-compose" onClick={() => { window.location.hash = "notifications"; }}>
            <Send size={15} aria-hidden="true" /> إرسال
          </button>
        ) : null}
      </header>

      {/* بانتظار قرارك — owner/hr only */}
      {isAdmin ? (
        <>
          <p className="approvals-section-label">بانتظار قرارك {pendingCount > 0 ? `(${pendingCount})` : ""}</p>
          {loading ? (
            <p className="muted">جارٍ التحميل…</p>
          ) : approvals.length === 0 ? (
            <section className="panel approvals-empty">
              <Inbox size={20} aria-hidden="true" />
              <p>لا توجد طلبات معلقة — كله متظبط 👌</p>
            </section>
          ) : (
            approvals.map((item) => (
              <section className={cls("panel approval-card", item.status !== "pending" && "is-decided")} key={item.key}>
                <div className="approval-card-head">
                  <strong>
                    {item.kind === "permission" ? <Clock3 size={15} aria-hidden="true" /> : <CalendarDays size={15} aria-hidden="true" />}
                    {item.title}
                  </strong>
                  <span className="approval-requester">{item.requester}</span>
                </div>
                <p className="approval-range">{item.range}</p>
                {item.note ? <p className="approval-note">{item.note}</p> : null}
                {item.submittedAt ? <p className="muted approval-submitted">قُدّم {fmtSubmittedAt(item.submittedAt)}</p> : null}
                {item.status === "pending" ? (
                  <div className="approval-decide">
                    <button type="button" className="approval-accept" disabled={busyId === item.key} onClick={() => decide(item, true)}>قبول</button>
                    <button type="button" className="approval-reject" disabled={busyId === item.key} onClick={() => decide(item, false)}>رفض</button>
                  </div>
                ) : (
                  <span className={cls("approval-decided-chip", item.status === "approved" ? "is-ok" : "is-no")}>
                    {item.status === "approved" ? "تمت الموافقة ✓" : "تم الرفض"}
                  </span>
                )}
              </section>
            ))
          )}
        </>
      ) : null}

      {/* الإشعارات — everyone */}
      <section className="panel">
        <div className="panel-title between">
          <div><Bell size={20} /><h2>الإشعارات</h2></div>
          <button className="secondary" onClick={markAllRead} disabled={busyId === "read-all" || unread === 0}>
            <CheckCheck size={16} /> تعليم الكل{unread > 0 ? ` (${unread})` : ""}
          </button>
        </div>
        <div className="notif-list">
          {loading && <p className="muted">جارٍ تحميل الإشعارات…</p>}
          {!loading && notifs.length === 0 && <p className="muted">لا توجد إشعارات بعد.</p>}
          {!loading && notifs.map((item) => (
            <div className={cls("notif-card", !item.read_at && "is-unread")} id={`notif-${item.id}`} key={item.id}>
              <span className="notif-cat">{notificationCategoryLabels[item.category] || item.category || "النظام"}</span>
              <strong className="notif-title">{item.title}</strong>
              <p className="notif-body">{item.body}</p>
              <div className="notif-foot">
                <time className="notif-time" dateTime={item.created_at}>{fmtDateTime(item.created_at)}</time>
                <div className="notif-actions">
                  {!item.read_at && <button className="notif-read" onClick={() => markRead(item.id)}>تمت القراءة</button>}
                  {role === "owner" && <button className="danger-link" onClick={() => setDeleteId(item.id)}><Trash2 size={14} /> حذف من الكل</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="notif-push"><PushToggle onToast={onToast} /></div>
      </section>

      <ConfirmDialog
        open={deleteId !== null}
        title="حذف الإشعار"
        message="سيتم حذف هذا الإشعار من جميع المستلمين."
        tone="danger"
        confirmLabel="حذف من الكل"
        onConfirm={() => { const id = deleteId; setDeleteId(null); deleteForAll(id); }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

export default ApprovalsInbox;

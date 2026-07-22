import { useEffect, useState } from "react";
import { CalendarDays, ChevronRight, Clock3, Inbox } from "lucide-react";
import { cls } from "../../lib/cls";
import { haptic } from "../../lib/haptics";
import {
  decideLeaveRpc,
  decidePermissionRpc,
  pendingLeavesQuery,
  pendingPermissionsQuery,
} from "../../lib/approvals";
import { fmtSubmittedAt } from "../../lib/format";

// «بانتظار قرارك» (redesign spec D): a focused approvals screen for owner/hr.
// Same queries + decide RPCs as AdminDashboard (shared via lib/approvals.js);
// approve/reject is optimistic with rollback on error. The bell popover keeps
// plain notifications — this screen is only actionable requests.
function ApprovalsInbox({ context, onToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([pendingPermissionsQuery(), pendingLeavesQuery()])
      .then(([perm, leave]) => {
        if (perm.error || leave.error) throw perm.error || leave.error;
        const rows = [
          ...(perm.data || []).map((item) => ({
            key: `perm-${item.id}`,
            kind: "permission",
            id: item.id,
            title: "طلب إذن",
            requester: item.employees?.name || `#${item.employee_id}`,
            range: `${item.perm_date} · ${item.hours_requested || item.hours || 1} ساعة`,
            note: item.reason,
            submittedAt: item.created_at,
            hours: item.hours_requested || item.hours || 1,
            sort: item.perm_date,
            status: "pending",
          })),
          ...(leave.data || []).map((item) => ({
            key: `leave-${item.id}`,
            kind: "leave",
            id: item.id,
            title: "طلب أجازة",
            requester: item.employees?.name || `#${item.employee_id}`,
            range: `${item.from_date} ← ${item.to_date} · ${item.days} يوم${item.cover?.name ? ` · البديل ${item.cover.name}` : ""}`,
            note: item.reason,
            submittedAt: item.created_at,
            sort: item.from_date,
            status: "pending",
          })),
        ].sort((a, b) => String(a.sort).localeCompare(String(b.sort)));
        setItems(rows);
        setLoading(false);
      })
      .catch(() => {
        onToast?.("تعذر تحميل الطلبات المعلقة.");
        setItems([]);
        setLoading(false);
      });
  };

  useEffect(load, []);

  async function decide(item, approve) {
    if (context?.role !== "owner") {
      onToast?.("الموافقة على الطلبات للمالك فقط.");
      return;
    }
    setBusyId(item.key);
    // Optimistic flip; rolled back if the RPC refuses.
    setItems((rows) => rows.map((row) => (row.key === item.key ? { ...row, status: approve ? "approved" : "rejected" } : row)));
    const { data, error } = item.kind === "permission"
      ? await decidePermissionRpc({ id: item.id, approve, hoursApproved: approve ? item.hours : null })
      : await decideLeaveRpc({ id: item.id, approve });
    setBusyId("");
    if (error || data?.error) {
      setItems((rows) => rows.map((row) => (row.key === item.key ? { ...row, status: "pending" } : row)));
      onToast?.(data?.message || "تعذر تحديث الطلب.");
      return;
    }
    haptic();
    onToast?.(approve ? "تمت الموافقة على الطلب." : "تم رفض الطلب.");
  }

  const pendingCount = items.filter((item) => item.status === "pending").length;

  return (
    <div className="stack approvals-screen">
      <header className="approvals-head">
        <button type="button" className="approvals-back" onClick={() => window.history.back()} aria-label="رجوع">
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        <h2>الإشعارات والطلبات</h2>
      </header>

      <p className="approvals-section-label">بانتظار قرارك {pendingCount > 0 ? `(${pendingCount})` : ""}</p>

      {loading ? (
        <p className="muted">جارٍ تحميل الطلبات…</p>
      ) : items.length === 0 ? (
        <section className="panel approvals-empty">
          <Inbox size={22} aria-hidden="true" />
          <p>لا توجد طلبات معلقة — كله متظبط 👌</p>
        </section>
      ) : (
        items.map((item) => (
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
              <div className="approval-actions">
                <button type="button" className="approval-accept" disabled={busyId === item.key} onClick={() => decide(item, true)}>
                  قبول
                </button>
                <button type="button" className="approval-reject" disabled={busyId === item.key} onClick={() => decide(item, false)}>
                  رفض
                </button>
              </div>
            ) : (
              <span className={cls("approval-decided-chip", item.status === "approved" ? "is-ok" : "is-no")}>
                {item.status === "approved" ? "تمت الموافقة ✓" : "تم الرفض"}
              </span>
            )}
          </section>
        ))
      )}
    </div>
  );
}

export default ApprovalsInbox;

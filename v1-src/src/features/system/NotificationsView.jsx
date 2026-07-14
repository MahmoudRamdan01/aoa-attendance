import { useEffect, useState } from "react";
import { Bell, CheckCheck, Send, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { cls } from "../../lib/cls";

import { fmtDateTime } from "../../lib/format";
import { notificationCategoryLabels } from "../../lib/labels";

function NotificationsView({ context, onToast }) {
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [message, setMessage] = useState({ scope: "team", employeeId: "", title: "", body: "" });
  const [busy, setBusy] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const role = context?.role || "employee";
  const isAdmin = role === "hr" || role === "owner";

  useEffect(() => {
    loadNotifications();
    if (isAdmin) {
      supabase.from("employees").select("id,name,active").eq("active", true).order("id").then(({ data }) => {
        setEmployees(data || []);
        if (!message.employeeId && data?.[0]) {
          setMessage((current) => ({ ...current, employeeId: String(data[0].id) }));
        }
      });
    }
  }, [context?.role]);

  async function loadNotifications() {
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("id,title,body,category,priority,read_at,created_at,created_by,group_id")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) onToast?.("تعذر تحميل الإشعارات.");
    setRows(data || []);
    setLoading(false);
  }

  async function sendMessage(event) {
    event.preventDefault();
    setBusy("send");
    const { data, error } = await supabase.rpc("send_admin_message_v1", {
      p_scope: message.scope,
      p_employee_id: message.scope === "employee" ? Number(message.employeeId) : null,
      p_title: message.title,
      p_body: message.body,
    });
    setBusy("");
    if (error || data?.error) {
      onToast?.(data?.message || "تعذر إرسال الإشعار.");
      return;
    }
    setMessage((current) => ({ ...current, title: "", body: "" }));
    onToast?.(`تم إرسال الإشعار إلى ${data.count || 0} مستلم.`);
    loadNotifications();
  }

  async function markRead(id) {
    await supabase.rpc("mark_notification_read_v1", { p_id: id });
    loadNotifications();
  }

  async function markAllRead() {
    setBusy("read-all");
    const { data, error } = await supabase.rpc("mark_all_notifications_read_v1");
    setBusy("");
    if (error || data?.error) {
      onToast?.(data?.message || "تعذر تحديث الإشعارات.");
      return;
    }
    onToast?.(`تم تعليم ${data.count || 0} إشعار كمقروء.`);
    loadNotifications();
  }

  async function deleteForAll(id) {
    const ok = confirm("تحذف الإشعار ده من عند كل المستلمين؟");
    if (!ok) return;
    const { data, error } = await supabase.rpc("owner_delete_notification_v1", { p_id: id });
    if (error || data?.error) {
      onToast?.(data?.message || "تعذر حذف الإشعار.");
      return;
    }
    onToast?.(`تم حذف الإشعار من ${data.count || 0} مستلم.`);
    loadNotifications();
  }

  const unread = rows.filter((row) => !row.read_at).length;
  const visibleRows = rows.filter((row) => filter === "all" || !row.read_at);

  return (
    <div className="stack">
      {isAdmin && (
        <section className="panel">
          <div className="panel-title"><Send size={20} /><h2>إرسال إشعار</h2></div>
          <form className="form message-form" onSubmit={sendMessage}>
            <label>المستلم<select value={message.scope} onChange={(e) => setMessage((current) => ({ ...current, scope: e.target.value }))}><option value="team">الفريق كله</option><option value="employee">موظف معين</option></select></label>
            {message.scope === "employee" && (
              <label>الموظف<select value={message.employeeId} onChange={(e) => setMessage((current) => ({ ...current, employeeId: e.target.value }))}>{employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}</select></label>
            )}
            <label>العنوان<input value={message.title} onChange={(e) => setMessage((current) => ({ ...current, title: e.target.value }))} required placeholder="عنوان مختصر" /></label>
            <label>الرسالة<textarea value={message.body} onChange={(e) => setMessage((current) => ({ ...current, body: e.target.value }))} required placeholder="نص الإشعار" /></label>
            <button className="primary" disabled={busy === "send"}><Send size={17} /> {busy === "send" ? "جاري الإرسال..." : "إرسال"}</button>
          </form>
        </section>
      )}

      <section className="panel">
          <div className="panel-title between">
          <div><Bell size={20} /><h2>الإشعارات</h2></div>
          <div className="toolbar">
            <span className="badge">{unread} غير مقروء</span>
            <div className="tabs compact-tabs no-margin">
              <button className={cls(filter === "all" && "active")} onClick={() => setFilter("all")}>الكل</button>
              <button className={cls(filter === "unread" && "active")} onClick={() => setFilter("unread")}>غير مقروء</button>
            </div>
            <button className="secondary" onClick={markAllRead} disabled={busy === "read-all" || unread === 0}>
              <CheckCheck size={16} /> تعليم الكل
            </button>
            <button className="secondary" onClick={loadNotifications}>تحديث</button>
          </div>
        </div>
        <div className="list">
          {loading && <p className="muted">جاري تحميل الإشعارات...</p>}
          {!loading && visibleRows.length === 0 && <p className="muted">لا توجد إشعارات بعد.</p>}
          {!loading && visibleRows.map((item) => (
            <div className={cls("list-row notification-row", !item.read_at && "unread")} key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <span>{fmtDateTime(item.created_at)} · {notificationCategoryLabels[item.category] || item.category || "النظام"}</span>
              </div>
              <p>{item.body}</p>
              <div className="notification-actions">
                {!item.read_at && <button className="secondary" onClick={() => markRead(item.id)}>تمت القراءة</button>}
                {role === "owner" && <button className="danger-link" onClick={() => deleteForAll(item.id)}><Trash2 size={15} /> حذف من الكل</button>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default NotificationsView;

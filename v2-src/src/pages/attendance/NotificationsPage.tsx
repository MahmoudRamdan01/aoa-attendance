import { useEffect, useState } from "react"
import { Bell, CheckCheck, RefreshCcw, Send, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { fmtDateTime, notificationCategoryLabels } from "@/lib/attendance"
import { useAuthContext } from "@/providers/AuthProvider"
import type { EmployeeRow, NotificationRow, RpcResult } from "@/types/attendance"
import Panel from "@/components/attendance/Panel"
import {
  btnPrimary,
  btnSecondary,
  dangerLink,
  inputCls,
  labelCls,
  mutedText,
  selectCls,
  textareaCls,
} from "@/components/attendance/styles"
import { cn } from "@/lib/utils"

export default function NotificationsPage() {
  const { context, role, isAdmin, refreshUnread } = useAuthContext()
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [message, setMessage] = useState({ scope: "team", employeeId: "", title: "", body: "" })
  const [busy, setBusy] = useState("")
  const [filter, setFilter] = useState<"all" | "unread">("all")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadNotifications()
    if (isAdmin) {
      supabase
        .from("employees")
        .select("id,name,active")
        .eq("active", true)
        .order("id")
        .then(({ data }) => {
          const list = (data as EmployeeRow[]) || []
          setEmployees(list)
          if (list[0]) {
            setMessage((current) =>
              current.employeeId ? current : { ...current, employeeId: String(list[0].id) }
            )
          }
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.role])

  async function loadNotifications() {
    setLoading(true)
    const { data, error } = await supabase
      .from("notifications")
      .select("id,title,body,category,priority,read_at,created_at,created_by,group_id")
      .order("created_at", { ascending: false })
      .limit(50)
    if (error) toast.error("تعذر تحميل الإشعارات.")
    setRows((data as NotificationRow[]) || [])
    setLoading(false)
    refreshUnread()
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault()
    setBusy("send")
    const { data, error } = await supabase.rpc("send_admin_message_v1", {
      p_scope: message.scope,
      p_employee_id: message.scope === "employee" ? Number(message.employeeId) : null,
      p_title: message.title,
      p_body: message.body,
    })
    setBusy("")
    const result = data as RpcResult | null
    if (error || result?.error) {
      toast.error(result?.message || "تعذر إرسال الإشعار.")
      return
    }
    setMessage((current) => ({ ...current, title: "", body: "" }))
    toast.success(`تم إرسال الإشعار إلى ${result?.count || 0} مستلم.`)
    loadNotifications()
  }

  async function markRead(id: number) {
    await supabase.rpc("mark_notification_read_v1", { p_id: id })
    loadNotifications()
  }

  async function markAllRead() {
    setBusy("read-all")
    const { data, error } = await supabase.rpc("mark_all_notifications_read_v1")
    setBusy("")
    const result = data as RpcResult | null
    if (error || result?.error) {
      toast.error(result?.message || "تعذر تحديث الإشعارات.")
      return
    }
    toast.success(`تم تعليم ${result?.count || 0} إشعار كمقروء.`)
    loadNotifications()
  }

  async function deleteForAll(id: number) {
    const ok = confirm("تحذف الإشعار ده من عند كل المستلمين؟")
    if (!ok) return
    const { data, error } = await supabase.rpc("owner_delete_notification_v1", { p_id: id })
    const result = data as RpcResult | null
    if (error || result?.error) {
      toast.error(result?.message || "تعذر حذف الإشعار.")
      return
    }
    toast.success(`تم حذف الإشعار من ${result?.count || 0} مستلم.`)
    loadNotifications()
  }

  const unread = rows.filter((row) => !row.read_at).length
  const visibleRows = rows.filter((row) => filter === "all" || !row.read_at)

  const tabCls = (active: boolean) =>
    cn(
      "h-8 px-3 rounded-full text-xs font-medium transition-colors",
      active ? "bg-[#FCC10E] text-[#383737]" : "text-[var(--c-muted)] hover:bg-[var(--c-page)]"
    )

  return (
    <div className="space-y-6">
      {isAdmin && (
        <Panel icon={Send} title="إرسال إشعار" subtitle="رسالة إدارية للفريق أو لموظف محدد">
          <form className="space-y-4" onSubmit={sendMessage}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className={labelCls}>
                المستلم
                <select
                  className={selectCls}
                  value={message.scope}
                  onChange={(e) => setMessage((current) => ({ ...current, scope: e.target.value }))}
                >
                  <option value="team">الفريق كله</option>
                  <option value="employee">موظف معين</option>
                </select>
              </label>
              {message.scope === "employee" && (
                <label className={labelCls}>
                  الموظف
                  <select
                    className={selectCls}
                    value={message.employeeId}
                    onChange={(e) => setMessage((current) => ({ ...current, employeeId: e.target.value }))}
                  >
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <label className={labelCls}>
              العنوان
              <input
                className={inputCls}
                value={message.title}
                onChange={(e) => setMessage((current) => ({ ...current, title: e.target.value }))}
                required
                placeholder="عنوان مختصر"
              />
            </label>
            <label className={labelCls}>
              الرسالة
              <textarea
                className={textareaCls}
                value={message.body}
                onChange={(e) => setMessage((current) => ({ ...current, body: e.target.value }))}
                required
                placeholder="نص الإشعار"
              />
            </label>
            <button className={btnPrimary} disabled={busy === "send"}>
              <Send className="w-4 h-4" /> {busy === "send" ? "جاري الإرسال..." : "إرسال"}
            </button>
          </form>
        </Panel>
      )}

      <Panel
        icon={Bell}
        title="الإشعارات"
        actions={
          <>
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--c-amber-bg)] text-[var(--c-amber)]">
              {unread} غير مقروء
            </span>
            <div className="flex items-center gap-1 bg-[var(--c-panel-soft)] rounded-full p-1">
              <button className={tabCls(filter === "all")} onClick={() => setFilter("all")}>
                الكل
              </button>
              <button className={tabCls(filter === "unread")} onClick={() => setFilter("unread")}>
                غير مقروء
              </button>
            </div>
            <button className={btnSecondary} onClick={markAllRead} disabled={busy === "read-all" || unread === 0}>
              <CheckCheck className="w-4 h-4" /> تعليم الكل
            </button>
            <button className={btnSecondary} onClick={loadNotifications}>
              <RefreshCcw className="w-4 h-4" /> تحديث
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {loading && <p className={mutedText}>جاري تحميل الإشعارات...</p>}
          {!loading && visibleRows.length === 0 && <p className={mutedText}>لا توجد إشعارات بعد.</p>}
          {!loading &&
            visibleRows.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "rounded-xl p-4 space-y-1.5 border",
                  !item.read_at
                    ? "border-r-4 border-[#FCC10E] bg-[var(--c-orange-bg2)] border-y-[var(--c-line-soft)] border-l-[var(--c-line-soft)]"
                    : "border-[var(--c-line-soft)] bg-[var(--c-panel-soft)]"
                )}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <strong className="text-sm font-semibold text-[var(--c-ink)]">{item.title}</strong>
                  <span className="text-xs text-[var(--c-faint)]">
                    {fmtDateTime(item.created_at)} ·{" "}
                    {notificationCategoryLabels[item.category || ""] || item.category || "النظام"}
                  </span>
                </div>
                <p className="text-sm text-[var(--c-ink)] whitespace-pre-wrap">{item.body}</p>
                <div className="flex items-center gap-3 pt-1">
                  {!item.read_at && (
                    <button className={btnSecondary + " h-8"} onClick={() => markRead(item.id)}>
                      تمت القراءة
                    </button>
                  )}
                  {role === "owner" && (
                    <button className={dangerLink + " inline-flex items-center gap-1"} onClick={() => deleteForAll(item.id)}>
                      <Trash2 className="w-3.5 h-3.5" /> حذف من الكل
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>
      </Panel>
    </div>
  )
}

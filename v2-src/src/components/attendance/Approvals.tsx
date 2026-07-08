import { Bell } from "lucide-react"
import Panel from "./Panel"
import StatusBadge from "./StatusBadge"
import { dangerLink } from "./styles"
import type { LeaveRow, PermissionRow } from "@/types/attendance"

interface ApprovalsProps {
  title: string
  rows: Array<PermissionRow | LeaveRow>
  type: "permission" | "leave"
  canApprove: boolean
  onPermission?: (id: number, approve: boolean, hoursApproved: number | null) => void
  onLeave?: (id: number, approve: boolean) => void
}

const approveBtn =
  "h-8 px-3 rounded-lg bg-[var(--c-green-bg)] text-[var(--c-green)] text-xs font-semibold hover:bg-[var(--c-green-bg)] transition-colors"

export default function Approvals({ title, rows, type, canApprove, onPermission, onLeave }: ApprovalsProps) {
  return (
    <Panel icon={Bell} title={title}>
      <div className="space-y-3">
        {rows.length === 0 && <p className="text-sm text-[var(--c-muted)]">لا توجد طلبات معلقة.</p>}
        {rows.map((row) => {
          const perm = row as PermissionRow
          const leave = row as LeaveRow
          return (
            <div
              key={row.id}
              className="rounded-xl border border-[var(--c-line-soft)] bg-[var(--c-panel-soft)] p-4 flex items-start justify-between gap-3 flex-wrap"
            >
              <div className="space-y-1 min-w-0">
                <strong className="block text-sm font-semibold text-[var(--c-ink)]">
                  {row.employees?.name || `موظف #${row.employee_id}`}
                </strong>
                <span className="block text-xs text-[var(--c-muted)]" dir="ltr">
                  {type === "permission"
                    ? `${perm.perm_date} · ${perm.hours_requested || perm.hours} ساعة`
                    : `${leave.from_date} → ${leave.to_date}`}
                </span>
                {type === "leave" && leave.cover?.name && (
                  <span className="block text-xs text-[var(--c-muted)]">Cover: {leave.cover.name}</span>
                )}
                <p className="text-sm text-[var(--c-ink)]">{row.reason || "بدون سبب"}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {!canApprove && <StatusBadge status="pending" />}
                {!canApprove && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--c-page)] text-[var(--c-muted)]">
                    قرار Owner فقط
                  </span>
                )}
                {canApprove && type === "permission" && onPermission && (
                  <>
                    <button className={approveBtn} onClick={() => onPermission(row.id, true, 1)}>
                      موافقة ساعة
                    </button>
                    <button className={approveBtn} onClick={() => onPermission(row.id, true, 2)}>
                      موافقة ساعتين
                    </button>
                    <button className={dangerLink} onClick={() => onPermission(row.id, false, null)}>
                      رفض
                    </button>
                  </>
                )}
                {canApprove && type === "leave" && onLeave && (
                  <>
                    <button className={approveBtn} onClick={() => onLeave(row.id, true)}>
                      موافقة
                    </button>
                    <button className={dangerLink} onClick={() => onLeave(row.id, false)}>
                      رفض
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

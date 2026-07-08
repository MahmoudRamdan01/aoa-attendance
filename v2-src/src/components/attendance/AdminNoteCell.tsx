import { useEffect, useState } from "react"
import { MessageSquare } from "lucide-react"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import type { AttendanceRow, RpcResult } from "@/types/attendance"

interface AdminNoteCellProps {
  empId: number
  rec: AttendanceRow | undefined
  reportDate: string
  onSaved: () => void
}

export default function AdminNoteCell({ empId, rec, reportDate, onSaved }: AdminNoteCellProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(rec?.hr_note || "")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setValue(rec?.hr_note || "")
    setEditing(false)
  }, [rec?.hr_note, reportDate, empId])

  async function save() {
    setBusy(true)
    const { data, error } = await supabase.rpc("set_attendance_note_v1", {
      p_employee_id: empId,
      p_date: reportDate,
      p_note: value.trim() || null,
    })
    setBusy(false)
    const result = data as RpcResult | null
    if (error || result?.error) {
      toast.error(result?.message || "تعذر حفظ الملاحظة.")
      return
    }
    toast.success("تم حفظ الملاحظة.")
    setEditing(false)
    onSaved()
  }

  return (
    <div className="min-w-[180px] space-y-1">
      {rec?.employee_note && (
        <p className="flex items-center gap-1 text-xs text-[var(--c-muted)]" title="ملاحظة الموظف">
          <MessageSquare className="w-3 h-3 flex-shrink-0" /> {rec.employee_note}
        </p>
      )}
      {editing ? (
        <div className="flex items-center gap-1.5">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="ملاحظة الإدارة (مثال: تأخير)"
            maxLength={280}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") save()
              if (e.key === "Escape") {
                setValue(rec?.hr_note || "")
                setEditing(false)
              }
            }}
            className="w-full h-8 px-2 rounded-md border border-[var(--c-line)] bg-[var(--c-panel)] text-xs text-[var(--c-ink)] focus:outline-none focus:border-[#FCC10E]"
          />
          <button
            className="text-xs font-medium text-[var(--c-amber)] hover:underline disabled:opacity-50"
            onClick={save}
            disabled={busy}
          >
            {busy ? "..." : "حفظ"}
          </button>
          <button
            className="text-xs text-[var(--c-faint)] hover:underline"
            onClick={() => {
              setValue(rec?.hr_note || "")
              setEditing(false)
            }}
          >
            إلغاء
          </button>
        </div>
      ) : (
        <button
          className="text-right text-xs text-[var(--c-ink)] hover:bg-[var(--c-page)] rounded-md px-2 py-1 -mx-2 transition-colors w-full"
          onClick={() => setEditing(true)}
          title="اكتب ملاحظة للإدارة"
        >
          {rec?.hr_note ? rec.hr_note : <span className="text-[var(--c-faint)]">+ ملاحظة</span>}
        </button>
      )}
    </div>
  )
}

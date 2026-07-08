import { FlaskConical } from "lucide-react"

/** Marks a card/section whose data is still mock (no real backing table yet). */
export default function DemoBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--c-page)] text-[var(--c-faint)] border border-dashed border-[var(--c-faint2)] whitespace-nowrap">
      <FlaskConical className="w-3 h-3" />
      بيانات تجريبية
    </span>
  )
}

import { statusLabels } from "@/lib/attendance"

const statusColors: Record<string, string> = {
  present: "bg-[var(--c-green-bg)] text-[var(--c-green)]",
  approved: "bg-[var(--c-green-bg)] text-[var(--c-green)]",
  late: "bg-[var(--c-orange-bg)] text-[var(--c-orange)]",
  pending: "bg-[var(--c-amber-bg)] text-[var(--c-amber)]",
  absent: "bg-[var(--c-red-bg)] text-[var(--c-red)]",
  rejected: "bg-[var(--c-red-bg)] text-[var(--c-red)]",
  leave: "bg-[var(--c-violet-bg)] text-[var(--c-violet)]",
  mission: "bg-[var(--c-violet-bg)] text-[var(--c-violet)]",
  sick: "bg-[var(--c-violet-bg)] text-[var(--c-violet)]",
}

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${
        statusColors[status] || "bg-[var(--c-page)] text-[var(--c-muted)]"
      }`}
    >
      {statusLabels[status] || status}
    </span>
  )
}

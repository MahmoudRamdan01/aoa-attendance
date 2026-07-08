const toneColors: Record<string, string> = {
  default: "var(--c-green)",
  warn: "var(--c-orange)",
  danger: "var(--c-red)",
}

interface MeterBarProps {
  label: string
  value: number
  max: number
  tone?: "default" | "warn" | "danger"
}

export default function MeterBar({ label, value, max, tone = "default" }: MeterBarProps) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-sm text-[var(--c-muted)] w-24 flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-[var(--c-page)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-400"
          style={{ width: `${pct}%`, backgroundColor: toneColors[tone] }}
        />
      </div>
      <strong className="text-sm font-semibold text-[var(--c-ink)] w-10 text-left" dir="ltr">
        {pct}%
      </strong>
    </div>
  )
}

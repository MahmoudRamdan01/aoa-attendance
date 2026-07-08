import { useEffect, useState } from "react"

export type KpiTone = "default" | "ok" | "warn" | "danger" | "info" | "gold"

const tones: Record<KpiTone, { bg: string; color: string }> = {
  default: { bg: "var(--c-amber-bg)", color: "var(--c-amber)" },
  ok: { bg: "var(--c-green-bg)", color: "var(--c-green)" },
  warn: { bg: "var(--c-orange-bg)", color: "var(--c-orange)" },
  danger: { bg: "var(--c-red-bg)", color: "var(--c-red)" },
  info: { bg: "var(--c-violet-bg)", color: "var(--c-violet)" },
  gold: { bg: "var(--c-orange-bg2)", color: "var(--c-gold)" },
}

interface KpiTileProps {
  label: string
  value: string | number
  sub?: string
  tone?: KpiTone
  icon?: React.ElementType
  index?: number
}

export default function KpiTile({ label, value, sub, tone = "default", icon: Icon, index = 0 }: KpiTileProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), index * 100)
    return () => clearTimeout(t)
  }, [index])

  const toneStyle = tones[tone]

  return (
    <div
      className={`bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)] transition-all duration-400 hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5 ${
        mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
      }`}
    >
      <div className="flex items-start justify-between mb-3 gap-2">
        <span className="text-[11px] font-medium text-[var(--c-muted)] uppercase tracking-wider">
          {label}
        </span>
        {Icon && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: toneStyle.bg }}
          >
            <Icon className="w-4 h-4" style={{ color: toneStyle.color }} />
          </div>
        )}
      </div>
      <div className="text-[28px] font-bold text-[var(--c-ink)] leading-tight mb-1">{value}</div>
      {sub && <div className="text-sm text-[var(--c-muted)]">{sub}</div>}
    </div>
  )
}

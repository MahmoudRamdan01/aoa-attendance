import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { panelCls } from "./styles"

interface PanelProps {
  icon?: React.ElementType
  title?: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export default function Panel({ icon: Icon, title, subtitle, actions, children, className }: PanelProps) {
  return (
    <section className={cn(panelCls, className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="w-5 h-5 text-[var(--c-amber)]" />}
            <div>
              <h2 className="text-base font-semibold text-[var(--c-ink)]">{title}</h2>
              {subtitle && <p className="text-xs text-[var(--c-muted)] mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

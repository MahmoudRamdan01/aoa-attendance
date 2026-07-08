// Shared Tailwind class strings for the attendance pages so every ported view
// speaks the same design language as the dashboard pages.

export const panelCls =
  "bg-[var(--c-panel)] rounded-xl p-5 shadow-[var(--shadow-card)]"

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-[10px] bg-[#FCC10E] hover:bg-[#e5ad0d] text-[#383737] text-sm font-semibold transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"

export const btnSecondary =
  "inline-flex items-center justify-center gap-2 h-9 px-3 rounded-lg bg-[var(--c-panel)] border border-[var(--c-line)] text-sm text-[var(--c-ink)] hover:bg-[var(--c-panel-soft)] transition-colors disabled:opacity-50 disabled:pointer-events-none"

export const btnWarning =
  "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-[var(--c-orange-bg2)] border border-dashed border-[var(--c-orange-40)] text-sm text-[var(--c-orange)] font-medium hover:bg-[var(--c-orange-bg)] transition-colors disabled:opacity-50 disabled:pointer-events-none"

export const dangerLink = "text-[var(--c-red)] text-sm font-medium hover:underline"

export const inputCls =
  "w-full h-[42px] px-3 rounded-lg border border-[var(--c-line)] bg-[var(--c-panel)] text-sm text-[var(--c-ink)] placeholder:text-[var(--c-faint)] focus:outline-none focus:border-[#FCC10E] focus:ring-2 focus:ring-[#FCC10E]/10 transition-colors"

export const selectCls = inputCls + " appearance-none cursor-pointer"

export const textareaCls =
  "w-full min-h-[96px] px-3 py-2 rounded-lg border border-[var(--c-line)] bg-[var(--c-panel)] text-sm text-[var(--c-ink)] placeholder:text-[var(--c-faint)] focus:outline-none focus:border-[#FCC10E] focus:ring-2 focus:ring-[#FCC10E]/10 transition-colors resize-y"

export const labelCls = "block text-[13px] font-semibold text-[var(--c-ink)] space-y-1.5"

export const thCls =
  "text-right text-xs font-medium text-[var(--c-muted)] uppercase tracking-wider py-3 px-4 whitespace-nowrap"

export const tdCls = "py-3 px-4 text-sm text-[var(--c-ink)]"

export const trCls = "border-b border-[var(--c-line-soft)] hover:bg-[var(--c-panel-soft)] transition-colors"

export const mutedText = "text-sm text-[var(--c-muted)]"

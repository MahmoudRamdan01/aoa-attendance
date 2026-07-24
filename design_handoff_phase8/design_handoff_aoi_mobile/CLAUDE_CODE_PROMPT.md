# Paste this into Claude Code (repo root of aoa-attendance)

You are implementing a production mobile redesign of the AOI attendance PWA (`v1-src/`, Vite + React, Arabic RTL). A complete handoff package sits in `design_handoff_aoi_mobile/` — read ALL of it before writing code, in this order:

1. `README.md` — constraints (security logic untouched, light theme + airocean brand must keep working, no SQL except one optional realtime publication)
2. `01-theme-tokens.md` — exact token diffs for `v1-src/src/styles/tokens.css`
3. `02-screens-spec.md` — per-screen measurements and copy
4. `03-components-code.md` — reference JSX (adapt to codebase patterns)
5. `05-login-spec.md` (Phase 7) and `06-hybrid-map-spec.md` (Phase 8 — APPROVED final layout for اليوم; it supersedes parts of `02 §B`, read it before building Today)
6. `04-phases-and-acceptance.md` — 8 phases; work phase-by-phase
6. `reference/*.png` — visual truth; `AOI Attendance Redesign.dc.html` is the prototype source (do not ship it)

Process:
- `git checkout -b redesign/mobile-v2`
- Before each phase: read the files you'll touch end-to-end (`AppShell.jsx`, `EmployeeToday.jsx`, `OwnerDashboard.jsx`, `MyMonthView.jsx`, `RequestsView.jsx`, `registry.js`, `App.jsx`, styles). Match existing code style (no TypeScript, no new deps, lucide icons, `cls()` helper, CSS files not CSS-in-JS).
- One commit per phase with the acceptance checklist from `04` in the commit body, checked.
- After each phase: `cd v1-src && npm run build` must pass; run it in the browser (`npm run dev`) and verify dark + light + `VITE_COMPANY=airocean`.
- CRITICAL: `employee_attendance_action_v2` call sites, GPS/face/offline-queue logic, consent flow, RLS assumptions — behavior byte-identical. UI only.
- If the spec conflicts with something you find in the code, stop and ask — do not improvise around security or payroll math.
- Do NOT publish to `../v1/` (build output) — that happens after review.

Deliverable: branch `redesign/mobile-v2` pushed, PR titled "Mobile redesign v2 — premium dark refresh (phases 1–6)" with before/after screenshots per screen.

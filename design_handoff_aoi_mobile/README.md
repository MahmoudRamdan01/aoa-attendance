# Handoff: AOI Attendance — Mobile Redesign (v1 → production)

**Target:** `v1-src/` (Vite + React + custom CSS tokens) in `MahmoudRamdan01/aoa-attendance`, deployed at aol-attendance.vercel.app.
**Branch:** create `redesign/mobile-v2`, one PR, review before merge.
**Decision level (per owner):** bold — implement the prototype as-is.

## About the design files
The bundled `AOI Attendance Redesign.dc.html` + `reference/*.png` are **HTML design references**, not production code. The task is to **recreate them inside the existing v1 React codebase** using its established patterns: `tokens.css` variables, `ui/primitives.jsx`, `lucide-react` icons, existing RPCs and RLS. Never copy the HTML runtime.

## Fidelity
**High-fidelity.** Colors, spacing, radii, type sizes and copy in the reference are final. Match them exactly (values are listed in `01-theme-tokens.md` and `02-screens-spec.md`).

## Hard constraints (senior calls — do not violate)
1. **No security-logic changes.** `employee_attendance_action_v2`, GPS sampling, face engine, offline queue, consent flow stay byte-identical in behavior. Only the UI around them changes.
2. **No breaking SQL.** Phase 5 adds ONE optional read-only RPC (`owner_pulse_v1`); everything else is frontend-only. The app must degrade gracefully if the RPC isn't deployed yet.
3. **Light theme must not break.** We restyle dark (primary); for every dark token changed, keep the light value working (see 01). Visual QA both themes.
4. **`data-company="airocean"` magenta variant must keep working** — never hardcode gold where `var(--gold)` / `var(--c)` exists.
5. **PWA behaviors stay:** pull-to-refresh, back-close for sheets, View Transitions, service-worker update flow, keep-mounted views.

## Files in this bundle
- `01-theme-tokens.md` — exact variable diffs for `v1-src/src/styles/tokens.css`
- `02-screens-spec.md` — per-screen layout/measurement spec
- `03-components-code.md` — reference JSX for the new components (adapt, don't paste blindly)
- `04-phases-and-acceptance.md` — 6 phases with acceptance criteria + test plan
- `CLAUDE_CODE_PROMPT.md` — paste this into Claude Code to start
- `AOI Attendance Redesign.dc.html` — interactive prototype source (reference only)
- `reference/` — screenshots of every screen/state

## Codebase orientation (verified against main@6cf3f7a)
- Shell/nav: `src/app/AppShell.jsx` (topbar, sidebar, bottom nav `MOBILE_PRIMARY`, more-sheet, inbox popover)
- Router: `src/app/router.js` (hash router, `useBackClose`, `useSheetDrag`)
- Registry: `src/app/registry.js` (views, sections, capabilities)
- Screens: `src/features/attendance/EmployeeToday.jsx`, `src/features/payroll/OwnerDashboard.jsx`, `src/features/myrecord/MyMonthView.jsx`, `src/features/requests/RequestsView.jsx`
- Styles: `src/styles/tokens.css` (variables), `shell.css` (chrome), `primitives.css`, `features.css`
- Payroll math: `src/lib/payroll.js` (`computePayroll`) — reuse for the payslip card, never re-implement.

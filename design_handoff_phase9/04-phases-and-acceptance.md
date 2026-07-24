# 04 — Phases, acceptance criteria, test plan

One branch `redesign/mobile-v2`; commit per phase (revertable); PR after Phase 6.

## Phase 1 — Theme foundation (tokens + chrome)
Apply `01-theme-tokens.md`; unify card radius 16px; accent-discipline pass on `shell.css`/`primitives.css`; list line-heights 1.6.
**Accept:** every screen renders in new palette, dark AND light, aol AND airocean (`VITE_COMPANY=airocean`); no layout breaks; contrast ≥ WCAG AA for text on surface (spot-check muted text).

## Phase 2 — App chrome (nav + header + offline)
Bottom nav 5 slots + role-aware tabs; mobile header (greeting/role chip/bell); OfflineBanner in shell.
**Accept:** all roles get correct tabs; more-sheet still lists the rest; back-close & sheet drag intact; airplane-mode shows banner, queued count accurate, tap syncs.

## Phase 3 — اليوم + الحلقة
CheckInRing integration; error-into-ring mapping; location chip; QR collapsed; security card copy.
**Accept:** full happy path (GPS-only mode AND face mode) on a real phone; every `ERROR_MESSAGES` code renders in the ring with working retry; offline check-in queues + banner updates; `dayLocked`/checkout-window states correct; consent dialog unchanged; NO change to RPC args.

## Phase 4 — سجلي + طلباتي + كشف راتبي
Summary chips, day list restyle, PayslipCard; requests segmented + cards + FAB.
**Accept:** payslip equals OwnerDashboard's row for the same employee/month (same `computePayroll` — assert in a unit test); payslip hidden when salary not readable; day statuses/chips match data; create-request flow unchanged.

## Phase 5 — Owner dashboard + pulse (realtime)
Pulse strip (`useTodayPulse`), entry card, hero, KPI 2×2 (rest → collapsible), chart restyle, payroll cards <640px (table ≥640px), lates, skeletons.
**Accept:** numbers reconcile with old dashboard for the same period (screenshot diff both, same data); a second device checking in updates the pulse without refresh; CSV exports byte-identical to before; realtime unsubscribes on unmount (no channel leak on tab switches).

## Phase 6 — Approvals inbox
`inbox` view + registry + loaders; shared `lib/approvals.js`; entry cards + badge counts.
**Accept:** approve/reject fires the same RPCs as AdminDashboard (network tab diff); optimistic UI + rollback on forced error; count consistent across entry card, badge, list; employee cannot reach `inbox` (capability guard).

## Phase 7 — Login screen
Restyle `LoginScreen` per `05-login-spec.md` (waves, glass card, sheen button, face-login shortcut behind a flag). Auth logic + error mapping byte-identical.
**Accept:** criteria listed in `05-login-spec.md`.

## Phase 8 — Hybrid map direction (APPROVED — supersedes parts of Phase 3)
Implement `06-hybrid-map-spec.md`: map card on اليوم (real fix, geofence circle, gold pin, state chip), ring below the map, removed location chip / security card / shortcuts grid / requests FAB, requests type grid, circular payroll avatars + chevron.
**Accept:** criteria in `06-hybrid-map-spec.md`. If Phase 3 already shipped the ring-only layout, this is a follow-up commit — do not revert Phase 3, extend it.

## Phase 9 — Desktop workspace (owner/HR)
Implement `07-desktop-spec.md`: sidebar+topbar shell at ≥1024px, the four content patterns, all views incl. the shared FinanceWorkspace, and the employee drawer (كشف حساب) bound to EmployeeStatement's real data + admin correction.
**Accept:** criteria in `07-desktop-spec.md`.

## Regression suite (run at every phase)
1. `npm run build` clean; bundle diff — no unexpected new deps (design uses only existing ones).
2. Roles matrix: employee / hr / owner / owner-with-employee-record.
3. PWA: install, pull-to-refresh, hardware back closes sheets, SW update reload.
4. Light theme + airocean brand smoke pass.
5. `lib/attendanceWindow.test.js` still passes; add tests for payslip parity + pulse reducer.

## Rollout
Deploy branch preview (Vercel preview URL) → owner reviews on his phone → merge. Post-merge: watch first workday check-ins (08:00–11:00) before closing.

## Explicitly OUT of scope now
Light-theme redesign (only must-not-break), desktop owner command center (separate handoff), AdminDashboard/finance views beyond token retheme, any SQL beyond the optional realtime publication line.

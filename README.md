# Air Ocean Line Attendance

Static Supabase-powered attendance app.

## Live

- App: https://mahmoudramdan01.github.io/aoa-attendance/
- v1 Preview: https://mahmoudramdan01.github.io/aoa-attendance/v1/
- Repository: https://github.com/MahmoudRamdan01/aoa-attendance

## Current Version

- UI: `v0.9`
- Main file: `index.html`
- Database schema: `supabase-schema.sql`

## v1

- React app (Auth + GPS/QR + notifications).
- **Source:** `v1-src/` (Vite + React). **Built output:** `v1/` (served by GitHub Pages at `/v1/`).
- Database migration: `v1/supabase-v1-migration.sql`
- Run the v1 migration in Supabase SQL Editor before using employee login, GPS/QR attendance, notifications, account linking, and v1 reports.

### Rebuilding v1

```bash
cd v1-src
npm install            # deps include Tailwind CSS + Recharts (KPI dashboard UI)
npm run build          # outputs to v1-src/dist/
# publish as an overlay; keep old hashed assets for stale clients:
cp -r dist/. ../v1/
```

The UI follows the AOI brand (yellow `#FCC107` + charcoal, logo in `assets/`) with a
light/dark theme toggle persisted per device (`localStorage['aol-theme']`).

Source maps are intentionally disabled in `vite.config.js` so the bundle isn't re-exposed in production. Server-side rules (RLS + the RPC functions in the SQL files) remain the real security boundary for both v0.9 and v1.

## v2 (HR Dashboard + Attendance)

- Full HR dashboard (Executive/Departments/Employees/Recruitment/Workforce/KPI/Scorecard/Rewards/Reports) merged with the real v1 attendance system (Supabase auth + GPS/QR check-in + requests + notifications + owner payroll).
- **Live:** https://mahmoudramdan01.github.io/aoa-attendance/v2/
- **Source:** `v2-src/` (Vite + React 19 + TS + Tailwind + shadcn/ui). **Built output:** `v2/`.
- Role-gated: owner/hr see all dashboards; employees see only their attendance portal. Dashboards without backing tables yet show a "بيانات تجريبية" badge (hybrid data phase 1).
- Light/dark theme persisted via `localStorage['aol-theme']` (same key as v1). Uses HashRouter (`/v2/#/...`) so GitHub Pages refreshes work.
- Uses the same Supabase project, RPCs and RLS as v1 — no schema changes required.

### Rebuilding v2

```bash
cd v2-src
npm install
npm run build        # outputs to v2-src/dist/
cp -r dist/. ../v2/  # publish
```

## Database setup / run order

Run these in Supabase SQL Editor **in order** (all are idempotent, safe to re-run):

1. `supabase-schema.sql` — base schema + v0.9 functions (now includes PIN brute-force lockout via `pin_attempts` / `_verify_emp_pin`).
2. `v1/supabase-v1-migration.sql` — v1 tables/functions, GPS-accuracy check, `mark_absentees_v1`.
3. `v1/supabase-v1-patch-owner-payroll-qr.sql` — owner-only approvals + QR broadcast (HR-gated).
4. `v1/supabase-v1-hardening.sql` — least-privilege revokes + optional `pg_cron` jobs for auto-absence / missing-checkout.
5. `v1/supabase-v1-schedules-notes.sql` — per-employee check-in/out windows (global check-in `08:00–11:00`, check-out `16:30–20:00`; عبدالرحمن checks in `14:00–16:00`), employee/HR notes on the daily record (`attendance.employee_note` / `attendance.hr_note`), and `set_attendance_note_v1`. Window enforcement + the note are added to `employee_attendance_action_v1` (new `p_note` arg), and `mark_absentees_v1` now respects each employee's window.
6. `v1/supabase-financial-migration.sql` — financial modules: employee loans + installments, canteen, other deductions, company expenses (owner-confirmed), Air Ocean partner ledger with owner-confirmed settlements, owner personal ledger. RLS keeps loans + owner ledger hidden from HR.
7. `v1/supabase-v1-ops-update.sql` — company GPS fix (real coords + 1000m radius), attendance windows (global 08–11 / 16–19, per-employee overrides), `employees.attendance_exempt` payroll-only flag, salary updates, one-time deduction reset, `notify_team()` + auto team notifications (late arrivals, approved leaves) + notifications realtime publication.
8. `v1/supabase-v1-exempt-guard.sql` — exempt employees are blocked from check-in/out and never auto-marked absent.
9. `v1/supabase-v1-assistant.sql` — AI assistant config + logs tables (insert the LLM API key manually — never commit it). The agent itself is the `assistant` Supabase Edge Function (source in `v1/assistant-function/index.ts`), called from the "المساعد الذكي" section with the user's JWT so RLS/RPC guards cap what it can do.
10. `v1/supabase-v1-face-security.sql` — private captures, trusted devices, face profiles, risk checks, and `employee_attendance_action_v2`. It starts with `face_mode=off` for a safe rollout.
11. `v1/supabase-v1-security-hardening.sql` — apply only after all clients have adopted v2 and the staged face rollout is stable.
12. `v1/supabase-v1-checkout-window-hardening.sql` — final checkout guard for both v1/v2 RPCs: rejects before `checkout_from` and after `checkout_to`, fails closed on incomplete schedules, and serializes concurrent attendance actions.

### ⚠️ Rotate all PINs (mandatory)

The old seed PINs were previously committed in the client and are considered compromised. After running the schema, rotate every PIN using `v1/rotate-pins.sql` (fill in new secret PINs, run it, distribute in person). Fresh installs seed a random temporary PIN per employee — you must rotate to known values before the kiosk is usable. **Never commit real PINs or salaries.**

## Supabase

The app currently points to:

- URL: `https://gdgrdwjlxcavogztvxon.supabase.co`
- Project ref: `gdgrdwjlxcavogztvxon`

For a fresh database, run `supabase-schema.sql` in Supabase SQL Editor, then add Owner/HR users to `app_admins`.

`admin-fix.sql` links `mahmoud01@airocean.com` as `owner` in the current project.

## Deploy

This app has no build step. Any static host can serve the folder root:

- Entry file: `index.html`
- Build command: none
- Output directory: `.`

GitHub Pages is already configured from the `main` branch root.

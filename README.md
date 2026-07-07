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
npm install
npm run build          # outputs to v1-src/dist/
# then publish the build:
cp dist/index.html ../v1/index.html
cp dist/assets/*.js dist/assets/*.css ../v1/assets/
cp dist/icon.svg dist/manifest.webmanifest dist/sw.js ../v1/
```

Source maps are intentionally disabled in `vite.config.js` so the bundle isn't re-exposed in production. Server-side rules (RLS + the RPC functions in the SQL files) remain the real security boundary for both v0.9 and v1.

## Database setup / run order

Run these in Supabase SQL Editor **in order** (all are idempotent, safe to re-run):

1. `supabase-schema.sql` — base schema + v0.9 functions (now includes PIN brute-force lockout via `pin_attempts` / `_verify_emp_pin`).
2. `v1/supabase-v1-migration.sql` — v1 tables/functions, GPS-accuracy check, `mark_absentees_v1`.
3. `v1/supabase-v1-patch-owner-payroll-qr.sql` — owner-only approvals + QR broadcast (HR-gated).
4. `v1/supabase-v1-hardening.sql` — least-privilege revokes + optional `pg_cron` jobs for auto-absence / missing-checkout.
5. `v1/supabase-v1-schedules-notes.sql` — per-employee check-in/out windows (global check-in `08:00–11:00`, check-out `16:30–20:00`; عبدالرحمن checks in `14:00–16:00`), employee/HR notes on the daily record (`attendance.employee_note` / `attendance.hr_note`), and `set_attendance_note_v1`. Window enforcement + the note are added to `employee_attendance_action_v1` (new `p_note` arg), and `mark_absentees_v1` now respects each employee's window.

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

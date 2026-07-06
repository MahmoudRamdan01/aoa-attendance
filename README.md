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

- Static build: `v1/` (React app, Auth + GPS/QR + notifications).
- Database migration: `v1/supabase-v1-migration.sql`
- Run the v1 migration in Supabase SQL Editor before using employee login, GPS/QR attendance, notifications, account linking, and v1 reports.

> ⚠️ **v1 source is not in this repo.** `v1/assets/*.js` is a compiled Vite bundle only — there is no `package.json`/`src/`, so v1 cannot currently be rebuilt or edited from this repo. Either commit the original React source, or treat the bundle as the source of truth. Server-side rules (RLS + the RPC functions in the SQL files) are the real security boundary for both v0.9 and v1, so most hardening lives in SQL.

## Database setup / run order

Run these in Supabase SQL Editor **in order** (all are idempotent, safe to re-run):

1. `supabase-schema.sql` — base schema + v0.9 functions (now includes PIN brute-force lockout via `pin_attempts` / `_verify_emp_pin`).
2. `v1/supabase-v1-migration.sql` — v1 tables/functions, GPS-accuracy check, `mark_absentees_v1`.
3. `v1/supabase-v1-patch-owner-payroll-qr.sql` — owner-only approvals + QR broadcast (HR-gated).
4. `v1/supabase-v1-hardening.sql` — least-privilege revokes + optional `pg_cron` jobs for auto-absence / missing-checkout.

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

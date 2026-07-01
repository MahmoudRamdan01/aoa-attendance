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

- Static build: `v1/`
- Database migration: `v1/supabase-v1-migration.sql`
- Run the v1 migration in Supabase SQL Editor before using employee login, GPS/QR attendance, notifications, account linking, and v1 reports.

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

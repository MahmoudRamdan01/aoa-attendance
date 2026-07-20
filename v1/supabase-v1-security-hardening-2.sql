-- =====================================================================
-- Security hardening (audit round 2) — applied live to BOTH projects
-- gdgrdwjlxcavogztvxon (primary) + hubuvdwhqxuizkyeedab (Air Ocean), 2026-07-20
-- ---------------------------------------------------------------------
-- Findings from a full audit (frontend sweep + RLS/grant review + Supabase
-- security advisors). The core model was sound (RLS on all tables, guarded
-- *_v1/_v2 RPCs, no XSS), but three server issues were fixed:
--
-- S1 [HIGH, Air Ocean only]: the schema-clone migration blanket-granted
--     EXECUTE to `authenticated` on every function, which re-opened internal /
--     legacy helpers that carry NO authorization guard and had been revoked on
--     the primary project — decide_leave / decide_permission (raw approve — an
--     employee could approve their own request!), set_employee_pin (reset any
--     colleague's PIN), do_checkin/out + request_leave/permission (PIN kiosk
--     path), notify_* (spoof a notification to the owner). Restored to
--     service_role/postgres only, matching the primary project. anon was never
--     able to reach them. The client uses only the guarded *_v1 variants.
--
-- S2 [MEDIUM, both]: kiosk_employees (SECURITY DEFINER view, minimal
--     id/name/active projection) was readable by anon → the active-employee
--     roster leaked to anyone holding the public anon key, pre-login. It is
--     legitimately used by signed-in employees to pick a cover colleague
--     (RequestsView), so authenticated access is kept and only anon revoked.
--
-- S3 [LOW, both]: request_submitted_stamp_v1 had a mutable search_path → pinned.
--
-- Not fixed here (owner action): enable leaked-password protection
-- (Auth → Providers → Passwords → HaveIBeenPwned) — an Auth config toggle.
-- =====================================================================

-- ---- S1: relock internal/legacy functions (run on Air Ocean; no-op-safe on
--         the primary where they are already locked) ---------------------
do $lock$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and p.proname in (
        '_verify_emp_pin','decide_leave','decide_permission','do_checkin','do_checkout',
        'ensure_daily_qr','kb_chunks_biu','notify_admins','notify_admins_approval','notify_owners',
        'notify_team','notify_user','push_notify_trigger','request_leave','request_permission',
        'send_daily_late_report','set_employee_pin','touch_updated_at','trg_notify_late',
        'trg_notify_leave_approved','trg_notify_request_submitted')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $lock$;

-- ---- S2: stop the roster leaking to the public anon key (keep authenticated
--         for the leave cover-picker) --------------------------------------
revoke select on public.kiosk_employees from anon;

-- ---- S3: pin the trigger stamp function's search_path -------------------
do $sp$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname='public' and p.proname='request_submitted_stamp_v1'
  loop
    execute format('alter function %s set search_path = public', r.sig);
  end loop;
end $sp$;

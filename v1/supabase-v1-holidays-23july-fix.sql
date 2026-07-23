-- 23 July 2026 (عيد ثورة 23 يوليو) — official holiday correction.
-- APPLIED LIVE on BOTH projects (gdgrdwjlxcavogztvxon + hubuvdwhqxuizkyeedab)
-- on 2026-07-23.
--
-- What happened: official_holidays was empty on both systems, so the daily
-- mark-absentees cron (12:00 Cairo) treated the holiday as a working day and
-- recorded "غياب بدون إذن" for the whole team (9 rows on the main system,
-- 42 on Air Ocean incl. repeat-offence penalty days), plus employee/admin
-- notifications. mark_absentees_v1 itself already skips dates present in
-- official_holidays — the table just had no rows. No function change needed.

-- 1) Seed the fixed-date national holidays we are sure of.
insert into official_holidays (holiday_date, label)
values
  ('2026-07-23', 'عيد ثورة 23 يوليو'),
  ('2026-10-06', 'عيد القوات المسلحة (6 أكتوبر)')
on conflict (holiday_date) do nothing;

-- 2) Remove the wrong auto-recorded absences for the holiday
--    (real employee_app check-ins from that day are kept).
delete from attendance
where work_date = '2026-07-23'
  and source = 'auto'
  and status = 'absent'
  and check_in is null;

-- 3) Remove the notifications that run produced.
delete from notifications
where title in ('غياب بدون إذن', 'تحقيق إداري — غياب متكرر')
  and created_at >= '2026-07-23 08:00:00+00';

-- 4) Leave a trace.
insert into audit_log (actor, action, entity, entity_id, details)
values (null, 'holiday_correction', 'attendance', '2026-07-23',
        jsonb_build_object('reason', 'official holiday 23 July was missing; auto absences removed'));

-- NOTE (movable holidays): Islamic holidays (عيد الفطر، عيد الأضحى، المولد،
-- رأس السنة الهجرية…) shift every year — they must be added here (or via a
-- future admin UI) before each occurrence, since the absence cron only skips
-- dates present in official_holidays.

-- =====================================================================
--  Air Ocean Line — v1 ops update (2026-07-10)
--  1) Fix company GPS location (was ~6.2km off!) + radius 1000m
--  2) Attendance windows: global checkout 16:00–19:00;
--     عبدالرحمن in from 13:00, out from 18:00; حبيبة in 12–13, out 17–19
--  3) attendance_exempt flag: payroll-only employees (عمر + محمود + ناصر)
--  4) Salaries: روان 4000, محمود 20000, ناصر 400
--  5) Zero all deductions for حبيبة/عبدالرحمن/سهيلة (absents → excused leave)
--  6) notify_team() + auto team-wide notifications (late arrivals, approved
--     leaves) + notifications added to the realtime publication
--  Safe to re-run EXCEPT section 5 (one-time data correction, guarded).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Company location — real coordinates from Google Maps place
--    (اير اوشن لاين، ٦ ميساني، العطارين، الإسكندرية) + 1000m radius.
-- ---------------------------------------------------------------------
update company_locations
set lat = 31.2272073, lng = 29.9597824, radius_m = 1000
where id = 1;

-- ---------------------------------------------------------------------
-- 2) Attendance windows
-- ---------------------------------------------------------------------
update settings set value='"08:00"' where key='checkin_from';
update settings set value='"11:00"' where key='checkin_to';
update settings set value='"16:00"' where key='checkout_from';
update settings set value='"19:00"' where key='checkout_to';

-- عبدالرحمن (10): check-in opens 13:00 (to 16:00), check-out 18:00–21:00
update employees set checkin_from='13:00', checkin_to='16:00',
                     checkout_from='18:00', checkout_to='21:00'
where id = 10;

-- حبيبة (9): check-in 12:00–13:00, check-out 17:00–19:00
update employees set checkin_from='12:00', checkin_to='13:00',
                     checkout_from='17:00', checkout_to='19:00'
where id = 9;

-- ---------------------------------------------------------------------
-- 3) Payroll-only employees (exempt from attendance)
-- ---------------------------------------------------------------------
alter table employees add column if not exists attendance_exempt boolean not null default false;

-- عمر (12): out of attendance, stays in payroll
update employees set attendance_exempt = true where id = 12;

-- محمود + ناصر: payroll-only rows (created once, matched by name)
do $$
declare
  v_id bigint;
begin
  if not exists (select 1 from employees where name = 'محمود') then
    select coalesce(max(id),0) + 1 into v_id from employees;
    insert into employees(id, name, active, attendance_exempt, leave_balance)
    values (v_id, 'محمود', true, true, 0);
    insert into salaries(employee_id, monthly_salary) values (v_id, 20000)
    on conflict (employee_id) do update set monthly_salary = 20000;
  end if;
  if not exists (select 1 from employees where name = 'ناصر') then
    select coalesce(max(id),0) + 1 into v_id from employees;
    insert into employees(id, name, active, attendance_exempt, leave_balance)
    values (v_id, 'ناصر', true, true, 0);
    insert into salaries(employee_id, monthly_salary) values (v_id, 400)
    on conflict (employee_id) do update set monthly_salary = 400;
  end if;
end $$;

-- Exempt employees disappear from the kiosk / cover lists
create or replace view kiosk_employees as
select id, name, active from employees
where active and not attendance_exempt;

-- ---------------------------------------------------------------------
-- 4) Salary updates
-- ---------------------------------------------------------------------
insert into salaries(employee_id, monthly_salary) values (8, 4000)
on conflict (employee_id) do update set monthly_salary = 4000;   -- روان
update salaries set monthly_salary = 20000 where employee_id = (select id from employees where name='محمود');
update salaries set monthly_salary = 400   where employee_id = (select id from employees where name='ناصر');

-- ---------------------------------------------------------------------
-- 5) One-time: zero ALL deductions for حبيبة (9), عبدالرحمن (10), سهيلة (11).
--    Auto-absences become excused leave so payroll stops deducting for them.
-- ---------------------------------------------------------------------
update attendance
set status = 'leave',
    deduction_days = 0,
    note = coalesce(note,'') || ' · تحويل غياب لأجازة مبررة (تصفير خصومات بقرار الإدارة 2026-07-10)'
where employee_id in (9,10,11) and status = 'absent';

update attendance set deduction_days = 0
where employee_id in (9,10,11) and coalesce(deduction_days,0) > 0;

update late_arrival_counters
set late_count = 0, warning_count = 0, deduction_count = 0
where employee_id in (9,10,11);

-- ---------------------------------------------------------------------
-- 6) Team-wide notifications
-- ---------------------------------------------------------------------
create or replace function notify_team(p_title text, p_body text)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_group uuid := gen_random_uuid();
begin
  insert into notifications(user_id, title, body, category, priority, group_id)
  select u.user_id, p_title, p_body, 'system', 'high', v_group
  from (
    select user_id from employee_accounts where active
    union
    select user_id from app_admins
  ) u
  where u.user_id is not null;
end $$;
revoke execute on function notify_team(text,text) from public, anon, authenticated;

-- Late arrival → notify management only (HR + Owner). NOT the whole team:
-- peers must not see each other's lateness. The employee already gets their
-- own late notice from the check-in RPC. (See migration late_notify_admins_only.)
create or replace function trg_notify_late()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_name text;
begin
  if new.status = 'late' and new.check_in is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'late') then
    select name into v_name from employees where id = new.employee_id;
    perform notify_admins(
      'تأخير موظف',
      coalesce(v_name, 'موظف') || ' وصل متأخر ' || coalesce(new.late_minutes,0)::text || ' دقيقة النهارده.'
    );
  end if;
  return new;
end $$;

drop trigger if exists attendance_late_notify on attendance;
create trigger attendance_late_notify
after insert or update of status on attendance
for each row execute function trg_notify_late();

-- Approved leave → team knows who is off and when
create or replace function trg_notify_leave_approved()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_name text;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    select name into v_name from employees where id = new.employee_id;
    perform notify_team(
      'أجازة معتمدة',
      coalesce(v_name, 'موظف') || ' في أجازة من ' || new.from_date::text || ' إلى ' || new.to_date::text || '.'
    );
  end if;
  return new;
end $$;

drop trigger if exists leave_approved_notify on leave_requests;
create trigger leave_approved_notify
after update of status on leave_requests
for each row execute function trg_notify_leave_approved();

-- Realtime: push new notifications to connected clients (sound + badge)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;

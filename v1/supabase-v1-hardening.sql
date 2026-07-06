-- =====================================================================
--  Air Ocean Line — v1 Security Hardening (ops)  ·  run LAST
--  بعد supabase-schema.sql + supabase-v1-migration.sql (+ الـ patch).
--  آمن تعيد تشغيله. بيقفل الصلاحيات الزيادة، يظبط دوال الـ cron، ويجدولها.
--  ملاحظة: حماية الـ PIN brute-force (_verify_emp_pin/pin_attempts) في
--  supabase-schema.sql، وفحوصات الـ GPS/الأدوار في supabase-v1-migration.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Least-privilege على الجداول الحساسة (طبقة فوق الـ RLS).
-- ---------------------------------------------------------------------
revoke delete on salaries   from authenticated;
revoke delete on app_admins from authenticated;
revoke delete on employees  from authenticated;

-- ---------------------------------------------------------------------
-- 2) اقفل تنفيذ anon/authenticated على الدوال الداخلية البحتة.
--    Supabase بيمنح EXECUTE افتراضيًا لـ anon/authenticated على الدوال الجديدة،
--    ودي دوال SECURITY DEFINER مش المفروض تتنادى من REST مباشرةً.
--    (الـ callers شغّالين كـ owner فبيوصلوها عادي.)
-- ---------------------------------------------------------------------
revoke all on function _verify_emp_pin(bigint,text) from anon, authenticated;
-- mark_absentees_v1 بيسمح بنداء cron (auth.uid()=null)؛ من غير القفل ده anon يقدر
-- يعلّم كل الموظفين غياب. نسيب authenticated (الـ HR) بالحارس الداخلي.
revoke all on function mark_absentees_v1(date) from anon;

-- ---------------------------------------------------------------------
-- 3) mark_missing_checkouts_v1: نخليها تشتغل من الـ cron (null auth) وanon مقفول.
-- ---------------------------------------------------------------------
create or replace function mark_missing_checkouts_v1(p_date date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  r record;
  v_month text := to_char(p_date,'YYYY-MM');
  v_count int;
  v_processed int := 0;
  v_user uuid;
begin
  -- نداء بشري لازم يكون إدارة؛ نداء الـ cron بيشتغل بـ auth.uid()=null فبيعدّي.
  if auth.uid() is not null and not is_hr() then
    return jsonb_build_object('error','hr_only','message','للإدارة فقط.');
  end if;
  for r in
    select * from attendance
    where work_date=p_date and check_in is not null and check_out is null and status in ('present','late')
      and not exists (select 1 from missing_checkout_reviews m where m.attendance_id = attendance.id)
  loop
    insert into missing_checkout_counters(employee_id,work_month,warning_count)
    values (r.employee_id,v_month,1)
    on conflict (employee_id,work_month)
    do update set warning_count = missing_checkout_counters.warning_count + 1
    returning warning_count into v_count;

    select user_id into v_user from employee_accounts where employee_id = r.employee_id;

    if v_count <= 2 then
      perform notify_user(v_user,'تنبيه عدم تسجيل انصراف','دي المرة رقم ' || v_count::text || ' في الشهر.');
      insert into missing_checkout_reviews(attendance_id,employee_id,work_date,action,reviewed_by)
      values (r.id,r.employee_id,p_date,'warning',auth.uid())
      on conflict (attendance_id) do nothing;
    else
      update attendance
      set deduction_days = coalesce(deduction_days,0) + 0.25,
          note = coalesce(note || ' · ','') || 'خصم ربع يوم لعدم تسجيل الانصراف'
      where id = r.id;
      update missing_checkout_counters
      set deduction_count = deduction_count + 1
      where employee_id = r.employee_id and work_month = v_month;
      perform notify_user(v_user,'خصم عدم تسجيل انصراف','تم تطبيق خصم ربع يوم بعد تكرار عدم تسجيل الانصراف.');
      insert into missing_checkout_reviews(attendance_id,employee_id,work_date,action,reviewed_by)
      values (r.id,r.employee_id,p_date,'deduction',auth.uid())
      on conflict (attendance_id) do nothing;
    end if;
    v_processed := v_processed + 1;
  end loop;
  return jsonb_build_object('ok',true,'processed',v_processed);
end $$;
revoke all on function mark_missing_checkouts_v1(date) from anon;

-- ---------------------------------------------------------------------
-- 4) مهام دورية (pg_cron). المواعيد UTC. 09:00 UTC بعد قفل نافذة الحضور
--    (10:00 القاهرة) على مدار السنة، و19:00 UTC بعد نافذة الانصراف (20:00).
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.schedule('mark-absentees-daily', '0 9 * * *',
  $$ select public.mark_absentees_v1((now() at time zone 'Africa/Cairo')::date) $$);

select cron.schedule('mark-missing-checkouts-daily', '0 19 * * *',
  $$ select public.mark_missing_checkouts_v1((now() at time zone 'Africa/Cairo')::date) $$);

-- للإلغاء لاحقًا:
--   select cron.unschedule('mark-absentees-daily');
--   select cron.unschedule('mark-missing-checkouts-daily');

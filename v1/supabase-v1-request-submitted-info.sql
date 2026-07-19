-- =====================================================================
-- Request submission details in owner notifications
-- ---------------------------------------------------------------------
-- The "new request" notifications used to be generic («يوجد طلب أجازة جديد
-- يحتاج موافقة Owner»). They now carry: who submitted, the requested
-- date(s), and WHEN the request was submitted (weekday + date + time,
-- Cairo time) — e.g.:
--   طلب أجازة جديد — أحمد
--   تقدم أحمد بطلب أجازة من 2026-07-25 إلى 2026-07-26 (2 يوم).
--   قُدّم الطلب يوم السبت 2026-07-19 الساعة 08:45 م.
-- Validation, limits and inserts are unchanged from the v1 migration.
-- Run AFTER v1/supabase-v1-migration.sql.
-- =====================================================================

-- Cairo "now" formatted as «اليوم التاريخ الساعة HH:MM ص/م».
create or replace function request_submitted_stamp_v1()
returns text language sql stable as $$
  select (array['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'])
           [extract(dow from (now() at time zone 'Africa/Cairo'))::int + 1]
         || ' ' || to_char(now() at time zone 'Africa/Cairo', 'YYYY-MM-DD')
         || ' الساعة ' || to_char(now() at time zone 'Africa/Cairo', 'HH12:MI')
         || case when extract(hour from (now() at time zone 'Africa/Cairo')) < 12
                 then ' ص' else ' م' end;
$$;
revoke execute on function request_submitted_stamp_v1() from public, anon;
grant execute on function request_submitted_stamp_v1() to authenticated;

create or replace function request_permission_v1(p_date date, p_hours_requested numeric, p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_emp bigint := current_employee_id();
  v_limit int;
  v_count int;
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_name text;
begin
  if v_emp is null then return jsonb_build_object('error','no_employee','message','الحساب غير مربوط بموظف.'); end if;
  if p_hours_requested not in (1,2) then return jsonb_build_object('error','bad_hours','message','مدة الإذن ساعة أو ساعتين.'); end if;
  if p_date < v_today then return jsonb_build_object('error','past_date','message','لا يمكن طلب إذن لتاريخ سابق.'); end if;
  if coalesce(trim(p_reason),'') = '' then return jsonb_build_object('error','reason_required','message','يجب كتابة سبب الإذن.'); end if;

  select coalesce((select (value#>>'{}')::int from settings where key='monthly_permission_max'),3) into v_limit;
  select count(*) into v_count from permissions
  where employee_id=v_emp and status in ('pending','approved')
    and date_trunc('month',perm_date)=date_trunc('month',p_date);
  if v_count >= v_limit then return jsonb_build_object('error','limit','message','وصلت الحد الأقصى للأذونات الشهرية.'); end if;

  if exists (
    select 1 from permissions
    where employee_id=v_emp and status in ('pending','approved')
      and perm_date in (p_date - interval '1 day', p_date + interval '1 day')
  ) then
    return jsonb_build_object('error','consecutive','message','غير مسموح بإذنين في يومين متتاليين.');
  end if;

  insert into permissions(employee_id,perm_date,hours,hours_requested,reason,status,requested_by)
  values (v_emp,p_date,p_hours_requested,p_hours_requested,p_reason,'pending',auth.uid());

  select name into v_name from employees where id = v_emp;
  perform notify_owners(
    'طلب إذن جديد — ' || coalesce(v_name, 'موظف'),
    'تقدم ' || coalesce(v_name, 'موظف') || ' بطلب إذن ليوم ' || to_char(p_date,'YYYY-MM-DD')
      || ' لمدة ' || case when p_hours_requested = 1 then 'ساعة' else 'ساعتين' end
      || '. قُدّم الطلب يوم ' || request_submitted_stamp_v1() || '.');
  return jsonb_build_object('ok',true,'message','تم إرسال طلب الإذن.');
end $$;

create or replace function request_leave_v1(p_from date, p_to date, p_cover bigint, p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_emp bigint := current_employee_id();
  v_days int;
  v_used numeric;
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_balance numeric;
  v_name text;
begin
  if v_emp is null then return jsonb_build_object('error','no_employee','message','الحساب غير مربوط بموظف.'); end if;
  if p_from <= v_today then return jsonb_build_object('error','too_late','message','يجب طلب الأجازة قبلها بيوم على الأقل.'); end if;
  if p_to < p_from then return jsonb_build_object('error','bad_dates','message','تاريخ النهاية غير صحيح.'); end if;
  if p_cover is null or p_cover = v_emp then return jsonb_build_object('error','cover','message','يجب اختيار موظف بديل مختلف.'); end if;
  if coalesce(trim(p_reason),'') = '' then return jsonb_build_object('error','reason_required','message','يجب كتابة سبب الأجازة.'); end if;

  v_days := leave_work_days_v1(p_from,p_to);
  if v_days <= 0 then return jsonb_build_object('error','bad_days','message','الفترة لا تحتوي أيام عمل.'); end if;
  if v_days > 2 then return jsonb_build_object('error','max_days','message','الحد الأقصى يومين شهريًا.'); end if;

  if exists (
    select 1 from leave_requests
    where employee_id=v_emp and status in ('pending','approved')
      and (from_date in (p_from - interval '1 day', p_to + interval '1 day')
        or to_date in (p_from - interval '1 day', p_to + interval '1 day'))
  ) then
    return jsonb_build_object('error','consecutive','message','غير مسموح بأجازات متتالية.');
  end if;

  select coalesce(sum(days),0) into v_used from leave_requests
  where employee_id=v_emp and status in ('pending','approved')
    and date_trunc('month',from_date)=date_trunc('month',p_from);
  if v_used + v_days > 2 then return jsonb_build_object('error','monthly_limit','message','تجاوزت حد الأجازات الشهري.'); end if;

  select leave_balance into v_balance from employees where id=v_emp;
  if coalesce(v_balance,0) < v_days then return jsonb_build_object('error','balance','message','رصيد الأجازات غير كافٍ.'); end if;

  insert into leave_requests(employee_id,from_date,to_date,days,cover_employee_id,reason,status,requested_by)
  values (v_emp,p_from,p_to,v_days,p_cover,p_reason,'pending',auth.uid());

  select name into v_name from employees where id = v_emp;
  perform notify_owners(
    'طلب أجازة جديد — ' || coalesce(v_name, 'موظف'),
    'تقدم ' || coalesce(v_name, 'موظف') || ' بطلب أجازة من ' || to_char(p_from,'YYYY-MM-DD')
      || ' إلى ' || to_char(p_to,'YYYY-MM-DD') || ' (' || v_days || ' يوم)'
      || '. قُدّم الطلب يوم ' || request_submitted_stamp_v1() || '.');
  return jsonb_build_object('ok',true,'message','تم إرسال طلب الأجازة.');
end $$;

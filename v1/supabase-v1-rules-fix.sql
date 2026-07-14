-- ============================================================================
-- AOA v1 — Phase 1: attendance rules fix (2026-07-15)
-- 1) Wire settings.grace_mins into employee_attendance_action_v1 (was hardcoded 15)
-- 2) Early-exit rules on checkout: warning first, escalating deduction
--    (uses settings.checkout_grace_to which existed but was unused)
-- 3) Fix note-concat bug in mark_missing_checkouts_v1 (NULL note dropped prefix)
-- Base: live pg_get_functiondef dump taken 2026-07-15 (NOT repo files).
-- ============================================================================

-- ---------- schema additions --------------------------------------------------
create table if not exists early_exit_counters (
  employee_id bigint not null references employees(id) on delete cascade,
  work_month text not null,
  early_count int not null default 0,
  warning_count int not null default 0,
  deduction_count int not null default 0,
  primary key (employee_id, work_month)
);
alter table early_exit_counters enable row level security;
drop policy if exists early_exit_counters_hr on early_exit_counters;
create policy early_exit_counters_hr on early_exit_counters
  for all to authenticated using (is_hr()) with check (is_hr());

alter table attendance add column if not exists early_leave_minutes int;

insert into settings(key, value, note)
values ('early_exit_policy', '{"repeat_cut": 0.25}', 'خصم تكرار الانصراف المبكر (أول مرة إنذار)')
on conflict (key) do nothing;

-- ---------- main RPC: grace wiring + early exit -------------------------------
create or replace function public.employee_attendance_action_v1(
  p_kind text, p_lat numeric, p_lng numeric, p_accuracy integer,
  p_qr_code text, p_device_id text, p_note text default null::text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_emp bigint; v_name text;
  v_now timestamp := now() at time zone 'Africa/Cairo';
  v_date date; v_time time;
  v_location company_locations%rowtype; v_distance numeric; v_qr text;
  s_start time; s_absent time; s_win_from time; s_win_to time;
  v_min int; v_late int; v_tier jsonb; v_tiers jsonb;
  v_status text := 'pending'; v_label text := ''; v_cut numeric := 0;
  v_att attendance%rowtype; v_late_count int := 0; v_late_month text;
  v_note text := nullif(trim(coalesce(p_note,'')),'');
  v_grace int := coalesce((select (value#>>'{}')::int from settings where key='grace_mins'), 15);
  v_grace_out time; v_early_min int := 0; v_early_count int := 0;
  v_early_cut numeric := 0; v_early_label text;
begin
  v_date := v_now::date; v_time := v_now::time;
  select employee_id into v_emp from employee_accounts where user_id = auth.uid() and active;
  if v_emp is null then return jsonb_build_object('error','no_employee','message','الحساب غير مربوط بموظف.'); end if;
  select name into v_name from employees where id = v_emp;
  if (select attendance_exempt from employees where id = v_emp) then
    return jsonb_build_object('error','exempt','message','حسابك معفي من تسجيل الحضور والانصراف.'); end if;
  if p_lat is null or p_lng is null or p_accuracy is null
     or p_accuracy > coalesce((select (value#>>'{}')::int from settings where key='max_gps_accuracy_m'), 100) then
    return jsonb_build_object('error','low_accuracy','message','دقة تحديد الموقع ضعيفة. اتأكد إن الـ GPS شغّال وانت في مكان مكشوف وحاول تاني.'); end if;
  if extract(dow from v_date)::int = 5 or exists(select 1 from official_holidays where holiday_date = v_date) then
    return jsonb_build_object('error','holiday','message','اليوم أجازة رسمية أو راحة أسبوعية.'); end if;
  select * into v_location from company_locations where active order by id limit 1;
  if not found then return jsonb_build_object('error','no_location','message','موقع الشركة غير مضبوط.'); end if;
  v_distance := geo_distance_meters(p_lat,p_lng,v_location.lat,v_location.lng);
  if v_distance > v_location.radius_m then
    return jsonb_build_object('error','outside','message','أنت خارج نطاق الشركة. المسافة: ' || round(v_distance)::text || ' متر.'); end if;
  if coalesce((select (value#>>'{}')::boolean from settings where key='qr_required'), false) then
    v_qr := ensure_daily_qr(v_date);
    if upper(trim(coalesce(p_qr_code,''))) <> upper(v_qr) then
      return jsonb_build_object('error','bad_qr','message','كود QR غير صحيح.'); end if;
  else
    v_qr := nullif(upper(trim(coalesce(p_qr_code,''))), '');
  end if;
  select * into v_att from attendance where employee_id = v_emp and work_date = v_date;

  if p_kind = 'in' then
    if found and v_att.check_in is not null then
      return jsonb_build_object('error','already','message','سجلت حضورك بالفعل.'); end if;
    select coalesce(e.checkin_from, (select (value#>>'{}')::time from settings where key='checkin_from')),
           coalesce(e.checkin_to,   (select (value#>>'{}')::time from settings where key='checkin_to'))
      into s_win_from, s_win_to from employees e where e.id = v_emp;
    if s_win_from is not null and s_win_to is not null and (v_time < s_win_from or v_time > s_win_to) then
      return jsonb_build_object('error','window_closed','message',
        'نافذة تسجيل الحضور (' || to_char(s_win_from,'HH24:MI') || '–' || to_char(s_win_to,'HH24:MI') || ') مقفولة دلوقتي.'); end if;
    select (value#>>'{}')::time into s_start from settings where key='work_start';
    select (value#>>'{}')::time into s_absent from settings where key='absent_after';
    select value into v_tiers from settings where key='late_tiers';
    v_min := extract(hour from v_now)::int*60 + extract(minute from v_now)::int;
    v_late := greatest(0, v_min - (extract(hour from s_start)::int*60 + extract(minute from s_start)::int));
    v_late_month := to_char(v_date,'YYYY-MM');
    if v_time >= s_absent then
      v_status := 'pending'; v_label := 'بعد 10:00 · موافقة المدير'; v_cut := 0;
    else
      for v_tier in select * from jsonb_array_elements(v_tiers) loop
        if v_late <= (v_tier->>'upto')::int then
          v_status := v_tier->>'status'; v_label := v_tier->>'label'; v_cut := (v_tier->>'cut')::numeric; exit; end if;
      end loop;
    end if;
    if v_late > v_grace then
      insert into late_arrival_counters(employee_id,work_month,late_count,warning_count,deduction_count)
      values (v_emp,v_late_month,1,1,0)
      on conflict (employee_id,work_month) do update
        set late_count = late_arrival_counters.late_count + 1,
            warning_count = late_arrival_counters.warning_count + case when late_arrival_counters.late_count = 0 then 1 else 0 end,
            deduction_count = late_arrival_counters.deduction_count + case when late_arrival_counters.late_count >= 1 then 1 else 0 end
      returning late_count into v_late_count;
      if v_status <> 'pending' then v_status := 'late'; end if;
      if v_late_count = 1 then v_cut := 0; v_label := 'إنذار تأخير أول مرة بعد السماح';
      else v_cut := 0.25; v_label := 'خصم ربع يوم لتكرار التأخير'; end if;
    end if;
    insert into attendance(employee_id,work_date,check_in,status,late_minutes,deduction_days,source,approved,recorded_by,device_id,latitude,longitude,gps_accuracy,location_distance_m,qr_code,employee_note)
    values (v_emp,v_date,v_time,v_status,v_late,v_cut,'employee_app',false,auth.uid(),p_device_id,p_lat,p_lng,p_accuracy,round(v_distance),v_qr,v_note)
    on conflict (employee_id,work_date) do update
      set check_in = excluded.check_in, status = excluded.status, late_minutes = excluded.late_minutes,
          deduction_days = excluded.deduction_days, source = 'employee_app', recorded_by = auth.uid(),
          device_id = excluded.device_id, latitude = excluded.latitude, longitude = excluded.longitude,
          gps_accuracy = excluded.gps_accuracy, location_distance_m = excluded.location_distance_m,
          qr_code = excluded.qr_code, employee_note = coalesce(excluded.employee_note, attendance.employee_note);
    insert into audit_log(actor,action,entity,entity_id,details)
    values (auth.uid(),'employee_checkin','attendance',v_emp::text,jsonb_build_object('date',v_date,'time',v_time,'distance',round(v_distance)));
    -- INDIVIDUAL notice only (no admin spam — owner gets a daily report instead):
    if v_late > v_grace then
      perform notify_user(auth.uid(),'تم تسجيل الحضور',
        'وصلت الساعة ' || to_char(v_time,'HH24:MI') || ' — تأخير ' || v_late || ' دقيقة. ' ||
        case when v_late_count = 1 then 'إنذار (أول مرة الشهر)، والمرات الجاية عليها خصم ربع يوم.'
             else 'اتطبق خصم ربع يوم لتكرار التأخير.' end);
    else
      perform notify_user(auth.uid(),'تم تسجيل الحضور',
        'وصلت الساعة ' || to_char(v_time,'HH24:MI') ||
        case when v_late > 0 then ' — تأخير ' || v_late || ' دقيقة' else '' end || ' · ' || v_label);
    end if;
    return jsonb_build_object('ok',true,'status',v_status,'time',to_char(v_time,'HH24:MI'),'label',v_label,'lateMin',v_late,'deductionDays',v_cut);
  elsif p_kind = 'out' then
    if not found or v_att.check_in is null then return jsonb_build_object('error','no_checkin','message','لازم تسجل حضور الأول.'); end if;
    if v_att.check_out is not null then return jsonb_build_object('error','already','message','سجلت انصرافك بالفعل.'); end if;
    select coalesce(e.checkout_from, (select (value#>>'{}')::time from settings where key='checkout_from')),
           coalesce(e.checkout_to,   (select (value#>>'{}')::time from settings where key='checkout_to'))
      into s_win_from, s_win_to from employees e where e.id = v_emp;
    if s_win_from is not null and s_win_to is not null and (v_time < s_win_from or v_time > s_win_to) then
      return jsonb_build_object('error','window_closed','message',
        'نافذة تسجيل الانصراف (' || to_char(s_win_from,'HH24:MI') || '–' || to_char(s_win_to,'HH24:MI') || ') مقفولة دلوقتي.'); end if;
    -- EARLY EXIT: leaving before checkout_grace_to → first time/month = warning,
    -- repeats = deduction from settings.early_exit_policy. Skipped for
    -- leave/mission/sick and for an approved permission on the same day.
    v_grace_out := (select (value#>>'{}')::time from settings where key='checkout_grace_to');
    if v_grace_out is not null and v_time < v_grace_out
       and v_att.status not in ('leave','mission','sick')
       and not exists (select 1 from permissions where employee_id = v_emp and perm_date = v_date and status = 'approved') then
      v_early_min := (extract(hour from v_grace_out)::int*60 + extract(minute from v_grace_out)::int)
                   - (extract(hour from v_time)::int*60 + extract(minute from v_time)::int);
      insert into early_exit_counters(employee_id,work_month,early_count,warning_count,deduction_count)
      values (v_emp,to_char(v_date,'YYYY-MM'),1,1,0)
      on conflict (employee_id,work_month) do update
        set early_count = early_exit_counters.early_count + 1,
            warning_count = early_exit_counters.warning_count + case when early_exit_counters.early_count = 0 then 1 else 0 end,
            deduction_count = early_exit_counters.deduction_count + case when early_exit_counters.early_count >= 1 then 1 else 0 end
      returning early_count into v_early_count;
      if v_early_count = 1 then
        v_early_cut := 0; v_early_label := 'إنذار انصراف مبكر (أول مرة الشهر)';
      else
        v_early_cut := coalesce((select (value->>'repeat_cut')::numeric from settings where key='early_exit_policy'), 0.25);
        v_early_label := 'خصم لتكرار الانصراف المبكر';
      end if;
    end if;
    update attendance set check_out = v_time,
        early_leave_minutes = case when v_early_min > 0 then v_early_min else early_leave_minutes end,
        deduction_days = coalesce(deduction_days,0) + v_early_cut,
        note = case when v_early_label is not null
                    then (case when note is null or note = '' then '' else note || ' · ' end) || v_early_label
                    else note end,
        device_id = coalesce(device_id,p_device_id),
        latitude = coalesce(latitude,p_lat), longitude = coalesce(longitude,p_lng),
        gps_accuracy = coalesce(gps_accuracy,p_accuracy), location_distance_m = coalesce(location_distance_m,round(v_distance)),
        employee_note = coalesce(v_note, employee_note)
    where employee_id = v_emp and work_date = v_date;
    insert into audit_log(actor,action,entity,entity_id,details)
    values (auth.uid(),'employee_checkout','attendance',v_emp::text,jsonb_build_object('date',v_date,'time',v_time,'distance',round(v_distance),'early_min',v_early_min));
    if v_early_min > 0 then
      if v_early_cut > 0 then
        perform notify_user(auth.uid(),'خصم انصراف مبكر',
          'انصرفت الساعة ' || to_char(v_time,'HH24:MI') || ' قبل ' || to_char(v_grace_out,'HH24:MI') ||
          ' — اتطبق خصم ' || v_early_cut::text || ' يوم لتكرار الانصراف المبكر.');
        perform notify_admins('انصراف مبكر متكرر',
          v_name || ' انصرف الساعة ' || to_char(v_time,'HH24:MI') || ' (المرة رقم ' || v_early_count::text || ' الشهر ده) — اتطبق خصم ' || v_early_cut::text || ' يوم.');
      else
        perform notify_user(auth.uid(),'تنبيه انصراف مبكر',
          'انصرفت الساعة ' || to_char(v_time,'HH24:MI') || ' قبل ' || to_char(v_grace_out,'HH24:MI') ||
          ' — إنذار (أول مرة الشهر)، المرات الجاية عليها خصم.');
      end if;
    else
      perform notify_user(auth.uid(),'تم تسجيل الانصراف','وصلت الانصراف الساعة ' || to_char(v_time,'HH24:MI'));
    end if;
    return jsonb_build_object('ok',true,'time',to_char(v_time,'HH24:MI'),'earlyMin',v_early_min,'earlyCut',v_early_cut,'label',v_early_label);
  end if;
  return jsonb_build_object('error','bad_kind','message','نوع العملية غير صحيح.');
end $function$;

revoke all on function public.employee_attendance_action_v1(text,numeric,numeric,integer,text,text,text) from public, anon;
grant execute on function public.employee_attendance_action_v1(text,numeric,numeric,integer,text,text,text) to authenticated;

-- ---------- mark_missing_checkouts_v1: note-concat fix -------------------------
create or replace function public.mark_missing_checkouts_v1(p_date date)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  r record;
  v_month text := to_char(p_date,'YYYY-MM');
  v_count int;
  v_processed int := 0;
  v_user uuid;
begin
  -- human caller must be admin; cron runs with null auth.uid() and is allowed
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
          note = (case when note is null or note = '' then '' else note || ' · ' end) || 'خصم ربع يوم لعدم تسجيل الانصراف'
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
end $function$;

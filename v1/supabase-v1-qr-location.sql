-- =====================================================================
--  Air Ocean Line — v1 ops fix (2026-07-12)
--  1) Correct company GPS location (was ~6km off → team told "wrong location").
--     New precise coords from Google Maps: 31.1985266, 29.9039409 (العطارين).
--  2) Make the daily QR OPTIONAL (not mandatory). New setting `qr_required`
--     (default false); employee_attendance_action_v1 only validates QR when
--     it's true — otherwise attendance works with GPS alone.
--  Safe to re-run.
-- =====================================================================

-- 1) Company location — corrected center, keep 1000m radius.
update company_locations
set lat = 31.1985266, lng = 29.9039409, radius_m = 1000
where id = 1;

-- 2) QR optional flag (default false = optional).
insert into settings(key, value)
values ('qr_required', 'false'::jsonb)
on conflict (key) do nothing;

-- 2b) Attendance RPC: QR becomes optional. Only the QR block changed vs the
--     previous version — everything else (geofence, windows, late tiers) is kept.
create or replace function public.employee_attendance_action_v1(
  p_kind text, p_lat numeric, p_lng numeric, p_accuracy integer,
  p_qr_code text, p_device_id text, p_note text DEFAULT NULL::text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_emp bigint;
  v_name text;
  v_now timestamp := now() at time zone 'Africa/Cairo';
  v_date date;
  v_time time;
  v_location company_locations%rowtype;
  v_distance numeric;
  v_qr text;
  s_start time;
  s_absent time;
  s_win_from time;
  s_win_to time;
  v_min int;
  v_late int;
  v_tier jsonb;
  v_tiers jsonb;
  v_status text := 'pending';
  v_label text := '';
  v_cut numeric := 0;
  v_att attendance%rowtype;
  v_late_count int := 0;
  v_late_month text;
  v_note text := nullif(trim(coalesce(p_note,'')),'');
begin
  v_date := v_now::date;
  v_time := v_now::time;

  select employee_id into v_emp from employee_accounts where user_id = auth.uid() and active;
  if v_emp is null then
    return jsonb_build_object('error','no_employee','message','الحساب غير مربوط بموظف.');
  end if;

  select name into v_name from employees where id = v_emp;

  if (select attendance_exempt from employees where id = v_emp) then
    return jsonb_build_object('error','exempt','message','حسابك معفي من تسجيل الحضور والانصراف.');
  end if;

  if p_lat is null or p_lng is null
     or p_accuracy is null
     or p_accuracy > coalesce((select (value#>>'{}')::int from settings where key='max_gps_accuracy_m'), 100) then
    return jsonb_build_object('error','low_accuracy','message','دقة تحديد الموقع ضعيفة. اتأكد إن الـ GPS شغّال وانت في مكان مكشوف وحاول تاني.');
  end if;

  if extract(dow from v_date)::int = 5 or exists(select 1 from official_holidays where holiday_date = v_date) then
    return jsonb_build_object('error','holiday','message','اليوم أجازة رسمية أو راحة أسبوعية.');
  end if;

  select * into v_location from company_locations where active order by id limit 1;
  if not found then
    return jsonb_build_object('error','no_location','message','موقع الشركة غير مضبوط.');
  end if;

  v_distance := geo_distance_meters(p_lat,p_lng,v_location.lat,v_location.lng);
  if v_distance > v_location.radius_m then
    return jsonb_build_object('error','outside','message','أنت خارج نطاق الشركة. المسافة: ' || round(v_distance)::text || ' متر.');
  end if;

  -- QR optional: only enforce when the setting qr_required is true.
  if coalesce((select (value#>>'{}')::boolean from settings where key='qr_required'), false) then
    v_qr := ensure_daily_qr(v_date);
    if upper(trim(coalesce(p_qr_code,''))) <> upper(v_qr) then
      return jsonb_build_object('error','bad_qr','message','كود QR غير صحيح.');
    end if;
  else
    v_qr := nullif(upper(trim(coalesce(p_qr_code,''))), '');
  end if;

  select * into v_att from attendance where employee_id = v_emp and work_date = v_date;

  if p_kind = 'in' then
    if found and v_att.check_in is not null then
      return jsonb_build_object('error','already','message','سجلت حضورك بالفعل.');
    end if;

    select coalesce(e.checkin_from, (select (value#>>'{}')::time from settings where key='checkin_from')),
           coalesce(e.checkin_to,   (select (value#>>'{}')::time from settings where key='checkin_to'))
      into s_win_from, s_win_to
      from employees e where e.id = v_emp;
    if s_win_from is not null and s_win_to is not null and (v_time < s_win_from or v_time > s_win_to) then
      return jsonb_build_object('error','window_closed','message',
        'نافذة تسجيل الحضور (' || to_char(s_win_from,'HH24:MI') || '–' || to_char(s_win_to,'HH24:MI') || ') مقفولة دلوقتي.');
    end if;

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
          v_status := v_tier->>'status';
          v_label := v_tier->>'label';
          v_cut := (v_tier->>'cut')::numeric;
          exit;
        end if;
      end loop;
    end if;

    if v_late > 15 then
      insert into late_arrival_counters(employee_id,work_month,late_count,warning_count,deduction_count)
      values (v_emp,v_late_month,1,1,0)
      on conflict (employee_id,work_month) do update
        set late_count = late_arrival_counters.late_count + 1,
            warning_count = late_arrival_counters.warning_count + case when late_arrival_counters.late_count = 0 then 1 else 0 end,
            deduction_count = late_arrival_counters.deduction_count + case when late_arrival_counters.late_count >= 1 then 1 else 0 end
      returning late_count into v_late_count;

      if v_status <> 'pending' then
        v_status := 'late';
      end if;

      if v_late_count = 1 then
        v_cut := 0;
        v_label := 'إنذار تأخير أول مرة بعد السماح';
      else
        v_cut := 0.25;
        v_label := 'خصم ربع يوم لتكرار التأخير';
      end if;
    end if;

    insert into attendance(employee_id,work_date,check_in,status,late_minutes,deduction_days,source,approved,recorded_by,device_id,latitude,longitude,gps_accuracy,location_distance_m,qr_code,employee_note)
    values (v_emp,v_date,v_time,v_status,v_late,v_cut,'employee_app',false,auth.uid(),p_device_id,p_lat,p_lng,p_accuracy,round(v_distance),v_qr,v_note)
    on conflict (employee_id,work_date) do update
      set check_in = excluded.check_in,
          status = excluded.status,
          late_minutes = excluded.late_minutes,
          deduction_days = excluded.deduction_days,
          source = 'employee_app',
          recorded_by = auth.uid(),
          device_id = excluded.device_id,
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          gps_accuracy = excluded.gps_accuracy,
          location_distance_m = excluded.location_distance_m,
          qr_code = excluded.qr_code,
          employee_note = coalesce(excluded.employee_note, attendance.employee_note);

    insert into audit_log(actor,action,entity,entity_id,details)
    values (auth.uid(),'employee_checkin','attendance',v_emp::text,jsonb_build_object('date',v_date,'time',v_time,'distance',round(v_distance)));

    if v_late > 15 then
      perform notify_user(
        auth.uid(),
        case when v_late_count = 1 then 'إنذار تأخير' else 'خصم تأخير' end,
        case when v_late_count = 1
          then 'دي أول مرة تتأخر أكتر من 15 دقيقة هذا الشهر. المرات القادمة عليها خصم ربع يوم.'
          else 'تم تطبيق خصم ربع يوم بسبب تكرار التأخير أكتر من 15 دقيقة.'
        end
      );
    else
      perform notify_user(auth.uid(),'تم تسجيل الحضور','الوقت ' || to_char(v_time,'HH24:MI') || ' · ' || v_label);
    end if;
    return jsonb_build_object('ok',true,'status',v_status,'time',to_char(v_time,'HH24:MI'),'label',v_label,'lateMin',v_late,'deductionDays',v_cut);
  elsif p_kind = 'out' then
    if not found or v_att.check_in is null then
      return jsonb_build_object('error','no_checkin','message','لازم تسجل حضور الأول.');
    end if;
    if v_att.check_out is not null then
      return jsonb_build_object('error','already','message','سجلت انصرافك بالفعل.');
    end if;

    select coalesce(e.checkout_from, (select (value#>>'{}')::time from settings where key='checkout_from')),
           coalesce(e.checkout_to,   (select (value#>>'{}')::time from settings where key='checkout_to'))
      into s_win_from, s_win_to
      from employees e where e.id = v_emp;
    if s_win_from is not null and s_win_to is not null and (v_time < s_win_from or v_time > s_win_to) then
      return jsonb_build_object('error','window_closed','message',
        'نافذة تسجيل الانصراف (' || to_char(s_win_from,'HH24:MI') || '–' || to_char(s_win_to,'HH24:MI') || ') مقفولة دلوقتي.');
    end if;

    update attendance
    set check_out = v_time,
        device_id = coalesce(device_id,p_device_id),
        latitude = coalesce(latitude,p_lat),
        longitude = coalesce(longitude,p_lng),
        gps_accuracy = coalesce(gps_accuracy,p_accuracy),
        location_distance_m = coalesce(location_distance_m,round(v_distance)),
        employee_note = coalesce(v_note, employee_note)
    where employee_id = v_emp and work_date = v_date;

    insert into audit_log(actor,action,entity,entity_id,details)
    values (auth.uid(),'employee_checkout','attendance',v_emp::text,jsonb_build_object('date',v_date,'time',v_time,'distance',round(v_distance)));

    perform notify_user(auth.uid(),'تم تسجيل الانصراف','الوقت ' || to_char(v_time,'HH24:MI'));
    return jsonb_build_object('ok',true,'time',to_char(v_time,'HH24:MI'));
  end if;

  return jsonb_build_object('error','bad_kind','message','نوع العملية غير صحيح.');
end $function$;

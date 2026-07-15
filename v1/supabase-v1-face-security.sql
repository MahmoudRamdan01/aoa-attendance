-- ============================================================================
-- AOA v1 — Phase 2: attendance capture, face and device security (2026-07-15)
--
-- Safe rollout contract:
--   * employee_attendance_action_v1 remains available during migration.
--   * face_mode is seeded as "off".
--   * the capture bucket is private and capture objects are immutable.
--   * this migration is idempotent and is based on the live Phase 1 RPC.
-- ============================================================================

create extension if not exists vector;

-- ---------- private, immutable capture storage ------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attendance-captures',
  'attendance-captures',
  false,
  512000,
  array['image/jpeg']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists attendance_captures_employee_insert on storage.objects;
create policy attendance_captures_employee_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attendance-captures'
    and owner_id = auth.uid()::text
    and (storage.foldername(name))[1] = (
      select ea.employee_id::text
      from public.employee_accounts ea
      where ea.user_id = auth.uid() and ea.active
      limit 1
    )
    and lower(storage.extension(name)) in ('jpg', 'jpeg')
  );

drop policy if exists attendance_captures_hr_select on storage.objects;
create policy attendance_captures_hr_select on storage.objects
  for select to authenticated
  using (bucket_id = 'attendance-captures' and public.is_hr());

drop policy if exists attendance_captures_hr_insert on storage.objects;
create policy attendance_captures_hr_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attendance-captures'
    and public.is_hr()
    and owner_id = auth.uid()::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg')
  );

drop policy if exists attendance_captures_owner_delete on storage.objects;
create policy attendance_captures_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'attendance-captures' and public.is_owner());

-- Deliberately no UPDATE policy: captures are evidence and remain immutable.

-- ---------- face profiles and trusted devices -------------------------------
create table if not exists public.face_profiles (
  id bigint generated always as identity primary key,
  employee_id bigint not null references public.employees(id) on delete cascade,
  embedding vector(1024) not null,
  photo_path text,
  approved boolean not null default false,
  source text not null default 'auto_checkin'
    check (source in ('auto_checkin', 'hr_capture')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.face_profiles enable row level security;
drop policy if exists face_profiles_hr_all on public.face_profiles;
create policy face_profiles_hr_all on public.face_profiles
  for all to authenticated using (public.is_hr()) with check (public.is_hr());
drop policy if exists face_profiles_emp_select on public.face_profiles;
-- Raw embeddings are intentionally never exposed to employees. Employee-facing
-- status can be returned by a narrow RPC later without making replay trivial.

grant select, insert, update, delete on public.face_profiles to authenticated;
grant usage, select on sequence public.face_profiles_id_seq to authenticated;

create table if not exists public.trusted_devices (
  id bigint generated always as identity primary key,
  employee_id bigint not null references public.employees(id) on delete cascade,
  device_id text not null,
  fingerprint text,
  label text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  seen_count int not null default 1,
  unique (employee_id, device_id)
);

alter table public.trusted_devices enable row level security;
drop policy if exists trusted_devices_hr_all on public.trusted_devices;
create policy trusted_devices_hr_all on public.trusted_devices
  for all to authenticated using (public.is_hr()) with check (public.is_hr());
drop policy if exists trusted_devices_emp_select on public.trusted_devices;
create policy trusted_devices_emp_select on public.trusted_devices
  for select to authenticated
  using (
    employee_id = (
      select ea.employee_id
      from public.employee_accounts ea
      where ea.user_id = auth.uid() and ea.active
      limit 1
    )
  );

grant select, insert, update, delete on public.trusted_devices to authenticated;
grant usage, select on sequence public.trusted_devices_id_seq to authenticated;

-- Seed historical devices so rollout does not create a new-device alert storm.
insert into public.trusted_devices (employee_id, device_id, first_seen, last_seen, seen_count)
select employee_id, device_id, min(created_at), max(created_at), count(*)::int
from public.attendance
where device_id is not null and work_date > current_date - 60
group by employee_id, device_id
on conflict (employee_id, device_id) do nothing;

-- ---------- attendance evidence columns and settings ------------------------
alter table public.attendance
  add column if not exists photo_path text,
  add column if not exists checkout_photo_path text,
  add column if not exists face_similarity_in numeric,
  add column if not exists face_similarity_out numeric,
  add column if not exists face_scores jsonb,
  add column if not exists risk_score int,
  add column if not exists risk_flags jsonb,
  add column if not exists client_fingerprint text;

insert into public.settings(key, value, note) values
  ('photo_required', 'true', 'صورة سيلفي إلزامية عند الحضور والانصراف'),
  ('face_mode', '"off"', 'off / warn / enforce — التحقق من بصمة الوجه'),
  ('face_match_threshold', '0.5', 'حد التشابه لقبول الوجه (0-1)'),
  ('liveness_required', 'true', 'تحدي الحيوية مطلوب عند الالتقاط'),
  ('antispoof_min', '0.6', 'أدنى درجة antispoof مقبولة'),
  ('risk_block_threshold', '60', 'درجة المخاطرة التي يُرفض عندها التسجيل'),
  ('risk_medium_cap', '45', 'سقف مجموع الإشارات المتوسطة (أقل من حد الرفض)')
on conflict (key) do nothing;

-- ---------- audited owner-only setting changes ------------------------------
create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns jsonb language plpgsql security definer set search_path to 'public','extensions'
as $function$
declare
  v_allowed text[] := array[
    'photo_required','face_mode','face_match_threshold','liveness_required','antispoof_min',
    'risk_block_threshold','risk_medium_cap','grace_mins','checkout_grace_to','early_exit_policy',
    'late_tiers','max_gps_accuracy_m','qr_required','work_start','absent_after',
    'checkin_from','checkin_to','checkout_from','checkout_to','v1_action_disabled',
    'capture_retention_months'
  ];
begin
  if not public.is_owner() then
    return jsonb_build_object('error','owner_only','message','للمالك فقط.');
  end if;
  if not (p_key = any(v_allowed)) then
    return jsonb_build_object('error','bad_key','message','المفتاح ده مش مسموح تعديله.');
  end if;
  if p_key = 'face_mode' and not (p_value #>> '{}' in ('off','warn','enforce')) then
    return jsonb_build_object('error','bad_value','message','face_mode لازم يكون off أو warn أو enforce.');
  end if;
  insert into public.settings(key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  insert into public.audit_log(actor, action, entity, entity_id, details)
  values (auth.uid(), 'set_setting', 'settings', p_key, jsonb_build_object('value', p_value));
  return jsonb_build_object('ok', true, 'key', p_key, 'value', p_value);
end $function$;

revoke all on function public.admin_set_setting(text, jsonb) from public, anon;
grant execute on function public.admin_set_setting(text, jsonb) to authenticated;

create or replace function public.get_attendance_security_config_v1()
returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select jsonb_build_object(
    'photo_required', coalesce((select (value#>>'{}')::boolean from settings where key='photo_required'), true),
    'face_mode', coalesce((select value#>>'{}' from settings where key='face_mode'), 'off'),
    'face_match_threshold', coalesce((select (value#>>'{}')::numeric from settings where key='face_match_threshold'), 0.5),
    'liveness_required', coalesce((select (value#>>'{}')::boolean from settings where key='liveness_required'), true),
    'antispoof_min', coalesce((select (value#>>'{}')::numeric from settings where key='antispoof_min'), 0.6)
  );
$function$;

revoke all on function public.get_attendance_security_config_v1() from public, anon;
grant execute on function public.get_attendance_security_config_v1() to authenticated;

create or replace function public.admin_face_profile_action_v1(
  p_action text,
  p_employee_id bigint,
  p_profile_id bigint default null,
  p_embedding text default null,
  p_photo_path text default null
)
returns jsonb language plpgsql security definer set search_path to 'public','extensions'
as $function$
declare
  v_id bigint;
  v_count int;
  v_embedding vector(1024);
begin
  if not is_hr() then
    return jsonb_build_object('error','hr_only','message','للإدارة فقط.');
  end if;
  if not exists (select 1 from employees where id = p_employee_id) then
    return jsonb_build_object('error','not_found','message','الموظف غير موجود.');
  end if;

  if p_action = 'approve' then
    update face_profiles
      set approved = true
      where id = p_profile_id and employee_id = p_employee_id
      returning id into v_id;
  elsif p_action = 'delete' then
    delete from face_profiles
      where id = p_profile_id and employee_id = p_employee_id
      returning id into v_id;
  elsif p_action = 'create' then
    if p_embedding is null or p_photo_path is null then
      return jsonb_build_object('error','missing_capture','message','الصورة وبصمة الوجه مطلوبين.');
    end if;
    begin
      v_embedding := p_embedding::vector(1024);
    exception when others then
      return jsonb_build_object('error','bad_embedding','message','بصمة الوجه غير صالحة.');
    end;
    perform 1 from storage.objects
      where bucket_id = 'attendance-captures'
        and name = p_photo_path
        and owner_id = auth.uid()::text
        and (storage.foldername(name))[1] = p_employee_id::text;
    if not found then
      return jsonb_build_object('error','photo_invalid','message','الصورة المرجعية غير صالحة.');
    end if;
    select count(*) into v_count from face_profiles
      where employee_id = p_employee_id and approved;
    if v_count >= 3 then
      return jsonb_build_object('error','profile_limit','message','تم الوصول للحد الموصى به: 3 بصمات معتمدة.');
    end if;
    insert into face_profiles(employee_id, embedding, photo_path, approved, source, created_by)
    values (p_employee_id, v_embedding, p_photo_path, true, 'hr_capture', auth.uid())
    returning id into v_id;
  else
    return jsonb_build_object('error','bad_action','message','الإجراء غير صحيح.');
  end if;

  if v_id is null then
    return jsonb_build_object('error','not_found','message','ملف الوجه غير موجود.');
  end if;
  insert into audit_log(actor, action, entity, entity_id, details)
  values (auth.uid(), 'face_profile_' || p_action, 'face_profiles', v_id::text,
    jsonb_build_object('employee_id', p_employee_id, 'photo_path', p_photo_path));
  return jsonb_build_object('ok',true,'id',v_id,'action',p_action);
end $function$;

revoke all on function public.admin_face_profile_action_v1(text,bigint,bigint,text,text) from public, anon;
grant execute on function public.admin_face_profile_action_v1(text,bigint,bigint,text,text) to authenticated;

create or replace function public.admin_get_security_settings_v1()
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_settings jsonb;
  v_total int;
  v_mismatch int;
begin
  if not is_owner() then
    return jsonb_build_object('error','owner_only','message','للمالك فقط.');
  end if;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_settings
  from settings
  where key = any(array[
    'photo_required','face_mode','face_match_threshold','liveness_required','antispoof_min',
    'risk_block_threshold','risk_medium_cap','grace_mins','checkout_grace_to',
    'early_exit_policy','late_tiers','max_gps_accuracy_m','qr_required',
    'v1_action_disabled','capture_retention_months'
  ]);
  select count(*), count(*) filter (where risk_flags::text like '%face_%')
    into v_total, v_mismatch
  from attendance
  where work_date >= current_date - 30 and photo_path is not null;
  return jsonb_build_object(
    'settings', v_settings,
    'face_attempts_30d', v_total,
    'face_mismatches_30d', v_mismatch,
    'face_mismatch_rate', case when v_total > 0 then round(v_mismatch::numeric / v_total, 4) else 0 end
  );
end $function$;

revoke all on function public.admin_get_security_settings_v1() from public, anon;
grant execute on function public.admin_get_security_settings_v1() to authenticated;

-- ---------- v2 attendance RPC -----------------------------------------------
create or replace function public.employee_attendance_action_v2(
  p_kind text,
  p_lat numeric,
  p_lng numeric,
  p_accuracy integer,
  p_qr_code text,
  p_device_id text,
  p_note text default null,
  p_photo_path text default null,
  p_face_embedding text default null,
  p_face_scores jsonb default null,
  p_gps_samples jsonb default null,
  p_fingerprint text default null
)
returns jsonb language plpgsql security definer set search_path to 'public','extensions'
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
  -- Photo / risk / face.
  v_photo_required boolean := coalesce((select (value#>>'{}')::boolean from settings where key='photo_required'), true);
  v_flags jsonb := '[]'::jsonb;
  v_strong int := 0; v_medium int := 0; v_risk int := 0;
  v_block int := coalesce((select (value#>>'{}')::int from settings where key='risk_block_threshold'), 60);
  v_medium_cap int := coalesce((select (value#>>'{}')::int from settings where key='risk_medium_cap'), 45);
  v_n int := 0; v_distinct_coords int := 0; v_distinct_acc int := 0;
  v_all_speed_zero boolean := false; v_max_jump numeric := 0; v_min_jump_dt numeric;
  v_prev_t timestamp; v_prev_lat numeric; v_prev_lng numeric; v_dt_h numeric; v_km numeric;
  v_is_new_device boolean := false; v_stored_fp text;
  v_median_dist numeric; v_hist_days int := 0;
  v_face_mode text := coalesce((select value#>>'{}' from settings where key='face_mode'), 'off');
  v_face_threshold numeric := coalesce((select (value#>>'{}')::numeric from settings where key='face_match_threshold'), 0.5);
  v_liveness_required boolean := coalesce((select (value#>>'{}')::boolean from settings where key='liveness_required'), true);
  v_antispoof_min numeric := coalesce((select (value#>>'{}')::numeric from settings where key='antispoof_min'), 0.6);
  v_emb vector(1024); v_sim numeric; v_approved_count int := 0;
  v_face_fail boolean := false; v_face_reason text; v_face_unavailable boolean := false;
  v_auto_enroll boolean := false;
begin
  v_date := v_now::date; v_time := v_now::time;
  if p_kind is null or p_kind not in ('in','out') then
    return jsonb_build_object('error','bad_kind','message','نوع العملية غير صحيح.');
  end if;
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

  -- Approved non-working records are authoritative. Never let an employee
  -- client (including a stale or modified one) replace them with a check-in.
  if p_kind = 'in' and v_att.check_in is null
     and v_att.status in ('leave','mission','sick') then
    return jsonb_build_object(
      'error','day_locked',
      'message','اليوم مسجل إجازة أو مأمورية أو مرضي، ولا يمكن استبداله بحضور من التطبيق.'
    );
  end if;

  -- PHOTO GATE: the caller must own a real, correctly named object for today.
  if v_photo_required and p_photo_path is null then
    return jsonb_build_object('error','photo_required','message','لازم تلتقط صورة عشان تسجّل.');
  end if;
  if p_photo_path is not null then
    perform 1 from storage.objects
      where bucket_id = 'attendance-captures' and name = p_photo_path
        and owner_id = auth.uid()::text
        and (storage.foldername(name))[1] = v_emp::text
        and name like v_emp::text || '/' || to_char(v_date,'YYYY-MM-DD') || '-' || p_kind || '-%'
        and lower(storage.extension(name)) in ('jpg','jpeg');
    if not found then
      return jsonb_build_object('error','photo_invalid','message','الصورة غير صالحة. حاول تلتقط من جديد.');
    end if;
  end if;

  -- RISK ENGINE: only a strong signal can reach the blocking threshold.
  begin
    if p_gps_samples is not null and jsonb_typeof(p_gps_samples) = 'array' then
      with s as (
        select (e->>'lat')::numeric as lat, (e->>'lng')::numeric as lng,
               (e->>'ts')::numeric as ts, nullif(e->>'accuracy','')::numeric as acc,
               nullif(e->>'speed','')::numeric as spd, ord
        from jsonb_array_elements(p_gps_samples) with ordinality as t(e, ord)
        where ord <= 10
      ), j as (
        select geo_distance_meters(lat,lng,lag(lat) over w,lag(lng) over w) as jump,
               (ts - lag(ts) over w) / 1000.0 as dt_s
        from s window w as (order by ord)
      )
      select (select count(*) from s),
             (select count(distinct lat::text || ',' || lng::text) from s),
             (select count(distinct acc) from s where acc is not null),
             (select coalesce(bool_and(coalesce(spd,0) = 0), false) from s),
             (select coalesce(max(jump), 0) from j where jump is not null),
             (select min(dt_s) from j where jump is not null and jump > 500)
      into v_n, v_distinct_coords, v_distinct_acc, v_all_speed_zero, v_max_jump, v_min_jump_dt;

      if v_n >= 3 and v_distinct_coords = 1 then
        v_strong := v_strong + 60; v_flags := v_flags || to_jsonb('gps_static'::text);
      end if;
      if v_min_jump_dt is not null and v_min_jump_dt < 10 then
        v_strong := v_strong + 60; v_flags := v_flags || to_jsonb('gps_teleport'::text);
      end if;
      if v_n >= 3 and v_distinct_acc = 1 and v_distinct_coords > 1 then
        v_medium := v_medium + 20; v_flags := v_flags || to_jsonb('flat_accuracy'::text);
      end if;
      if v_n >= 3 and v_all_speed_zero and v_max_jump > 30 then
        v_medium := v_medium + 15; v_flags := v_flags || to_jsonb('speed_mismatch'::text);
      end if;
    end if;
  exception when others then
    v_medium := v_medium + 10; v_flags := v_flags || to_jsonb('bad_samples'::text);
  end;

  -- Impossible travel versus the most recent known point.
  if p_kind = 'in' then
    select (work_date + coalesce(check_out, check_in))::timestamp, latitude, longitude
      into v_prev_t, v_prev_lat, v_prev_lng
    from attendance
    where employee_id = v_emp and latitude is not null and work_date < v_date
    order by work_date desc limit 1;
  elsif v_att.check_in is not null and v_att.latitude is not null then
    v_prev_t := (v_date + v_att.check_in)::timestamp;
    v_prev_lat := v_att.latitude; v_prev_lng := v_att.longitude;
  end if;
  if v_prev_t is not null and v_prev_lat is not null then
    v_dt_h := extract(epoch from (v_now - v_prev_t)) / 3600.0;
    v_km := geo_distance_meters(p_lat, p_lng, v_prev_lat, v_prev_lng) / 1000.0;
    if v_dt_h > 0.002 and (v_km / v_dt_h) > 200 then
      v_strong := v_strong + 60; v_flags := v_flags || to_jsonb('impossible_travel'::text);
    end if;
  end if;

  -- Device signal. Persisting the device is deferred until attendance succeeds.
  select fingerprint into v_stored_fp from trusted_devices
    where employee_id = v_emp and device_id = coalesce(p_device_id,'');
  if not found then
    v_is_new_device := true;
    v_medium := v_medium + 15; v_flags := v_flags || to_jsonb('new_device'::text);
  elsif p_fingerprint is not null and v_stored_fp is not null and v_stored_fp <> p_fingerprint then
    v_medium := v_medium + 10; v_flags := v_flags || to_jsonb('fingerprint_changed'::text);
  end if;

  select percentile_cont(0.5) within group (order by location_distance_m), count(*)
    into v_median_dist, v_hist_days
  from attendance
  where employee_id = v_emp and location_distance_m is not null
    and work_date > v_date - 30 and work_date < v_date;
  if v_hist_days >= 5 and v_distance > greatest(3 * v_median_dist, v_median_dist + 300) then
    v_medium := v_medium + 20; v_flags := v_flags || to_jsonb('distance_anomaly'::text);
  end if;

  v_face_unavailable := coalesce((p_face_scores->>'unavailable')::boolean, false);
  if v_face_mode <> 'off' and v_face_unavailable then
    v_medium := v_medium + 15; v_flags := v_flags || to_jsonb('face_unavailable'::text);
  end if;

  v_risk := least(v_medium, v_medium_cap) + v_strong;
  if v_risk >= v_block then
    insert into audit_log(actor,action,entity,entity_id,details)
    values (auth.uid(),'attendance_blocked_risk','attendance',v_emp::text,
      jsonb_build_object('kind',p_kind,'date',v_date,'time',v_time,'risk',v_risk,'flags',v_flags,'distance',round(v_distance)));
    perform notify_admins('محاولة تسجيل مشبوهة',
      v_name || ' — محاولة ' || case when p_kind='in' then 'حضور' else 'انصراف' end ||
      ' اترفضت (مؤشرات: ' || (select string_agg(x,'، ') from jsonb_array_elements_text(v_flags) x) || ').');
    return jsonb_build_object('error','gps_suspect','message','تعذر التحقق من موقعك بشكل موثوق. حاول تاني من مكانك الطبيعي أو تواصل مع الإدارة.');
  end if;

  -- FACE VERDICT. Network/model failure degrades to photo-only; missing liveness
  -- data does not silently pass when models were available.
  if v_face_mode <> 'off' and not v_face_unavailable then
    begin
      if p_face_embedding is not null then v_emb := p_face_embedding::vector(1024); end if;
    exception when others then
      v_emb := null; v_flags := v_flags || to_jsonb('bad_embedding'::text);
    end;
    select count(*) into v_approved_count from face_profiles where employee_id = v_emp and approved;
    if v_approved_count = 0 then
      v_auto_enroll := p_kind = 'in' and v_emb is not null and p_photo_path is not null
        and not exists (select 1 from face_profiles where employee_id = v_emp);
    else
      if v_emb is null then
        v_face_fail := true; v_face_reason := 'no_embedding';
      else
        select max(1 - (embedding <=> v_emb)) into v_sim
        from face_profiles where employee_id = v_emp and approved;
        if v_sim < v_face_threshold then v_face_fail := true; v_face_reason := 'low_similarity'; end if;
      end if;
      if not v_face_fail and v_liveness_required then
        if p_face_scores is null
           or (p_face_scores->>'antispoof') is null
           or (p_face_scores->>'liveness') is null
           or coalesce((p_face_scores->>'antispoof')::numeric, 0) < v_antispoof_min
           or coalesce((p_face_scores->>'liveness')::numeric, 0) < 0.5 then
          v_face_fail := true; v_face_reason := 'liveness_failed';
        end if;
      end if;
      if v_face_fail then
        v_flags := v_flags || to_jsonb(('face_' || v_face_reason)::text);
        if v_face_mode = 'enforce' then
          insert into audit_log(actor,action,entity,entity_id,details)
          values (auth.uid(),'attendance_blocked_face','attendance',v_emp::text,
            jsonb_build_object('kind',p_kind,'date',v_date,'reason',v_face_reason,'similarity',v_sim));
          perform notify_admins('رفض تسجيل — الوجه غير متطابق',
            v_name || ' — محاولة ' || case when p_kind='in' then 'حضور' else 'انصراف' end ||
            ' اترفضت (تطابق الوجه ' || coalesce(round(v_sim,2)::text,'—') || ').');
          return jsonb_build_object('error','face_mismatch','message','تعذر التحقق من الوجه. اتأكد إن وشك واضح في الإضاءة وحاول تاني، أو تواصل مع الإدارة.');
        else
          perform notify_admins('تنبيه — الوجه غير متطابق',
            v_name || ' سجّل ' || case when p_kind='in' then 'حضور' else 'انصراف' end ||
            ' وتطابق الوجه ' || coalesce(round(v_sim,2)::text,'—') || ' (وضع المراقبة — التسجيل اتقبل).');
        end if;
      end if;
    end if;
  end if;

  if p_kind = 'in' then
    if v_att.check_in is not null then
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

    if v_auto_enroll then
      insert into face_profiles(employee_id, embedding, photo_path, approved, source, created_by)
      values (v_emp, v_emb, p_photo_path, false, 'auto_checkin', auth.uid());
      perform notify_admins('ملف وجه جديد بانتظار الاعتماد',
        'اتسجلت أول بصمة وجه لـ ' || v_name || ' من صورة الحضور — راجعها واعتمدها من ملف الموظف.');
    end if;
    if v_is_new_device then
      insert into trusted_devices(employee_id, device_id, fingerprint)
      values (v_emp, coalesce(p_device_id,''), p_fingerprint)
      on conflict (employee_id, device_id) do update
        set last_seen = now(), seen_count = trusted_devices.seen_count + 1,
            fingerprint = coalesce(excluded.fingerprint, trusted_devices.fingerprint);
      perform notify_admins('تسجيل من جهاز جديد', v_name || ' سجّل حضور من جهاز جديد لأول مرة.');
    else
      update trusted_devices set last_seen = now(), seen_count = seen_count + 1,
        fingerprint = coalesce(p_fingerprint, fingerprint)
      where employee_id = v_emp and device_id = coalesce(p_device_id,'');
    end if;

    insert into attendance(employee_id,work_date,check_in,status,late_minutes,deduction_days,source,approved,recorded_by,device_id,latitude,longitude,gps_accuracy,location_distance_m,qr_code,employee_note,
                           photo_path,face_similarity_in,face_scores,risk_score,risk_flags,client_fingerprint)
    values (v_emp,v_date,v_time,v_status,v_late,v_cut,'employee_app',false,auth.uid(),p_device_id,p_lat,p_lng,p_accuracy,round(v_distance),v_qr,v_note,
            p_photo_path,v_sim,case when p_face_scores is not null then jsonb_build_object('in',p_face_scores) end,v_risk,case when jsonb_array_length(v_flags) > 0 then jsonb_build_object('in',v_flags) end,p_fingerprint)
    on conflict (employee_id,work_date) do update
      set check_in = excluded.check_in, status = excluded.status, late_minutes = excluded.late_minutes,
          deduction_days = excluded.deduction_days, source = 'employee_app', recorded_by = auth.uid(),
          device_id = excluded.device_id, latitude = excluded.latitude, longitude = excluded.longitude,
          gps_accuracy = excluded.gps_accuracy, location_distance_m = excluded.location_distance_m,
          qr_code = excluded.qr_code, employee_note = coalesce(excluded.employee_note, attendance.employee_note),
          photo_path = excluded.photo_path, face_similarity_in = excluded.face_similarity_in,
          face_scores = coalesce(attendance.face_scores,'{}'::jsonb) || coalesce(excluded.face_scores,'{}'::jsonb),
          risk_score = greatest(coalesce(attendance.risk_score,0), coalesce(excluded.risk_score,0)),
          risk_flags = coalesce(attendance.risk_flags,'{}'::jsonb) || coalesce(excluded.risk_flags,'{}'::jsonb),
          client_fingerprint = excluded.client_fingerprint;
    insert into audit_log(actor,action,entity,entity_id,details)
    values (auth.uid(),'employee_checkin','attendance',v_emp::text,jsonb_build_object('date',v_date,'time',v_time,'distance',round(v_distance),'risk',v_risk,'flags',v_flags,'face_sim',v_sim));
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
    if jsonb_array_length(v_flags) > 0 and v_risk > 0 and not v_is_new_device then
      perform notify_admins('مؤشرات غير معتادة في تسجيل حضور',
        v_name || ' — حضور اتسجل بمؤشرات: ' || (select string_agg(x,'، ') from jsonb_array_elements_text(v_flags) x) || '.');
    end if;
    return jsonb_build_object('ok',true,'status',v_status,'time',to_char(v_time,'HH24:MI'),'label',v_label,'lateMin',v_late,'deductionDays',v_cut);

  elsif p_kind = 'out' then
    if v_att.check_in is null then return jsonb_build_object('error','no_checkin','message','لازم تسجل حضور الأول.'); end if;
    if v_att.check_out is not null then return jsonb_build_object('error','already','message','سجلت انصرافك بالفعل.'); end if;
    select coalesce(e.checkout_from, (select (value#>>'{}')::time from settings where key='checkout_from')),
           coalesce(e.checkout_to,   (select (value#>>'{}')::time from settings where key='checkout_to'))
      into s_win_from, s_win_to from employees e where e.id = v_emp;
    if s_win_from is not null and s_win_to is not null and (v_time < s_win_from or v_time > s_win_to) then
      return jsonb_build_object('error','window_closed','message',
        'نافذة تسجيل الانصراف (' || to_char(s_win_from,'HH24:MI') || '–' || to_char(s_win_to,'HH24:MI') || ') مقفولة دلوقتي.'); end if;
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

    if v_is_new_device then
      insert into trusted_devices(employee_id, device_id, fingerprint)
      values (v_emp, coalesce(p_device_id,''), p_fingerprint)
      on conflict (employee_id, device_id) do update
        set last_seen = now(), seen_count = trusted_devices.seen_count + 1,
            fingerprint = coalesce(excluded.fingerprint, trusted_devices.fingerprint);
      perform notify_admins('تسجيل من جهاز جديد', v_name || ' سجّل انصراف من جهاز جديد لأول مرة.');
    else
      update trusted_devices set last_seen = now(), seen_count = seen_count + 1,
        fingerprint = coalesce(p_fingerprint, fingerprint)
      where employee_id = v_emp and device_id = coalesce(p_device_id,'');
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
        employee_note = coalesce(v_note, employee_note),
        checkout_photo_path = p_photo_path,
        face_similarity_out = v_sim,
        face_scores = coalesce(face_scores,'{}'::jsonb) || case when p_face_scores is not null then jsonb_build_object('out',p_face_scores) else '{}'::jsonb end,
        risk_score = greatest(coalesce(risk_score,0), v_risk),
        risk_flags = coalesce(risk_flags,'{}'::jsonb) || case when jsonb_array_length(v_flags) > 0 then jsonb_build_object('out',v_flags) else '{}'::jsonb end
    where employee_id = v_emp and work_date = v_date;
    insert into audit_log(actor,action,entity,entity_id,details)
    values (auth.uid(),'employee_checkout','attendance',v_emp::text,jsonb_build_object('date',v_date,'time',v_time,'distance',round(v_distance),'early_min',v_early_min,'risk',v_risk,'flags',v_flags,'face_sim',v_sim));
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
    if jsonb_array_length(v_flags) > 0 and v_risk > 0 and not v_is_new_device then
      perform notify_admins('مؤشرات غير معتادة في تسجيل انصراف',
        v_name || ' — انصراف اتسجل بمؤشرات: ' || (select string_agg(x,'، ') from jsonb_array_elements_text(v_flags) x) || '.');
    end if;
    return jsonb_build_object('ok',true,'time',to_char(v_time,'HH24:MI'),'earlyMin',v_early_min,'earlyCut',v_early_cut,'label',v_early_label);
  end if;
end $function$;

revoke all on function public.employee_attendance_action_v2(
  text,numeric,numeric,integer,text,text,text,text,text,jsonb,jsonb,text
) from public, anon;
grant execute on function public.employee_attendance_action_v2(
  text,numeric,numeric,integer,text,text,text,text,text,jsonb,jsonb,text
) to authenticated;

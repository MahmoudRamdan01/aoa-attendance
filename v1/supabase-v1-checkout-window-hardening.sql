-- ============================================================================
-- AOA v1 — hard checkout-window enforcement (2026-07-19)
--
-- Incident: the 2026-07-16 policy intentionally accepted checkout before the
-- employee's checkout_from and converted the gap to a deduction. That allowed
-- a check-in at 08:30 followed by checkout at 08:30 even when the employee's
-- checkout window started at 16:30.
--
-- This patch restores a hard, fail-closed window in BOTH the current v2 RPC and
-- the legacy v1 RPC. The time is still derived exclusively from server-side
-- Africa/Cairo time; clients never submit it.
-- ============================================================================

do $migration$
declare
  v_v1_signature text;
  v_signature text;
  v_definition text;
  v_checkout_definition text;
  v_checkout_pos integer;
  v_guard_pos integer;
  v_guard_end integer;
  v_after_guard text;
  v_unlocked_select text := $select$  select * into v_att from attendance where employee_id = v_emp and work_date = v_date;$select$;
  v_locked_select text := $select$  select * into v_att from attendance where employee_id = v_emp and work_date = v_date for update;$select$;
  v_serialized_select text := $select$  perform pg_advisory_xact_lock(hashtextextended(v_emp::text || ':' || v_date::text, 0));
  select * into v_att from attendance where employee_id = v_emp and work_date = v_date for update;$select$;
  v_missing_guard_marker text := 'if s_win_from is null or s_win_to is null then';
  v_hard_guard_marker text := 'if v_time < s_win_from or v_time > s_win_to then';
  v_old_guard_marker text := 'if s_win_to is not null and v_time > s_win_to then';
  v_nullable_guard_marker text := 'if s_win_from is not null and s_win_to is not null and (v_time < s_win_from or v_time > s_win_to) then';
  v_fail_closed_hard_guard text := $guard$if s_win_from is null or s_win_to is null then
      return jsonb_build_object('error','schedule_missing','message',
        'مواعيد الانصراف غير مكتملة. تواصل مع الإدارة.'); end if;
    if v_time < s_win_from or v_time > s_win_to then$guard$;
  v_hard_window_block text := $block$if s_win_from is null or s_win_to is null then
      return jsonb_build_object('error','schedule_missing','message',
        'مواعيد الانصراف غير مكتملة. تواصل مع الإدارة.'); end if;
    if v_time < s_win_from or v_time > s_win_to then
      return jsonb_build_object('error','window_closed','message',
        'نافذة تسجيل الانصراف (' || fmt_time12(s_win_from) || '–' || fmt_time12(s_win_to) || ') مقفولة دلوقتي.'); end if;$block$;
begin
  -- security-hardening renames the implementation and leaves a public gate in
  -- front of it. Patch the real implementation whichever install state we see.
  if to_regprocedure('public.employee_attendance_action_v1_legacy(text,numeric,numeric,integer,text,text,text)') is not null then
    v_v1_signature := 'public.employee_attendance_action_v1_legacy(text,numeric,numeric,integer,text,text,text)';
  elsif to_regprocedure('public.employee_attendance_action_v1(text,numeric,numeric,integer,text,text,text)') is not null then
    v_v1_signature := 'public.employee_attendance_action_v1(text,numeric,numeric,integer,text,text,text)';
  else
    raise exception 'The v1 attendance implementation was not found; refusing a partial patch';
  end if;

  foreach v_signature in array array[
    v_v1_signature,
    'public.employee_attendance_action_v2(text,numeric,numeric,integer,text,text,text,text,text,jsonb,jsonb,text)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'Required function % was not found; refusing a partial patch', v_signature;
    end if;

    select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;

    -- The advisory lock also serializes the first check-in, where no attendance
    -- row exists yet. FOR UPDATE then protects all existing-row operations.
    if position(v_serialized_select in v_definition) = 0 then
      if position(v_locked_select in v_definition) > 0 then
        v_definition := replace(v_definition, v_locked_select, v_serialized_select);
      elsif position(v_unlocked_select in v_definition) > 0 then
        v_definition := replace(v_definition, v_unlocked_select, v_serialized_select);
      else
        raise exception 'Expected attendance lookup was not found in %; refusing a partial patch', v_signature;
      end if;
    end if;

    -- Search only after the checkout schedule lookup. The same generic nullable
    -- guard also appears in check-in and must never be rewritten there.
    v_checkout_pos := position('select coalesce(e.checkout_from' in v_definition);
    if v_checkout_pos = 0 then
      raise exception 'Expected checkout schedule lookup was not found in %; refusing a partial patch', v_signature;
    end if;
    v_checkout_definition := substring(v_definition from v_checkout_pos);

    if position(v_missing_guard_marker in v_checkout_definition) > 0
       and position(v_hard_guard_marker in v_checkout_definition) > 0 then
      null; -- Already hardened; keep the deployed message/formatting.
    elsif position(v_old_guard_marker in v_checkout_definition) > 0 then
      -- Replace exactly the old late-only IF block without depending on its
      -- whitespace or translated message text.
      v_guard_pos := position(v_old_guard_marker in v_checkout_definition);
      v_after_guard := substring(v_checkout_definition from v_guard_pos);
      v_guard_end := position('end if;' in v_after_guard);
      if v_guard_end = 0 then
        raise exception 'Malformed old checkout policy block in %; refusing a partial patch', v_signature;
      end if;
      v_checkout_definition := left(v_checkout_definition, v_guard_pos - 1)
        || v_hard_window_block
        || substring(v_after_guard from v_guard_end + length('end if;'));
    elsif position(v_nullable_guard_marker in v_checkout_definition) > 0 then
        -- Fresh databases still have the older hard window. Keep its message,
        -- add the missing fail-closed guard, and remove the nullable bypass.
      v_checkout_definition := replace(v_checkout_definition, v_nullable_guard_marker, v_fail_closed_hard_guard);
    else
      raise exception 'Expected checkout policy block was not found in %; refusing a partial patch', v_signature;
    end if;
    v_definition := left(v_definition, v_checkout_pos - 1) || v_checkout_definition;
    execute v_definition;
  end loop;

  -- A SECURITY DEFINER v1 wrapper can call its owner-only implementation, but
  -- authenticated clients must not bypass the wrapper's update gate directly.
  if to_regprocedure('public.employee_attendance_action_v1_legacy(text,numeric,numeric,integer,text,text,text)') is not null then
    execute 'revoke all on function public.employee_attendance_action_v1_legacy(text,numeric,numeric,integer,text,text,text) from public, anon, authenticated';
  end if;
end
$migration$;

-- Give the employee UI the current effective window (employee override first,
-- then the global fallback) without relying on its long-lived context cache.
create or replace function public.get_attendance_security_config_v1()
returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  select jsonb_build_object(
    'photo_required', coalesce((select (value#>>'{}')::boolean from settings where key='photo_required'), true),
    'face_mode', coalesce((select value#>>'{}' from settings where key='face_mode'), 'off'),
    'face_match_threshold', coalesce((select (value#>>'{}')::numeric from settings where key='face_match_threshold'), 0.5),
    'liveness_required', coalesce((select (value#>>'{}')::boolean from settings where key='liveness_required'), true),
    'antispoof_min', coalesce((select (value#>>'{}')::numeric from settings where key='antispoof_min'), 0.6),
    -- Return the employee's current effective window so a schedule edit takes
    -- effect without relying on the app's long-lived context cache.
    'checkout_from', coalesce(
      (select e.checkout_from::text
         from employee_accounts ea join employees e on e.id = ea.employee_id
        where ea.user_id = auth.uid() and ea.active and e.checkout_from is not null limit 1),
      (select value#>>'{}' from settings where key='checkout_from')
    ),
    'checkout_to', coalesce(
      (select e.checkout_to::text
         from employee_accounts ea join employees e on e.id = ea.employee_id
        where ea.user_id = auth.uid() and ea.active and e.checkout_to is not null limit 1),
      (select value#>>'{}' from settings where key='checkout_to')
    )
  );
$function$;

revoke all on function public.get_attendance_security_config_v1() from public, anon;
grant execute on function public.get_attendance_security_config_v1() to authenticated;
revoke all on function public.employee_attendance_action_v1(text,numeric,numeric,integer,text,text,text) from public, anon;
grant execute on function public.employee_attendance_action_v1(text,numeric,numeric,integer,text,text,text) to authenticated;
revoke all on function public.employee_attendance_action_v2(text,numeric,numeric,integer,text,text,text,text,text,jsonb,jsonb,text) from public, anon;
grant execute on function public.employee_attendance_action_v2(text,numeric,numeric,integer,text,text,text,text,text,jsonb,jsonb,text) to authenticated;

select pg_notify('pgrst', 'reload schema');

-- ============================================================================
-- AOA v1 — Phase 6 rollout hardening (apply only after v2 fleet adoption)
-- Keeps rollback instant: set v1_action_disabled back to false.
-- ============================================================================

insert into settings(key, value, note) values
  ('v1_action_disabled', 'false', 'إيقاف RPC v1 بعد اكتمال تبني النسخة المؤمنة'),
  ('capture_retention_months', '0', '0 = الاحتفاظ بدون تنظيف تلقائي؛ أي قيمة موجبة تحتاج Storage API job')
on conflict (key) do nothing;

-- Preserve the last live v1 implementation, then put a reversible gate in front
-- of it. This block is idempotent.
do $block$
begin
  if to_regprocedure('public.employee_attendance_action_v1_legacy(text,numeric,numeric,integer,text,text,text)') is null
     and to_regprocedure('public.employee_attendance_action_v1(text,numeric,numeric,integer,text,text,text)') is not null then
    alter function public.employee_attendance_action_v1(text,numeric,numeric,integer,text,text,text)
      rename to employee_attendance_action_v1_legacy;
  end if;
end $block$;

create or replace function public.employee_attendance_action_v1(
  p_kind text,
  p_lat numeric,
  p_lng numeric,
  p_accuracy integer,
  p_qr_code text,
  p_device_id text,
  p_note text default null
)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
begin
  if coalesce((select (value#>>'{}')::boolean from settings where key='v1_action_disabled'), false) then
    return jsonb_build_object(
      'error','update_required',
      'message','نسخة التطبيق قديمة. حدّث الصفحة وثبّت آخر إصدار لتسجيل الحضور بالصورة.'
    );
  end if;
  return employee_attendance_action_v1_legacy(
    p_kind,p_lat,p_lng,p_accuracy,p_qr_code,p_device_id,p_note
  );
end $function$;

revoke all on function public.employee_attendance_action_v1(text,numeric,numeric,integer,text,text,text) from public, anon;
grant execute on function public.employee_attendance_action_v1(text,numeric,numeric,integer,text,text,text) to authenticated;

-- Storage retention is intentionally not scheduled here. Deleting rows from
-- storage.objects directly can orphan the underlying object. Configure a
-- Supabase Storage API/Edge Function job only after setting a positive retention
-- value and completing legal review.

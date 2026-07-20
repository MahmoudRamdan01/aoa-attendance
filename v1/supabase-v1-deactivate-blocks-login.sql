-- =====================================================================
-- توقيف الموظف يقفل حساب الدخول كمان
-- ---------------------------------------------------------------------
-- المشكلة (اكتُشفت مع ميروان في سيستم اير أوشن الأساسي): «توقيف الموظف»
-- كان بيعمل employees.active=false فقط — بياناتها محفوظة زي المطلوب، لكن
-- حساب الدخول (auth.users + employee_accounts) كان لسه شغال وبتقدر تسجل
-- دخول عادي بعد ما سابت الشركة.
--
-- الإصلاح: owner_set_employee_active_v1 بقت بتعمل cascade كامل:
--   إيقاف   → employee_accounts.active=false + حظر auth (banned_until=∞)
--             + حذف refresh tokens والجلسات المفتوحة (طرد فوري من أي جهاز).
--   إعادة تفعيل → ترجّع الحساب وتشيل الحظر.
-- البيانات التاريخية (حضور/مرتبات/استقطاعات) لا تُمس إطلاقًا.
--
-- ميروان نفسها اتقفلت يدويًا بنفس الخطوات قبل نشر الدالة.
-- طُبقت live على المشروعين (gdgrdwjlxcavogztvxon + hubuvdwhqxuizkyeedab)
-- بتاريخ 2026-07-20.
-- =====================================================================

create or replace function owner_set_employee_active_v1(p_employee_id bigint, p_active boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_name text;
  v_active boolean := coalesce(p_active, true);
  v_uid uuid;
begin
  if not is_hr() then return jsonb_build_object('error','hr_only','message','للإدارة فقط.'); end if;
  update employees set active = v_active where id = p_employee_id returning name into v_name;
  if v_name is null then return jsonb_build_object('error','not_found','message','الموظف غير موجود.'); end if;

  -- Cascade to every login linked to this employee.
  for v_uid in (select user_id from employee_accounts where employee_id = p_employee_id) loop
    update employee_accounts set active = v_active where user_id = v_uid;
    if v_active then
      update auth.users set banned_until = null where id = v_uid;
    else
      update auth.users set banned_until = 'infinity' where id = v_uid;
      delete from auth.refresh_tokens where user_id = v_uid;
      delete from auth.sessions where user_id = v_uid;
    end if;
  end loop;

  insert into audit_log(actor,action,entity,entity_id,details)
  values (auth.uid(), case when v_active then 'reactivate_employee' else 'deactivate_employee' end,
          'employees', p_employee_id::text, jsonb_build_object('name', v_name, 'login_locked', not v_active));
  return jsonb_build_object('ok', true, 'active', v_active, 'name', v_name);
end $$;
revoke all on function owner_set_employee_active_v1(bigint, boolean) from public, anon;
grant execute on function owner_set_employee_active_v1(bigint, boolean) to authenticated, service_role;

-- =====================================================================
--  Air Ocean Line — assistant write helpers (2026-07-13)
--  add_owner_ledger_v1: lets the owner record a personal-ledger debt via
--  the assistant (the دفتر شخصي had no RPC — only the UI inserted directly).
--  Owner-only, SECURITY DEFINER, writes an audit_log row. Direction is
--  normalized: 'lent' = سلّفته/عليه ليا, 'borrowed' = استلفت/عليّ.
-- =====================================================================

create or replace function add_owner_ledger_v1(
  p_person text,
  p_direction text default 'lent',
  p_amount numeric default null,
  p_date date default current_date,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_role text; v_id bigint; v_dir text; v_person text;
begin
  select role into v_role from app_admins where user_id = auth.uid();
  if v_role is distinct from 'owner' then
    return jsonb_build_object('error','owner_only','message','الدفتر الشخصي للـ Owner فقط.');
  end if;
  v_person := nullif(trim(coalesce(p_person,'')),'');
  if v_person is null then
    return jsonb_build_object('error','bad_person','message','اكتب اسم الشخص.');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('error','bad_amount','message','المبلغ غير صحيح.');
  end if;
  v_dir := case when lower(coalesce(p_direction,'')) in ('borrowed','owed_by_us') then 'borrowed' else 'lent' end;
  insert into owner_ledger_entries(person, direction, amount, entry_date, note)
    values (v_person, v_dir, p_amount, coalesce(p_date, current_date), nullif(trim(coalesce(p_note,'')),''))
    returning id into v_id;
  insert into audit_log(actor, action, entity, entity_id, details)
    values (auth.uid(),'add_owner_ledger','owner_ledger_entries', v_id::text,
            jsonb_build_object('person',v_person,'direction',v_dir,'amount',p_amount));
  return jsonb_build_object('ok',true,'id',v_id,'person',v_person,'direction',v_dir,'amount',p_amount,
    'message','تم تسجيل '||case when v_dir='lent' then 'سلفة لـ ' else 'مديونية على ' end||v_person||' بمبلغ '||p_amount::text||' ج في الدفتر الشخصي.');
end $$;

revoke execute on function add_owner_ledger_v1(text,text,numeric,date,text) from public, anon;
grant execute on function add_owner_ledger_v1(text,text,numeric,date,text) to authenticated;

-- =====================================================================
-- Treasury spend → mark its expense paid_from='treasury'
-- ---------------------------------------------------------------------
-- A «صرف من الخزنة» always books a company expense that is, by definition,
-- paid out of the safe. Tag that expense paid_from='treasury' so:
--   * it is labelled «من الخزنة» on the Expenses page, and
--   * editing it via edit_company_expense_v1 keeps the linked treasury
--     'out' instead of _sync_expense_treasury voiding it (which would
--     wrongly restore the safe balance).
-- Only add_treasury_spend_v1 changed (the paid_from value on the insert).
-- Run AFTER v1/supabase-v1-finance-source-edit.sql. Applied live 2026-07-20.
-- =====================================================================

create or replace function add_treasury_spend_v1(
  p_amount numeric default null, p_note text default null,
  p_holder_employee_id bigint default null, p_holder_name text default null,
  p_category text default null, p_date date default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_id bigint;
  v_exp bigint;
  v_holder text;
  v_is_owner boolean := is_owner();
  v_cat text := coalesce(nullif(trim(p_category),''), 'treasury');
  v_desc text := nullif(trim(p_note),'');
begin
  if not is_hr() then
    return jsonb_build_object('error','hr_only','message','الصرف من الخزنة للإدارة فقط.');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('error','bad_amount','message','المبلغ غير صحيح.');
  end if;
  if p_holder_employee_id is not null then
    select name into v_holder from employees where id = p_holder_employee_id;
  end if;
  v_holder := coalesce(v_holder, nullif(trim(p_holder_name),''), 'الخزنة');

  insert into company_expenses(expense_date, category, amount, description, paid_from,
                               created_by, created_by_name, confirmed_by, confirmed_at)
  values (coalesce(p_date, current_date), v_cat, p_amount,
          coalesce('خزنة (' || v_holder || ')' || case when v_desc is not null then ' — ' || v_desc else '' end,
                   'صرف من الخزنة'),
          'treasury',
          auth.uid(), _actor_name(),
          case when v_is_owner then auth.uid() end,
          case when v_is_owner then now() end)
  returning id into v_exp;

  insert into treasury_entries(direction, holder_employee_id, holder_name, amount, note, entry_date,
                               category, expense_id, created_by, created_by_name)
  values ('out', p_holder_employee_id, v_holder, p_amount, v_desc,
          coalesce(p_date, current_date), v_cat, v_exp, auth.uid(), _actor_name())
  returning id into v_id;

  insert into audit_log(actor, action, entity, entity_id, details)
  values (auth.uid(), 'treasury_spend', 'treasury_entries', v_id::text,
          jsonb_build_object('holder', v_holder, 'amount', p_amount, 'expense_id', v_exp, 'category', v_cat));

  if not v_is_owner then
    perform notify_owners('صرف من الخزنة يحتاج تأكيد',
      'اتصرف ' || p_amount || ' ج من الخزنة (' || v_holder || ') سجله ' || _actor_name() || '.');
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'expense_id', v_exp, 'confirmed', v_is_owner);
end $$;
revoke execute on function add_treasury_spend_v1(numeric,text,bigint,text,text,date) from public, anon;
grant execute on function add_treasury_spend_v1(numeric,text,bigint,text,text,date) to authenticated;

-- =====================================================================
-- Treasury: record client cash received at the office (قبض / إيراد)
--           + classify movements + guard against any double-deduction
-- ---------------------------------------------------------------------
-- Owner question: «لو عميل دفع مصاريف شحنة كاش في المكتب أتعامل معاها إزاي؟»
-- The safe (الخزنة) only had two «in» reasons — عهدة (float) — plus «out»
-- (صرف). Cash a client pays at the office is INCOME that should RAISE the
-- safe. This adds a proper «قبض من عميل» movement so recording a client
-- payment increases the cash balance and the company position.
--
-- On the «negative balance»: it was NOT double-counting. Every confirmed
-- treasury expense books exactly one active treasury 'out' (verified live:
-- no duplicate outs, no orphan outs on unconfirmed/voided expenses, and
-- void_financial_v1 already cascades both ways). The safe went negative only
-- because everyday spend slightly exceeded the recorded float AND client
-- income was never captured. A UNIQUE partial index now makes a *second*
-- active 'out' for the same expense impossible — so «edit ثم تأكيد» can never
-- deduct twice, whatever the client does. Applied live 2026-07-20.
-- Run AFTER v1/supabase-v1-finance-source-edit.sql + supabase-v1-treasury.sql.
-- =====================================================================

-- 1) classify every treasury movement: عهدة / قبض عميل / صرف.
alter table treasury_entries add column if not exists entry_kind text;
update treasury_entries
  set entry_kind = case when direction = 'out' then 'spend' else 'custody' end
  where entry_kind is null;
alter table treasury_entries alter column entry_kind set default 'custody';
alter table treasury_entries alter column entry_kind set not null;
alter table treasury_entries drop constraint if exists treasury_entries_entry_kind_check;
alter table treasury_entries add constraint treasury_entries_entry_kind_check
  check (entry_kind in ('custody','income','spend'));

-- 2) a company expense can book at most ONE active treasury 'out'.
--    Defense-in-depth: even a buggy client/RPC can't deduct an expense twice.
create unique index if not exists uq_treasury_active_out_per_expense
  on treasury_entries (expense_id)
  where direction = 'out' and status = 'active' and expense_id is not null;

-- 3) new: record client cash received at the office (raises the safe).
create or replace function add_treasury_income_v1(
  p_amount numeric default null,
  p_note text default null,
  p_client_name text default null,
  p_date date default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_id bigint;
  v_client text := coalesce(nullif(trim(p_client_name),''), 'عميل');
  v_is_owner boolean := is_owner();
begin
  if not is_hr() then
    return jsonb_build_object('error','hr_only','message','تسجيل المقبوضات للإدارة فقط.');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('error','bad_amount','message','المبلغ غير صحيح.');
  end if;

  insert into treasury_entries(direction, entry_kind, holder_name, amount, note, entry_date,
                               created_by, created_by_name)
  values ('in', 'income', v_client, p_amount, nullif(trim(p_note),''),
          coalesce(p_date, current_date), auth.uid(), _actor_name())
  returning id into v_id;

  insert into audit_log(actor, action, entity, entity_id, details)
  values (auth.uid(), 'treasury_income', 'treasury_entries', v_id::text,
          jsonb_build_object('client', v_client, 'amount', p_amount, 'date', coalesce(p_date, current_date)));

  if not v_is_owner then
    perform notify_owners('قبض نقدي جديد في الخزنة',
      'اتسجل قبض ' || p_amount || ' ج من ' || v_client || ' بواسطة ' || _actor_name() || '.');
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'client', v_client);
end $$;
revoke execute on function add_treasury_income_v1(numeric,text,text,date) from public, anon;
grant execute on function add_treasury_income_v1(numeric,text,text,date) to authenticated;

-- 4) tag the two «out» insert paths as 'spend' (column default 'custody' is
--    correct only for «in» rows). Bodies otherwise unchanged.
create or replace function _sync_expense_treasury(p_expense_id bigint)
returns void language plpgsql security definer set search_path=public as $$
declare
  e company_expenses%rowtype;
  v_link bigint;
begin
  select * into e from company_expenses where id = p_expense_id;
  if not found then return; end if;

  select id into v_link from treasury_entries
    where expense_id = p_expense_id and direction = 'out' and status = 'active' limit 1;

  if e.status = 'active' and e.confirmed_at is not null and e.paid_from = 'treasury' then
    if v_link is null then
      insert into treasury_entries(direction, entry_kind, holder_name, amount, note, entry_date,
                                   category, expense_id, created_by, created_by_name)
      values ('out', 'spend', 'الخزنة', e.amount, e.description, e.expense_date,
              e.category, e.id, e.created_by, e.created_by_name);
    else
      update treasury_entries set amount = e.amount, note = e.description,
             entry_date = e.expense_date, category = e.category
      where id = v_link;
    end if;
  elsif v_link is not null then
    -- No longer a confirmed treasury expense → remove its safe impact.
    update treasury_entries set status = 'voided', voided_by = auth.uid(),
           voided_at = now(), void_reason = 'إلغاء ربط الخزنة (تعديل المصروف)'
    where id = v_link;
  end if;
end $$;
revoke execute on function _sync_expense_treasury(bigint) from public, anon;

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

  insert into treasury_entries(direction, entry_kind, holder_employee_id, holder_name, amount, note, entry_date,
                               category, expense_id, created_by, created_by_name)
  values ('out', 'spend', p_holder_employee_id, v_holder, p_amount, v_desc,
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

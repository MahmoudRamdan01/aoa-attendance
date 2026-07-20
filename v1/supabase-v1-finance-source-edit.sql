-- =====================================================================
-- Finance: per-expense payment source + owner edit of all movements
-- ---------------------------------------------------------------------
-- 1) company_expenses.paid_from ('treasury' | 'external'):
--    an expense «paid from the safe» books a treasury 'out' when it is
--    confirmed, so the safe balance reflects it. «external» ones don't
--    touch the safe (bank/other). Existing treasury-spend expenses are
--    backfilled to 'treasury' (they already have a linked treasury row).
-- 2) add_company_expense_v1 / confirm_expense_v1 book the treasury 'out'
--    for treasury-paid expenses (once, no double count vs add_treasury_spend).
-- 3) Owner edit RPCs for every financial movement (audit-logged):
--    expenses, treasury entries, canteen, other deductions, loans.
-- 4) Fixes a latent bug: allow category 'treasury' on company_expenses.
-- Run AFTER v1/supabase-financial-migration.sql + supabase-v1-treasury.sql.
-- =====================================================================

-- 4) category check must allow 'treasury' (add_treasury_spend_v1 uses it).
alter table company_expenses drop constraint if exists company_expenses_category_check;
alter table company_expenses add constraint company_expenses_category_check
  check (category in ('water','electricity','gas','internet','rent','maintenance','stationery','other','treasury'));

-- 1) payment source column + backfill.
alter table company_expenses add column if not exists paid_from text
  not null default 'external' check (paid_from in ('treasury','external'));
update company_expenses c set paid_from = 'treasury'
  where paid_from <> 'treasury'
    and exists (select 1 from treasury_entries t where t.expense_id = c.id);

-- Helper: book / refresh / drop the treasury 'out' that mirrors a
-- treasury-paid confirmed expense. Idempotent for a given expense id.
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
      insert into treasury_entries(direction, holder_name, amount, note, entry_date,
                                   category, expense_id, created_by, created_by_name)
      values ('out', 'الخزنة', e.amount, e.description, e.expense_date,
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

-- 2a) add_company_expense_v1 gains p_paid_from and books the safe 'out'
--     when the owner records a confirmed treasury expense.
create or replace function add_company_expense_v1(
  p_date date,
  p_category text,
  p_amount numeric,
  p_description text default null,
  p_paid_from text default 'external'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_id bigint;
  v_is_owner boolean := is_owner();
  v_source text := case when p_paid_from = 'treasury' then 'treasury' else 'external' end;
begin
  if not is_hr() then
    return jsonb_build_object('error','hr_only','message','تسجيل المصروفات للإدارة فقط.');
  end if;
  if p_category is null or p_category not in ('water','electricity','gas','internet','rent','maintenance','stationery','other') then
    return jsonb_build_object('error','bad_category','message','بند المصروف غير صحيح.');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('error','bad_amount','message','المبلغ غير صحيح.');
  end if;

  insert into company_expenses(expense_date, category, amount, description, paid_from,
                               created_by, created_by_name, confirmed_by, confirmed_at)
  values (coalesce(p_date, current_date), p_category, p_amount, nullif(trim(p_description),''), v_source,
          auth.uid(), _actor_name(),
          case when v_is_owner then auth.uid() end,
          case when v_is_owner then now() end)
  returning id into v_id;

  if v_is_owner then perform _sync_expense_treasury(v_id); end if;

  insert into audit_log(actor, action, entity, entity_id, details)
  values (auth.uid(), 'add_expense', 'company_expenses', v_id::text,
          jsonb_build_object('category', p_category, 'amount', p_amount, 'date', p_date, 'paid_from', v_source));

  if not v_is_owner then
    perform notify_owners('مصروف جديد يحتاج تأكيد',
      'مصروف ' || p_category || ' بمبلغ ' || p_amount || ' ج سجله ' || _actor_name() || '.');
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'confirmed', v_is_owner, 'paid_from', v_source);
end $$;
revoke execute on function add_company_expense_v1(date,text,numeric,text,text) from public, anon;
grant execute on function add_company_expense_v1(date,text,numeric,text,text) to authenticated;

-- 2b) confirm books the treasury 'out' for treasury-paid expenses.
create or replace function confirm_expense_v1(p_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_row company_expenses%rowtype;
begin
  if not is_owner() then
    return jsonb_build_object('error','owner_only','message','تأكيد المصروفات Owner فقط.');
  end if;
  select * into v_row from company_expenses where id = p_id;
  if not found then return jsonb_build_object('error','not_found','message','المصروف غير موجود.'); end if;
  if v_row.status = 'voided' then return jsonb_build_object('error','voided','message','المصروف ملغي.'); end if;
  if v_row.confirmed_at is not null then return jsonb_build_object('error','already_confirmed','message','المصروف مؤكد بالفعل.'); end if;

  update company_expenses set confirmed_by = auth.uid(), confirmed_at = now() where id = p_id;
  perform _sync_expense_treasury(p_id);

  insert into audit_log(actor, action, entity, entity_id, details)
  values (auth.uid(), 'confirm_expense', 'company_expenses', p_id::text, '{}'::jsonb);

  return jsonb_build_object('ok', true);
end $$;
revoke execute on function confirm_expense_v1(bigint) from public, anon;
grant execute on function confirm_expense_v1(bigint) to authenticated;

-- 3) Owner edit RPCs -----------------------------------------------------

create or replace function edit_company_expense_v1(
  p_id bigint, p_date date, p_category text, p_amount numeric,
  p_description text, p_paid_from text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_old jsonb; v_source text := case when p_paid_from='treasury' then 'treasury' else 'external' end;
begin
  if not is_owner() then return jsonb_build_object('error','owner_only','message','التعديل Owner فقط.'); end if;
  select to_jsonb(t) into v_old from company_expenses t where id = p_id and status = 'active';
  if v_old is null then return jsonb_build_object('error','not_found','message','المصروف غير موجود أو ملغي.'); end if;
  if p_category not in ('water','electricity','gas','internet','rent','maintenance','stationery','other','treasury') then
    return jsonb_build_object('error','bad_category','message','بند غير صحيح.'); end if;
  if p_amount is null or p_amount <= 0 then return jsonb_build_object('error','bad_amount','message','المبلغ غير صحيح.'); end if;

  update company_expenses set expense_date = coalesce(p_date, expense_date), category = p_category,
         amount = p_amount, description = nullif(trim(p_description),''), paid_from = v_source
  where id = p_id;
  perform _sync_expense_treasury(p_id);

  insert into audit_log(actor, action, entity, entity_id, details)
  values (auth.uid(), 'edit_expense', 'company_expenses', p_id::text,
          jsonb_build_object('old', v_old, 'new', jsonb_build_object('date',p_date,'category',p_category,'amount',p_amount,'paid_from',v_source)));
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function edit_company_expense_v1(bigint,date,text,numeric,text,text) from public, anon;
grant execute on function edit_company_expense_v1(bigint,date,text,numeric,text,text) to authenticated;

create or replace function edit_treasury_entry_v1(
  p_id bigint, p_amount numeric, p_note text, p_date date,
  p_holder_employee_id bigint, p_holder_name text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_old jsonb; v_holder text; v_exp bigint;
begin
  if not is_owner() then return jsonb_build_object('error','owner_only','message','التعديل Owner فقط.'); end if;
  select to_jsonb(t), t.expense_id into v_old, v_exp from treasury_entries t where id = p_id and status = 'active';
  if v_old is null then return jsonb_build_object('error','not_found','message','الحركة غير موجودة أو ملغاة.'); end if;
  if p_amount is null or p_amount <= 0 then return jsonb_build_object('error','bad_amount','message','المبلغ غير صحيح.'); end if;
  if p_holder_employee_id is not null then select name into v_holder from employees where id = p_holder_employee_id; end if;
  v_holder := coalesce(v_holder, nullif(trim(p_holder_name),''), 'الخزنة');

  update treasury_entries set amount = p_amount, note = nullif(trim(p_note),''),
         entry_date = coalesce(p_date, entry_date),
         holder_employee_id = p_holder_employee_id, holder_name = v_holder
  where id = p_id;
  -- Keep a linked company expense (from a treasury spend) in sync.
  if v_exp is not null then
    update company_expenses set amount = p_amount, expense_date = coalesce(p_date, expense_date)
    where id = v_exp and status = 'active';
  end if;

  insert into audit_log(actor, action, entity, entity_id, details)
  values (auth.uid(), 'edit_treasury', 'treasury_entries', p_id::text,
          jsonb_build_object('old', v_old, 'new', jsonb_build_object('amount',p_amount,'holder',v_holder,'date',p_date)));
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function edit_treasury_entry_v1(bigint,numeric,text,date,bigint,text) from public, anon;
grant execute on function edit_treasury_entry_v1(bigint,numeric,text,date,bigint,text) to authenticated;

create or replace function edit_canteen_entry_v1(
  p_id bigint, p_item text, p_amount numeric, p_date date, p_note text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_old jsonb;
begin
  if not is_owner() then return jsonb_build_object('error','owner_only','message','التعديل Owner فقط.'); end if;
  select to_jsonb(t) into v_old from canteen_entries t where id = p_id and status = 'active';
  if v_old is null then return jsonb_build_object('error','not_found','message','السجل غير موجود أو ملغي.'); end if;
  if p_amount is null or p_amount <= 0 then return jsonb_build_object('error','bad_amount','message','المبلغ غير صحيح.'); end if;
  if coalesce(trim(p_item),'') = '' then return jsonb_build_object('error','bad_item','message','اكتب الصنف.'); end if;
  update canteen_entries set item = trim(p_item), amount = p_amount,
         entry_date = coalesce(p_date, entry_date), note = nullif(trim(p_note),'') where id = p_id;
  insert into audit_log(actor, action, entity, entity_id, details)
  values (auth.uid(), 'edit_canteen', 'canteen_entries', p_id::text, jsonb_build_object('old', v_old, 'amount', p_amount));
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function edit_canteen_entry_v1(bigint,text,numeric,date,text) from public, anon;
grant execute on function edit_canteen_entry_v1(bigint,text,numeric,date,text) to authenticated;

create or replace function edit_other_deduction_v1(
  p_id bigint, p_category text, p_amount numeric, p_date date, p_note text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_old jsonb;
begin
  if not is_owner() then return jsonb_build_object('error','owner_only','message','التعديل Owner فقط.'); end if;
  select to_jsonb(t) into v_old from other_deductions t where id = p_id and status = 'active';
  if v_old is null then return jsonb_build_object('error','not_found','message','السجل غير موجود أو ملغي.'); end if;
  if p_category not in ('damage','penalty','uniform','other') then return jsonb_build_object('error','bad_category','message','نوع غير صحيح.'); end if;
  if p_amount is null or p_amount <= 0 then return jsonb_build_object('error','bad_amount','message','المبلغ غير صحيح.'); end if;
  update other_deductions set category = p_category, amount = p_amount,
         entry_date = coalesce(p_date, entry_date), note = nullif(trim(p_note),'') where id = p_id;
  insert into audit_log(actor, action, entity, entity_id, details)
  values (auth.uid(), 'edit_other', 'other_deductions', p_id::text, jsonb_build_object('old', v_old, 'amount', p_amount));
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function edit_other_deduction_v1(bigint,text,numeric,date,text) from public, anon;
grant execute on function edit_other_deduction_v1(bigint,text,numeric,date,text) to authenticated;

-- Editing a loan regenerates its installment schedule from scratch.
create or replace function edit_loan_v1(
  p_id bigint, p_amount numeric, p_installments int, p_start_month text, p_note text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_old jsonb; v_emp bigint; v_base numeric(12,2); v_last numeric(12,2); i int;
begin
  if not is_owner() then return jsonb_build_object('error','owner_only','message','التعديل Owner فقط.'); end if;
  select to_jsonb(t), t.employee_id into v_old, v_emp from emp_loans t where id = p_id and status = 'active';
  if v_old is null then return jsonb_build_object('error','not_found','message','السلفة غير موجودة أو ملغاة.'); end if;
  if p_amount is null or p_amount <= 0 then return jsonb_build_object('error','bad_amount','message','المبلغ غير صحيح.'); end if;
  if p_installments is null or p_installments < 1 or p_installments > 60 then
    return jsonb_build_object('error','bad_installments','message','عدد الأقساط من 1 إلى 60.'); end if;
  if p_start_month is null or p_start_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    return jsonb_build_object('error','bad_month','message','شهر البداية غير صحيح (YYYY-MM).'); end if;

  v_base := trunc(p_amount / p_installments, 2);
  v_last := p_amount - v_base * (p_installments - 1);
  if v_base <= 0 or v_last <= 0 then return jsonb_build_object('error','rounding','message','تعذر توزيع الأقساط.'); end if;

  update emp_loans set amount = p_amount, installments_count = p_installments,
         start_month = p_start_month, note = nullif(trim(p_note),'') where id = p_id;
  delete from emp_loan_installments where loan_id = p_id;
  for i in 1..p_installments loop
    insert into emp_loan_installments(loan_id, employee_id, seq, due_month, amount)
    values (p_id, v_emp, i,
            to_char((p_start_month || '-01')::date + make_interval(months => i - 1), 'YYYY-MM'),
            case when i = p_installments then v_last else v_base end);
  end loop;

  insert into audit_log(actor, action, entity, entity_id, details)
  values (auth.uid(), 'edit_loan', 'emp_loans', p_id::text, jsonb_build_object('old', v_old, 'amount', p_amount, 'installments', p_installments));
  return jsonb_build_object('ok', true, 'installment', v_base, 'last_installment', v_last);
end $$;
revoke execute on function edit_loan_v1(bigint,numeric,int,text,text) from public, anon;
grant execute on function edit_loan_v1(bigint,numeric,int,text,text) to authenticated;

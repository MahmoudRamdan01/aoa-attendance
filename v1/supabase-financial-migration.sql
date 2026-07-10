-- ============================================================================
-- AOA Financial modules migration (v1)
-- الاستقطاعات (سلف/كانتين/أخرى) + المصروفات + مديونية Air Ocean + دفتر الـ Owner
--
-- Idempotent: safe to re-run. Run AFTER supabase-schema.sql and
-- v1/supabase-v1-migration.sql (relies on is_hr/is_owner/current_employee_id,
-- audit_log, notify_user/notify_owners, employee_accounts).
--
-- Security model:
--   * emp_loans / emp_loan_installments ....... owner + the employee himself (NO hr)
--   * canteen_entries / other_deductions ...... hr + the employee himself
--   * company_expenses / partner_* ............ hr only
--   * owner_ledger_* ........................... owner only (direct CRUD)
--   * All writes to shared tables go through SECURITY DEFINER RPCs below.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------

create table if not exists emp_loans (
  id bigint generated always as identity primary key,
  employee_id bigint not null references employees(id),
  amount numeric(12,2) not null check (amount > 0),
  installments_count int not null check (installments_count between 1 and 60),
  start_month text not null check (start_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  note text,
  status text not null default 'active' check (status in ('active','voided')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  voided_by uuid,
  voided_at timestamptz,
  void_reason text
);
create index if not exists idx_emp_loans_emp on emp_loans(employee_id);

create table if not exists emp_loan_installments (
  id bigint generated always as identity primary key,
  loan_id bigint not null references emp_loans(id) on delete cascade,
  employee_id bigint not null references employees(id),
  seq int not null,
  due_month text not null check (due_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount numeric(12,2) not null check (amount > 0),
  unique (loan_id, seq)
);
create index if not exists idx_loan_inst_emp_month on emp_loan_installments(employee_id, due_month);

create table if not exists canteen_entries (
  id bigint generated always as identity primary key,
  employee_id bigint not null references employees(id),
  item text not null,
  amount numeric(12,2) not null check (amount > 0),
  entry_date date not null default current_date,
  note text,
  status text not null default 'active' check (status in ('active','voided')),
  created_by uuid references auth.users(id),
  created_by_name text,
  created_at timestamptz not null default now(),
  voided_by uuid,
  voided_at timestamptz,
  void_reason text
);
create index if not exists idx_canteen_emp_date on canteen_entries(employee_id, entry_date);
create index if not exists idx_canteen_date on canteen_entries(entry_date);

create table if not exists other_deductions (
  id bigint generated always as identity primary key,
  employee_id bigint not null references employees(id),
  category text not null check (category in ('damage','penalty','uniform','other')),
  amount numeric(12,2) not null check (amount > 0),
  entry_date date not null default current_date,
  note text,
  status text not null default 'active' check (status in ('active','voided')),
  created_by uuid references auth.users(id),
  created_by_name text,
  created_at timestamptz not null default now(),
  voided_by uuid,
  voided_at timestamptz,
  void_reason text
);
create index if not exists idx_otherded_emp_date on other_deductions(employee_id, entry_date);

create table if not exists company_expenses (
  id bigint generated always as identity primary key,
  expense_date date not null default current_date,
  category text not null check (category in ('water','electricity','gas','internet','rent','maintenance','stationery','other')),
  amount numeric(12,2) not null check (amount > 0),
  description text,
  created_by uuid references auth.users(id),
  created_by_name text,
  created_at timestamptz not null default now(),
  confirmed_by uuid,
  confirmed_at timestamptz,
  status text not null default 'active' check (status in ('active','voided')),
  voided_by uuid,
  voided_at timestamptz,
  void_reason text
);
create index if not exists idx_expenses_date on company_expenses(expense_date);

create table if not exists partner_ledger_entries (
  id bigint generated always as identity primary key,
  direction text not null check (direction in ('owed_to_us','owed_by_us')),
  kind text not null check (kind in ('invoice','loan','deal','other')),
  amount numeric(12,2) not null check (amount > 0),
  entry_date date not null default current_date,
  description text not null,
  due_date date,
  created_by uuid references auth.users(id),
  created_by_name text,
  created_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','voided')),
  voided_by uuid,
  voided_at timestamptz,
  void_reason text
);
create index if not exists idx_partner_entries_date on partner_ledger_entries(entry_date);

create table if not exists partner_settlements (
  id bigint generated always as identity primary key,
  entry_id bigint not null references partner_ledger_entries(id),
  amount numeric(12,2) not null check (amount > 0),
  settle_date date not null default current_date,
  note text,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected','voided')),
  created_by uuid references auth.users(id),
  created_by_name text,
  created_at timestamptz not null default now(),
  confirmed_by uuid,
  confirmed_at timestamptz,
  decision_note text,
  voided_by uuid,
  voided_at timestamptz,
  void_reason text
);
create index if not exists idx_partner_settlements_entry on partner_settlements(entry_id);

create table if not exists owner_ledger_entries (
  id bigint generated always as identity primary key,
  person text not null,
  direction text not null default 'lent' check (direction in ('lent','borrowed')),
  amount numeric(12,2) not null check (amount > 0),
  entry_date date not null default current_date,
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists owner_ledger_payments (
  id bigint generated always as identity primary key,
  entry_id bigint not null references owner_ledger_entries(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  pay_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2) RLS
-- ---------------------------------------------------------------------------

alter table emp_loans enable row level security;
alter table emp_loan_installments enable row level security;
alter table canteen_entries enable row level security;
alter table other_deductions enable row level security;
alter table company_expenses enable row level security;
alter table partner_ledger_entries enable row level security;
alter table partner_settlements enable row level security;
alter table owner_ledger_entries enable row level security;
alter table owner_ledger_payments enable row level security;

-- Loans: owner + the employee only. Deliberately NOT is_hr() — salary-adjacent.
drop policy if exists emp_loans_select on emp_loans;
create policy emp_loans_select on emp_loans for select to authenticated
using (is_owner() or employee_id = current_employee_id());

drop policy if exists emp_loan_inst_select on emp_loan_installments;
create policy emp_loan_inst_select on emp_loan_installments for select to authenticated
using (is_owner() or employee_id = current_employee_id());

drop policy if exists canteen_select on canteen_entries;
create policy canteen_select on canteen_entries for select to authenticated
using (is_hr() or employee_id = current_employee_id());

drop policy if exists other_ded_select on other_deductions;
create policy other_ded_select on other_deductions for select to authenticated
using (is_hr() or employee_id = current_employee_id());

drop policy if exists expenses_select on company_expenses;
create policy expenses_select on company_expenses for select to authenticated
using (is_hr());

drop policy if exists partner_entries_select on partner_ledger_entries;
create policy partner_entries_select on partner_ledger_entries for select to authenticated
using (is_hr());

drop policy if exists partner_settlements_select on partner_settlements;
create policy partner_settlements_select on partner_settlements for select to authenticated
using (is_hr());

-- Owner personal notebook: owner only, full direct CRUD.
drop policy if exists owner_ledger_entries_all on owner_ledger_entries;
create policy owner_ledger_entries_all on owner_ledger_entries for all to authenticated
using (is_owner()) with check (is_owner());

drop policy if exists owner_ledger_payments_all on owner_ledger_payments;
create policy owner_ledger_payments_all on owner_ledger_payments for all to authenticated
using (is_owner()) with check (is_owner());

grant select on emp_loans, emp_loan_installments, canteen_entries, other_deductions,
  company_expenses, partner_ledger_entries, partner_settlements to authenticated;
grant select, insert, update, delete on owner_ledger_entries, owner_ledger_payments to authenticated;

-- Identity sequences created above postdate the old blanket grant — re-run it.
grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Helpers
-- ---------------------------------------------------------------------------

-- Display name of the acting admin (app_admins own-row RLS blocks client joins,
-- so we denormalize at write time inside the definer functions).
create or replace function _actor_name()
returns text language sql stable security definer set search_path=public as $$
  select coalesce(
    (select name from app_admins where user_id = auth.uid()),
    (select email from auth.users where id = auth.uid()),
    'غير معروف'
  );
$$;
revoke execute on function _actor_name() from public, anon;
grant execute on function _actor_name() to authenticated;

-- ---------------------------------------------------------------------------
-- 4) RPCs — الاستقطاعات
-- ---------------------------------------------------------------------------

create or replace function add_loan_v1(
  p_employee_id bigint,
  p_amount numeric,
  p_installments int,
  p_start_month text,
  p_note text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_emp employees%rowtype;
  v_loan_id bigint;
  v_base numeric(12,2);
  v_last numeric(12,2);
  v_user uuid;
  i int;
begin
  if not is_owner() then
    return jsonb_build_object('error','owner_only','message','تسجيل السلف Owner فقط.');
  end if;
  select * into v_emp from employees where id = p_employee_id;
  if not found or v_emp.active is distinct from true then
    return jsonb_build_object('error','bad_employee','message','الموظف غير موجود أو غير نشط.');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('error','bad_amount','message','المبلغ غير صحيح.');
  end if;
  if p_installments is null or p_installments < 1 or p_installments > 60 then
    return jsonb_build_object('error','bad_installments','message','عدد الأقساط من 1 إلى 60.');
  end if;
  if p_start_month is null or p_start_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    return jsonb_build_object('error','bad_month','message','شهر البداية غير صحيح (YYYY-MM).');
  end if;

  v_base := trunc(p_amount / p_installments, 2);
  v_last := p_amount - v_base * (p_installments - 1);
  if v_base <= 0 or v_last <= 0 or (v_base * (p_installments - 1) + v_last) <> p_amount then
    return jsonb_build_object('error','rounding','message','تعذر توزيع الأقساط — راجع المبلغ وعدد الأقساط.');
  end if;

  insert into emp_loans(employee_id, amount, installments_count, start_month, note, created_by)
  values (p_employee_id, p_amount, p_installments, p_start_month, nullif(trim(p_note),''), auth.uid())
  returning id into v_loan_id;

  for i in 1..p_installments loop
    insert into emp_loan_installments(loan_id, employee_id, seq, due_month, amount)
    values (
      v_loan_id,
      p_employee_id,
      i,
      to_char((p_start_month || '-01')::date + make_interval(months => i - 1), 'YYYY-MM'),
      case when i = p_installments then v_last else v_base end
    );
  end loop;

  insert into audit_log(actor, action, entity, entity_id, details)
  values (auth.uid(), 'add_loan', 'emp_loans', v_loan_id::text,
          jsonb_build_object('employee_id', p_employee_id, 'amount', p_amount,
                             'installments', p_installments, 'start_month', p_start_month));

  select user_id into v_user from employee_accounts where employee_id = p_employee_id and active limit 1;
  perform notify_user(v_user, 'تم تسجيل سلفة',
    'سلفة بمبلغ ' || p_amount || ' ج على ' || p_installments || ' قسط بداية من ' || p_start_month || '.');

  return jsonb_build_object('ok', true, 'loan_id', v_loan_id,
                            'installment', v_base, 'last_installment', v_last);
end $$;
revoke execute on function add_loan_v1(bigint,numeric,int,text,text) from public, anon;
grant execute on function add_loan_v1(bigint,numeric,int,text,text) to authenticated;

create or replace function add_canteen_entry_v1(
  p_employee_id bigint,
  p_item text,
  p_amount numeric,
  p_date date default current_date,
  p_note text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_id bigint;
  v_user uuid;
begin
  if not is_hr() then
    return jsonb_build_object('error','hr_only','message','تسجيل الكانتين للإدارة فقط.');
  end if;
  if not exists (select 1 from employees where id = p_employee_id) then
    return jsonb_build_object('error','bad_employee','message','الموظف غير موجود.');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('error','bad_amount','message','المبلغ غير صحيح.');
  end if;
  if p_item is null or trim(p_item) = '' then
    return jsonb_build_object('error','bad_item','message','اكتب الصنف.');
  end if;

  insert into canteen_entries(employee_id, item, amount, entry_date, note, created_by, created_by_name)
  values (p_employee_id, trim(p_item), p_amount, coalesce(p_date, current_date),
          nullif(trim(p_note),''), auth.uid(), _actor_name())
  returning id into v_id;

  insert into audit_log(actor, action, entity, entity_id, details)
  values (auth.uid(), 'add_canteen', 'canteen_entries', v_id::text,
          jsonb_build_object('employee_id', p_employee_id, 'item', p_item, 'amount', p_amount));

  select user_id into v_user from employee_accounts where employee_id = p_employee_id and active limit 1;
  perform notify_user(v_user, 'استقطاع كانتين',
    trim(p_item) || ' بمبلغ ' || p_amount || ' ج — سيُخصم من مرتب الشهر.');

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke execute on function add_canteen_entry_v1(bigint,text,numeric,date,text) from public, anon;
grant execute on function add_canteen_entry_v1(bigint,text,numeric,date,text) to authenticated;

create or replace function add_other_deduction_v1(
  p_employee_id bigint,
  p_category text,
  p_amount numeric,
  p_date date default current_date,
  p_note text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_id bigint;
  v_user uuid;
begin
  if not is_hr() then
    return jsonb_build_object('error','hr_only','message','تسجيل الاستقطاعات للإدارة فقط.');
  end if;
  if not exists (select 1 from employees where id = p_employee_id) then
    return jsonb_build_object('error','bad_employee','message','الموظف غير موجود.');
  end if;
  if p_category is null or p_category not in ('damage','penalty','uniform','other') then
    return jsonb_build_object('error','bad_category','message','نوع الاستقطاع غير صحيح.');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('error','bad_amount','message','المبلغ غير صحيح.');
  end if;

  insert into other_deductions(employee_id, category, amount, entry_date, note, created_by, created_by_name)
  values (p_employee_id, p_category, p_amount, coalesce(p_date, current_date),
          nullif(trim(p_note),''), auth.uid(), _actor_name())
  returning id into v_id;

  insert into audit_log(actor, action, entity, entity_id, details)
  values (auth.uid(), 'add_other_deduction', 'other_deductions', v_id::text,
          jsonb_build_object('employee_id', p_employee_id, 'category', p_category, 'amount', p_amount));

  select user_id into v_user from employee_accounts where employee_id = p_employee_id and active limit 1;
  perform notify_user(v_user, 'استقطاع جديد',
    'تم تسجيل استقطاع بمبلغ ' || p_amount || ' ج — سيُخصم من مرتب الشهر.');

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke execute on function add_other_deduction_v1(bigint,text,numeric,date,text) from public, anon;
grant execute on function add_other_deduction_v1(bigint,text,numeric,date,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) RPCs — المصروفات
-- ---------------------------------------------------------------------------

create or replace function add_company_expense_v1(
  p_date date,
  p_category text,
  p_amount numeric,
  p_description text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_id bigint;
  v_is_owner boolean := is_owner();
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

  insert into company_expenses(expense_date, category, amount, description,
                               created_by, created_by_name, confirmed_by, confirmed_at)
  values (coalesce(p_date, current_date), p_category, p_amount, nullif(trim(p_description),''),
          auth.uid(), _actor_name(),
          case when v_is_owner then auth.uid() end,
          case when v_is_owner then now() end)
  returning id into v_id;

  insert into audit_log(actor, action, entity, entity_id, details)
  values (auth.uid(), 'add_expense', 'company_expenses', v_id::text,
          jsonb_build_object('category', p_category, 'amount', p_amount, 'date', p_date));

  if not v_is_owner then
    perform notify_owners('مصروف جديد يحتاج تأكيد',
      'مصروف ' || p_category || ' بمبلغ ' || p_amount || ' ج سجله ' || _actor_name() || '.');
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'confirmed', v_is_owner);
end $$;
revoke execute on function add_company_expense_v1(date,text,numeric,text) from public, anon;
grant execute on function add_company_expense_v1(date,text,numeric,text) to authenticated;

create or replace function confirm_expense_v1(p_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_row company_expenses%rowtype;
begin
  if not is_owner() then
    return jsonb_build_object('error','owner_only','message','تأكيد المصروفات Owner فقط.');
  end if;
  select * into v_row from company_expenses where id = p_id;
  if not found then
    return jsonb_build_object('error','not_found','message','المصروف غير موجود.');
  end if;
  if v_row.status = 'voided' then
    return jsonb_build_object('error','voided','message','المصروف ملغي.');
  end if;
  if v_row.confirmed_at is not null then
    return jsonb_build_object('error','already_confirmed','message','المصروف مؤكد بالفعل.');
  end if;

  update company_expenses set confirmed_by = auth.uid(), confirmed_at = now() where id = p_id;

  insert into audit_log(actor, action, entity, entity_id, details)
  values (auth.uid(), 'confirm_expense', 'company_expenses', p_id::text, '{}'::jsonb);

  return jsonb_build_object('ok', true);
end $$;
revoke execute on function confirm_expense_v1(bigint) from public, anon;
grant execute on function confirm_expense_v1(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) RPCs — مديونية Air Ocean
-- ---------------------------------------------------------------------------

create or replace function add_partner_entry_v1(
  p_direction text,
  p_kind text,
  p_amount numeric,
  p_date date,
  p_description text,
  p_due_date date default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_id bigint;
begin
  if not is_hr() then
    return jsonb_build_object('error','hr_only','message','تسجيل قيود المديونية للإدارة فقط.');
  end if;
  if p_direction is null or p_direction not in ('owed_to_us','owed_by_us') then
    return jsonb_build_object('error','bad_direction','message','اتجاه القيد غير صحيح.');
  end if;
  if p_kind is null or p_kind not in ('invoice','loan','deal','other') then
    return jsonb_build_object('error','bad_kind','message','نوع القيد غير صحيح.');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('error','bad_amount','message','المبلغ غير صحيح.');
  end if;
  if p_description is null or trim(p_description) = '' then
    return jsonb_build_object('error','bad_description','message','اكتب وصف القيد — مفيش حاجة تتسجل من غير وصف.');
  end if;

  insert into partner_ledger_entries(direction, kind, amount, entry_date, description, due_date,
                                     created_by, created_by_name)
  values (p_direction, p_kind, p_amount, coalesce(p_date, current_date), trim(p_description),
          p_due_date, auth.uid(), _actor_name())
  returning id into v_id;

  insert into audit_log(actor, action, entity, entity_id, details)
  values (auth.uid(), 'add_partner_entry', 'partner_ledger_entries', v_id::text,
          jsonb_build_object('direction', p_direction, 'kind', p_kind, 'amount', p_amount));

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke execute on function add_partner_entry_v1(text,text,numeric,date,text,date) from public, anon;
grant execute on function add_partner_entry_v1(text,text,numeric,date,text,date) to authenticated;

create or replace function add_partner_settlement_v1(
  p_entry_id bigint,
  p_amount numeric,
  p_date date default current_date,
  p_note text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_entry partner_ledger_entries%rowtype;
  v_committed numeric;
  v_remaining numeric;
  v_id bigint;
  v_is_owner boolean := is_owner();
begin
  if not is_hr() then
    return jsonb_build_object('error','hr_only','message','تسجيل السدادات للإدارة فقط.');
  end if;
  select * into v_entry from partner_ledger_entries where id = p_entry_id;
  if not found then
    return jsonb_build_object('error','not_found','message','القيد غير موجود.');
  end if;
  if v_entry.status = 'voided' then
    return jsonb_build_object('error','voided','message','القيد ملغي.');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('error','bad_amount','message','المبلغ غير صحيح.');
  end if;

  select coalesce(sum(amount), 0) into v_committed
  from partner_settlements
  where entry_id = p_entry_id and status in ('pending','confirmed');
  v_remaining := v_entry.amount - v_committed;
  if p_amount > v_remaining then
    return jsonb_build_object('error','over','message',
      'المبلغ أكبر من المتبقي على القيد (' || v_remaining || ' ج).');
  end if;

  insert into partner_settlements(entry_id, amount, settle_date, note, status,
                                  created_by, created_by_name, confirmed_by, confirmed_at)
  values (p_entry_id, p_amount, coalesce(p_date, current_date), nullif(trim(p_note),''),
          case when v_is_owner then 'confirmed' else 'pending' end,
          auth.uid(), _actor_name(),
          case when v_is_owner then auth.uid() end,
          case when v_is_owner then now() end)
  returning id into v_id;

  insert into audit_log(actor, action, entity, entity_id, details)
  values (auth.uid(), 'add_partner_settlement', 'partner_settlements', v_id::text,
          jsonb_build_object('entry_id', p_entry_id, 'amount', p_amount,
                             'auto_confirmed', v_is_owner));

  if not v_is_owner then
    perform notify_owners('سداد جديد يحتاج تأكيد',
      'سداد بمبلغ ' || p_amount || ' ج على قيد "' || v_entry.description || '" سجله ' || _actor_name() || '.');
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'confirmed', v_is_owner);
end $$;
revoke execute on function add_partner_settlement_v1(bigint,numeric,date,text) from public, anon;
grant execute on function add_partner_settlement_v1(bigint,numeric,date,text) to authenticated;

create or replace function decide_partner_settlement_v1(
  p_id bigint,
  p_approve boolean,
  p_note text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_row partner_settlements%rowtype;
  v_entry partner_ledger_entries%rowtype;
  v_confirmed numeric;
begin
  if not is_owner() then
    return jsonb_build_object('error','owner_only','message','تأكيد السدادات Owner فقط.');
  end if;
  select * into v_row from partner_settlements where id = p_id;
  if not found then
    return jsonb_build_object('error','not_found','message','السداد غير موجود.');
  end if;
  if v_row.status <> 'pending' then
    return jsonb_build_object('error','already_decided','message','تم البت في السداد بالفعل.');
  end if;

  if p_approve then
    select * into v_entry from partner_ledger_entries where id = v_row.entry_id;
    select coalesce(sum(amount), 0) into v_confirmed
    from partner_settlements where entry_id = v_row.entry_id and status = 'confirmed';
    if v_row.amount > v_entry.amount - v_confirmed then
      return jsonb_build_object('error','over','message',
        'المبلغ أصبح أكبر من المتبقي المؤكد على القيد — راجع السدادات.');
    end if;
    update partner_settlements
    set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now(),
        decision_note = nullif(trim(p_note),'')
    where id = p_id;
  else
    update partner_settlements
    set status = 'rejected', confirmed_by = auth.uid(), confirmed_at = now(),
        decision_note = nullif(trim(p_note),'')
    where id = p_id;
  end if;

  insert into audit_log(actor, action, entity, entity_id, details)
  values (auth.uid(), 'decide_partner_settlement', 'partner_settlements', p_id::text,
          jsonb_build_object('approve', p_approve));

  return jsonb_build_object('ok', true, 'status', case when p_approve then 'confirmed' else 'rejected' end);
end $$;
revoke execute on function decide_partner_settlement_v1(bigint,boolean,text) from public, anon;
grant execute on function decide_partner_settlement_v1(bigint,boolean,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Generic void
-- ---------------------------------------------------------------------------

create or replace function void_financial_v1(p_kind text, p_id bigint, p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_is_owner boolean := is_owner();
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_created_by uuid;
  v_created_at timestamptz;
  v_status text;
  v_confirmed timestamptz;
  v_old jsonb;
begin
  if not is_hr() then
    return jsonb_build_object('error','hr_only','message','الإلغاء للإدارة فقط.');
  end if;
  if p_reason is null or trim(p_reason) = '' then
    return jsonb_build_object('error','no_reason','message','سبب الإلغاء إجباري.');
  end if;
  if p_kind not in ('loan','canteen','other','expense','partner_entry','partner_settlement') then
    return jsonb_build_object('error','bad_kind','message','نوع غير معروف.');
  end if;

  -- Load the row + ownership metadata per kind.
  if p_kind = 'loan' then
    select created_by, created_at, status, null::timestamptz, to_jsonb(t)
      into v_created_by, v_created_at, v_status, v_confirmed, v_old
    from emp_loans t where id = p_id;
  elsif p_kind = 'canteen' then
    select created_by, created_at, status, null::timestamptz, to_jsonb(t)
      into v_created_by, v_created_at, v_status, v_confirmed, v_old
    from canteen_entries t where id = p_id;
  elsif p_kind = 'other' then
    select created_by, created_at, status, null::timestamptz, to_jsonb(t)
      into v_created_by, v_created_at, v_status, v_confirmed, v_old
    from other_deductions t where id = p_id;
  elsif p_kind = 'expense' then
    select created_by, created_at, status, confirmed_at, to_jsonb(t)
      into v_created_by, v_created_at, v_status, v_confirmed, v_old
    from company_expenses t where id = p_id;
  elsif p_kind = 'partner_entry' then
    select created_by, created_at, status, null::timestamptz, to_jsonb(t)
      into v_created_by, v_created_at, v_status, v_confirmed, v_old
    from partner_ledger_entries t where id = p_id;
  else
    select created_by, created_at, status, confirmed_at, to_jsonb(t)
      into v_created_by, v_created_at, v_status, v_confirmed, v_old
    from partner_settlements t where id = p_id;
  end if;

  if v_created_at is null then
    return jsonb_build_object('error','not_found','message','السجل غير موجود.');
  end if;
  if v_status = 'voided' then
    return jsonb_build_object('error','already_voided','message','السجل ملغي بالفعل.');
  end if;

  -- Authorization: owner voids anything; HR voids only their own same-day,
  -- unconfirmed canteen/other/expense rows.
  if not v_is_owner then
    if p_kind not in ('canteen','other','expense')
       or v_created_by is distinct from auth.uid()
       or (v_created_at at time zone 'Africa/Cairo')::date <> v_today
       or v_confirmed is not null then
      return jsonb_build_object('error','owner_only','message','الإلغاء هنا قرار Owner فقط.');
    end if;
  end if;

  if p_kind = 'loan' then
    update emp_loans set status='voided', voided_by=auth.uid(), voided_at=now(), void_reason=trim(p_reason) where id = p_id;
  elsif p_kind = 'canteen' then
    update canteen_entries set status='voided', voided_by=auth.uid(), voided_at=now(), void_reason=trim(p_reason) where id = p_id;
  elsif p_kind = 'other' then
    update other_deductions set status='voided', voided_by=auth.uid(), voided_at=now(), void_reason=trim(p_reason) where id = p_id;
  elsif p_kind = 'expense' then
    update company_expenses set status='voided', voided_by=auth.uid(), voided_at=now(), void_reason=trim(p_reason) where id = p_id;
  elsif p_kind = 'partner_entry' then
    update partner_ledger_entries set status='voided', voided_by=auth.uid(), voided_at=now(), void_reason=trim(p_reason) where id = p_id;
  else
    update partner_settlements set status='voided', voided_by=auth.uid(), voided_at=now(), void_reason=trim(p_reason) where id = p_id;
  end if;

  insert into audit_log(actor, action, entity, entity_id, details)
  values (auth.uid(), 'void_financial', p_kind, p_id::text,
          jsonb_build_object('reason', trim(p_reason), 'old_row', v_old));

  return jsonb_build_object('ok', true);
end $$;
revoke execute on function void_financial_v1(text,bigint,text) from public, anon;
grant execute on function void_financial_v1(text,bigint,text) to authenticated;

-- ============================================================================
-- Done. Verify with the smoke tests in the deployment checklist.
-- ============================================================================

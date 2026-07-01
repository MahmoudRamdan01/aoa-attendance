-- v1 patch: Owner-only approvals, owner payroll privacy, automatic daily QR broadcast.

create table if not exists daily_qr_broadcasts (
  work_date date primary key,
  qr_code text not null,
  notification_group uuid not null,
  recipient_count int not null default 0,
  sent_by uuid references auth.users(id),
  sent_at timestamptz not null default now()
);

alter table daily_qr_broadcasts enable row level security;
alter table salaries enable row level security;

drop policy if exists daily_qr_broadcasts_admin_read on daily_qr_broadcasts;
create policy daily_qr_broadcasts_admin_read on daily_qr_broadcasts
for select to authenticated using (is_hr());

drop policy if exists sal_owner on salaries;
create policy sal_owner on salaries for all to authenticated
using (is_owner()) with check (is_owner());

create or replace function notify_admins(p_title text, p_body text)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_group uuid := gen_random_uuid();
begin
  insert into notifications(user_id,target_role,title,body,category,priority,group_id)
  select user_id, 'owner', p_title, p_body, 'approval', 'high', v_group
  from app_admins
  where role = 'owner';
end $$;

create or replace function notify_owners(p_title text, p_body text)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform notify_admins(p_title, p_body);
end $$;

create or replace function broadcast_daily_qr_v1(p_date date default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_date date := coalesce(p_date, (now() at time zone 'Africa/Cairo')::date);
  v_code text;
  v_group uuid := gen_random_uuid();
  v_inserted int := 0;
  v_count int := 0;
  v_existing daily_qr_broadcasts%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('error','auth_required','message','لازم تسجيل دخول.');
  end if;

  v_code := ensure_daily_qr(v_date);

  insert into daily_qr_broadcasts(work_date, qr_code, notification_group, sent_by)
  values (v_date, v_code, v_group, auth.uid())
  on conflict (work_date) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select * into v_existing from daily_qr_broadcasts where work_date = v_date;
    return jsonb_build_object(
      'ok', true,
      'sent', false,
      'date', v_date,
      'code', v_existing.qr_code,
      'count', coalesce(v_existing.recipient_count, 0),
      'group_id', v_existing.notification_group
    );
  end if;

  insert into notifications(user_id,title,body,category,priority,created_by,group_id)
  select
    ea.user_id,
    'كود QR اليوم',
    'كود تسجيل الحضور ليوم ' || v_date::text || ': ' || v_code,
    'qr',
    'urgent',
    auth.uid(),
    v_group
  from employee_accounts ea
  join employees e on e.id = ea.employee_id
  where ea.active and e.active;
  get diagnostics v_count = row_count;

  update daily_qr_broadcasts
  set recipient_count = v_count
  where work_date = v_date;

  insert into audit_log(actor,action,entity,entity_id,details)
  values (auth.uid(),'broadcast_daily_qr','daily_qr_broadcasts',v_date::text,jsonb_build_object('count',v_count,'group_id',v_group));

  return jsonb_build_object('ok',true,'sent',true,'date',v_date,'code',v_code,'count',v_count,'group_id',v_group);
end $$;

create or replace function decide_permission_v1(p_id bigint, p_approve boolean, p_hours_approved numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v permissions%rowtype;
  v_user uuid;
begin
  if not is_owner() then return jsonb_build_object('error','owner_only','message','الموافقة على الإذن Owner فقط.'); end if;
  select * into v from permissions where id=p_id;
  if not found then return jsonb_build_object('error','not_found','message','الطلب غير موجود.'); end if;
  if v.status <> 'pending' then return jsonb_build_object('error','already_decided','message','تم اتخاذ قرار على الطلب قبل كده.'); end if;
  if p_approve and p_hours_approved not in (1,2) then return jsonb_build_object('error','bad_hours','message','مدة الموافقة ساعة أو ساعتين.'); end if;

  update permissions
  set status = case when p_approve then 'approved' else 'rejected' end,
      hours_approved = case when p_approve then p_hours_approved else null end,
      decision_note = p_note,
      decided_at = now(),
      decided_by = auth.uid()
  where id=p_id;

  select user_id into v_user from employee_accounts where employee_id = v.employee_id;
  perform notify_user(v_user, case when p_approve then 'تمت الموافقة على الإذن' else 'تم رفض الإذن' end,
    case when p_approve then 'المدة المعتمدة: ' || p_hours_approved::text || ' ساعة.' else coalesce(p_note,'تم رفض الطلب.') end);

  return jsonb_build_object('ok',true);
end $$;

create or replace function decide_leave_v1(p_id bigint, p_approve boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v leave_requests%rowtype;
  v_user uuid;
  d date;
begin
  if not is_owner() then return jsonb_build_object('error','owner_only','message','الموافقة على الأجازة Owner فقط.'); end if;
  select * into v from leave_requests where id=p_id;
  if not found then return jsonb_build_object('error','not_found','message','الطلب غير موجود.'); end if;
  if v.status <> 'pending' then return jsonb_build_object('error','already_decided','message','تم اتخاذ قرار على الطلب قبل كده.'); end if;

  update leave_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      decision_note = p_note,
      decided_at = now(),
      decided_by = auth.uid()
  where id=p_id;

  select user_id into v_user from employee_accounts where employee_id = v.employee_id;

  if p_approve then
    update employees set leave_balance = greatest(0,coalesce(leave_balance,0)-v.days) where id=v.employee_id;
    for d in select generate_series(v.from_date,v.to_date,interval '1 day')::date loop
      if extract(dow from d)::int <> 5
        and not exists (select 1 from official_holidays h where h.holiday_date = d)
      then
        insert into attendance(employee_id,work_date,status,late_minutes,deduction_days,note,source,approved,recorded_by)
        values (v.employee_id,d,'leave',0,0,'أجازة معتمدة · Cover: ' || v.cover_employee_id,'hr',true,auth.uid())
        on conflict (employee_id,work_date) do update
          set status='leave', check_in=null, check_out=null, late_minutes=0, deduction_days=0,
              note=excluded.note, source='hr', approved=true, recorded_by=auth.uid();
      end if;
    end loop;
  end if;

  perform notify_user(v_user, case when p_approve then 'تمت الموافقة على الأجازة' else 'تم رفض الأجازة' end,
    coalesce(p_note, case when p_approve then 'تم اعتماد طلب الأجازة.' else 'تم رفض طلب الأجازة.' end));

  return jsonb_build_object('ok',true);
end $$;

grant select, insert, update on daily_qr_broadcasts to authenticated;
grant select, insert, update on salaries to authenticated;
grant execute on function broadcast_daily_qr_v1(date) to authenticated;

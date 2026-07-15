-- ============================================================================
-- AOA v1 — Web Push notifications (2026-07-15)
-- Instant push to installed PWAs (sound + shows while app/phone closed).
-- Flow: notification INSERT → trigger → pg_net → Edge Function `send-push`
--       → web-push (VAPID) → device → SW `push` handler → showNotification.
-- Client: src/lib/push.js + src/ui/PushToggle.jsx (bell inbox toggle);
-- SW push/notificationclick handlers live in sw.template.js.
-- SECURITY: VAPID private key + trigger secret live ONLY in push_config
-- (RLS-locked, service-role only) — NEVER commit them (repo is public).
-- ============================================================================
create extension if not exists pg_net;

create table if not exists push_config (
  id int primary key default 1,
  vapid_public text not null,   -- public key (safe to expose to clients)
  vapid_private text not null,  -- SECRET — set via dashboard/SQL, not committed
  subject text not null default 'mailto:mahmoud@airocean.com',
  trigger_secret text not null default gen_random_uuid()::text,
  constraint push_config_singleton check (id = 1)
);
alter table push_config enable row level security;  -- no policies → service-role only
-- insert into push_config(id, vapid_public, vapid_private) values (1, '<PUBLIC>', '<PRIVATE>');

create table if not exists push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
create policy push_sub_select on push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_sub_delete on push_subscriptions for delete to authenticated using (user_id = auth.uid());
-- inserts happen through the security-definer RPC below (no client insert policy).

create or replace function get_push_public_key_v1() returns text
language sql security definer set search_path to 'public' stable
as $$ select vapid_public from push_config where id=1 $$;
grant execute on function get_push_public_key_v1() to authenticated, anon;

create or replace function save_push_subscription_v1(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null then return jsonb_build_object('error','unauth'); end if;
  insert into push_subscriptions(user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update set user_id=excluded.user_id, p256dh=excluded.p256dh,
    auth=excluded.auth, user_agent=excluded.user_agent, last_seen=now();
  return jsonb_build_object('ok', true);
end $$;
grant execute on function save_push_subscription_v1(text,text,text,text) to authenticated;

create or replace function delete_push_subscription_v1(p_endpoint text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
begin
  delete from push_subscriptions where endpoint=p_endpoint and user_id=auth.uid();
  return jsonb_build_object('ok', true);
end $$;
grant execute on function delete_push_subscription_v1(text) to authenticated;

-- fire the Edge Function on each notification insert (only when the recipient
-- actually has a subscription, to avoid wasted calls).
create or replace function push_notify_trigger() returns trigger
language plpgsql security definer set search_path to 'public'
as $$
declare v_secret text;
begin
  if new.user_id is null then return new; end if;
  if not exists (select 1 from push_subscriptions where user_id = new.user_id) then return new; end if;
  select trigger_secret into v_secret from push_config where id = 1;
  perform net.http_post(
    url := 'https://gdgrdwjlxcavogztvxon.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret', v_secret),
    body := jsonb_build_object('notification_id', new.id)
  );
  return new;
end $$;

drop trigger if exists trg_push_notify on notifications;
create trigger trg_push_notify after insert on notifications
for each row execute function push_notify_trigger();

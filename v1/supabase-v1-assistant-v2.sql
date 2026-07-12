-- =====================================================================
--  Air Ocean Line — v1 assistant v2 (2026-07-12)
--  Per-user server-side chat (RLS) + multi-provider config + user prefs.
--  Stage 1 of the staged rollout (chat tables + RLS + indexes + RPC).
--
--  Design notes:
--   * chat_messages has NO user_id — ownership is derived from the parent
--     chat_conversations row (prevents owner/message-owner mismatch, and
--     there is no client-supplied user_id to trust).
--   * assistant_providers holds ONLY non-sensitive config. Secrets (Dahl key,
--     Ollama tunnel URL, Cloudflare Access token) live in Edge Function env
--     (Deno.env), never in the database.
--   * All chat_* / prefs access is via the user-scoped client so RLS applies;
--     the service-role client is used only for provider config + assistant_logs.
--  Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Conversations — one owner per conversation (auth.uid()).
-- ---------------------------------------------------------------------
create table if not exists chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text,
  summary text,
  provider_key text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2) Messages — ownership via parent conversation (no user_id column).
--    client_message_id gives idempotency; status tracks generation state.
-- ---------------------------------------------------------------------
create table if not exists chat_messages (
  id bigserial primary key,
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text,
  tables jsonb,
  actions jsonb,
  proposals jsonb,
  client_message_id uuid,
  generation_id uuid,
  status text check (status in ('generating','completed','stopped','failed')),
  provider_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotency: the same client message can be inserted at most once per
-- conversation (guards double-click / stream retry / reconnect).
create unique index if not exists chat_messages_client_idem
  on chat_messages(conversation_id, client_message_id)
  where client_message_id is not null;

create index if not exists chat_conversations_user_recent
  on chat_conversations(user_id, last_message_at desc);
create index if not exists chat_conversations_user_archived
  on chat_conversations(user_id, archived);
create index if not exists chat_messages_conv_created
  on chat_messages(conversation_id, created_at);

-- keep updated_at fresh on message edits (partial-save during streaming)
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists chat_messages_touch on chat_messages;
create trigger chat_messages_touch before update on chat_messages
for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------
-- 3) RLS — private per user. No owner/hr override: these are private chats
--    (unlike assistant_logs, where the owner sees everyone).
-- ---------------------------------------------------------------------
alter table chat_conversations enable row level security;
alter table chat_messages enable row level security;

drop policy if exists chat_conv_select on chat_conversations;
drop policy if exists chat_conv_insert on chat_conversations;
drop policy if exists chat_conv_update on chat_conversations;
drop policy if exists chat_conv_delete on chat_conversations;
create policy chat_conv_select on chat_conversations for select using (user_id = auth.uid());
create policy chat_conv_insert on chat_conversations for insert with check (user_id = auth.uid());
create policy chat_conv_update on chat_conversations for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy chat_conv_delete on chat_conversations for delete using (user_id = auth.uid());

drop policy if exists chat_msg_select on chat_messages;
drop policy if exists chat_msg_insert on chat_messages;
drop policy if exists chat_msg_update on chat_messages;
drop policy if exists chat_msg_delete on chat_messages;
create policy chat_msg_select on chat_messages for select
  using (exists (select 1 from chat_conversations c where c.id = conversation_id and c.user_id = auth.uid()));
create policy chat_msg_insert on chat_messages for insert
  with check (exists (select 1 from chat_conversations c where c.id = conversation_id and c.user_id = auth.uid()));
create policy chat_msg_update on chat_messages for update
  using (exists (select 1 from chat_conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from chat_conversations c where c.id = conversation_id and c.user_id = auth.uid()));
create policy chat_msg_delete on chat_messages for delete
  using (exists (select 1 from chat_conversations c where c.id = conversation_id and c.user_id = auth.uid()));

grant select, insert, update, delete on chat_conversations to authenticated;
grant select, insert, update, delete on chat_messages to authenticated;
grant usage, select on sequence chat_messages_id_seq to authenticated;

-- ---------------------------------------------------------------------
-- 4) Providers — NON-SENSITIVE config only. Secrets live in Deno.env.
--    base_url_ref = the env var name that holds the actual base URL.
--    RLS enabled with NO policies ⇒ service-role only.
-- ---------------------------------------------------------------------
create table if not exists assistant_providers (
  key text primary key,
  label text not null,
  base_url_ref text not null,
  model text not null,
  enabled boolean not null default true,
  streaming boolean not null default true,
  allowed_roles text[] not null default '{owner,hr,employee}',
  tool_scope text not null default 'full' check (tool_scope in ('full','read_only')),
  sort int not null default 0
);
alter table assistant_providers enable row level security;

insert into assistant_providers(key, label, base_url_ref, model, enabled, streaming, allowed_roles, tool_scope, sort)
values
  ('dahl',   'Dahl Cloud', 'DAHL_BASE_URL',   'MiniMaxAI/MiniMax-M2.7', true,  true, '{owner,hr,employee}', 'full',      1),
  ('ollama', 'Qwen Local', 'OLLAMA_BASE_URL', 'qwen3:8b',               false, true, '{owner,hr}',          'read_only', 2)
on conflict (key) do nothing;

-- default provider for everyone
alter table assistant_config add column if not exists default_provider_key text not null default 'dahl';

-- ---------------------------------------------------------------------
-- 5) Per-user provider preference (personal, not global).
-- ---------------------------------------------------------------------
create table if not exists assistant_user_prefs (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  provider_key text not null default 'dahl',
  updated_at timestamptz not null default now()
);
alter table assistant_user_prefs enable row level security;

drop policy if exists prefs_select on assistant_user_prefs;
drop policy if exists prefs_insert on assistant_user_prefs;
drop policy if exists prefs_update on assistant_user_prefs;
create policy prefs_select on assistant_user_prefs for select using (user_id = auth.uid());
create policy prefs_insert on assistant_user_prefs for insert with check (user_id = auth.uid());
create policy prefs_update on assistant_user_prefs for update using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on assistant_user_prefs to authenticated;

-- ---------------------------------------------------------------------
-- 6) RPC for the client's provider dropdown — no secrets, role-filtered.
--    Employees only ever see 'dahl'.
-- ---------------------------------------------------------------------
create or replace function list_assistant_providers()
returns table(key text, label text, model text, streaming boolean)
language sql stable security definer set search_path=public as $$
  select p.key, p.label, p.model, p.streaming
  from assistant_providers p
  where p.enabled
    and coalesce((get_my_context_v1() ->> 'role'), 'employee') = any(p.allowed_roles)
  order by p.sort;
$$;
revoke execute on function list_assistant_providers() from public, anon;
grant execute on function list_assistant_providers() to authenticated;

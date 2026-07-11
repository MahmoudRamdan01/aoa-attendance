-- =====================================================================
--  Air Ocean Line — v1: AI Assistant (2026-07-11)
--  Config (service-role only; holds the LLM provider settings) + logs.
--  The api_key value is inserted separately and NEVER committed here.
--  Applied to the live DB as migration "assistant_tables".
-- =====================================================================

create table if not exists assistant_config (
  id int primary key default 1 check (id = 1),
  base_url text not null default 'https://inference.dahl.global/v1',
  api_key text not null,
  model text not null default 'MiniMaxAI/MiniMax-M2.7',
  temperature numeric not null default 0.2,
  max_tokens int not null default 3000,
  max_tool_rounds int not null default 5
);
alter table assistant_config enable row level security;
revoke all on assistant_config from anon, authenticated, public;

create table if not exists assistant_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  role text,
  question text,
  reply_summary text,
  tools_used jsonb not null default '[]',
  duration_ms int,
  created_at timestamptz not null default now()
);
create index if not exists idx_assistant_logs_user_time on assistant_logs(user_id, created_at);
alter table assistant_logs enable row level security;
drop policy if exists assistant_logs_select on assistant_logs;
create policy assistant_logs_select on assistant_logs for select to authenticated
using (user_id = auth.uid() or is_owner());
grant select on assistant_logs to authenticated;

-- Then insert the provider key (run manually, do NOT commit the key):
-- insert into assistant_config (id, api_key) values (1, '<YOUR_KEY>')
-- on conflict (id) do update set api_key = excluded.api_key;

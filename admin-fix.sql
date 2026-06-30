-- Run this in the same Supabase project used by the app:
-- https://supabase.com/dashboard/project/gdgrdwjlxcavogztvxon/sql

-- Make mahmoud01@airocean.com an Owner admin.
insert into public.app_admins(user_id, name, role)
select id, 'Mahmoud', 'owner'
from auth.users
where lower(email) = lower('mahmoud01@airocean.com')
on conflict (user_id) do update
set name = excluded.name,
    role = excluded.role;

-- Verify the link between Auth user and app_admins.
select
  u.id as auth_user_id,
  u.email,
  a.name,
  a.role
from auth.users u
left join public.app_admins a on a.user_id = u.id
where lower(u.email) = lower('mahmoud01@airocean.com');

-- #####################################################################
--  Air Ocean Line — Attendance · إنشاء حسابات الإدارة (HR + Owner)
--  شغّله في: Supabase Dashboard → SQL Editor (نفس مشروع التطبيق)
--  المفروض تكون شغّلت supabase-schema.sql الأول (بيعمل جدول app_admins).
--  آمن تعيد تشغيله. بيعمل/بيحدّث المستخدمين + بيربطهم بالأدوار.
--
--  ⚠️ استبدل الـ <PASSWORD> بباسورد قوي قبل التشغيل. متعملش commit للباسوردات.
-- #####################################################################

create extension if not exists pgcrypto;

do $$
declare
  v   record;
  uid uuid;
begin
  for v in
    select * from (values
      -- (email,                password,         name,     role)
      ('nada@airocean.com',  '<HR_PASSWORD>',    'ندى',   'hr'),
      ('zyad@airocean.com',  '<OWNER_PASSWORD>', 'زياد',  'owner')
    ) as t(email, pass, name, role)
  loop
    select id into uid from auth.users where lower(email) = lower(v.email);

    if uid is null then
      -- إنشاء مستخدم جديد (بريد مؤكَّد فورًا — من غير رسالة تأكيد)
      uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        lower(v.email), crypt(v.pass, gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('name', v.name),
        '', '', '', ''
      );
      insert into auth.identities (
        provider_id, user_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) values (
        uid::text, uid,
        jsonb_build_object('sub', uid::text, 'email', lower(v.email), 'email_verified', true),
        'email', now(), now(), now()
      );
    else
      -- المستخدم موجود: إعادة تعيين الباسورد + تأكيد البريد
      update auth.users
         set encrypted_password = crypt(v.pass, gen_salt('bf')),
             email_confirmed_at = coalesce(email_confirmed_at, now()),
             updated_at = now()
       where id = uid;
    end if;

    -- ربط الدور في app_admins (hr / owner)
    insert into public.app_admins(user_id, name, role)
    values (uid, v.name, v.role)
    on conflict (user_id) do update
      set name = excluded.name, role = excluded.role;
  end loop;
end $$;

-- تأكيد النتيجة:
select u.email,
       a.name,
       a.role,
       (u.email_confirmed_at is not null) as confirmed
from auth.users u
join public.app_admins a on a.user_id = u.id
where lower(u.email) in ('nada@airocean.com', 'zyad@airocean.com')
order by a.role desc;

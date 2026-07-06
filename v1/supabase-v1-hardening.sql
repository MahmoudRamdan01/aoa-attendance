-- =====================================================================
--  Air Ocean Line — v1 Security Hardening (ops)
--  شغّله بعد supabase-schema.sql + supabase-v1-migration.sql (+ الـ patch).
--  آمن تعيد تشغيله. الملف ده بيقفل الصلاحيات الزيادة ويجدول المهام الدورية.
--  ملاحظة: حماية الـ PIN brute-force ودالة _verify_emp_pin موجودة في
--  supabase-schema.sql، وفحوصات الـ GPS/الأدوار في supabase-v1-migration.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Least-privilege: التطبيقات مبتمسحش الجداول الحساسة دي إطلاقًا.
--    الـ RLS بيحمي القراءة/الكتابة، وده طبقة تانية على المسح بالذات.
-- ---------------------------------------------------------------------
revoke delete on salaries   from authenticated;
revoke delete on app_admins from authenticated;
revoke delete on employees  from authenticated;

-- ---------------------------------------------------------------------
-- 2) مهام دورية (pg_cron) — محتاجة تفعيل الـ extension مرة واحدة:
--       create extension if not exists pg_cron;
--    وبعدها شغّل البلوك ده. المواعيد بتوقيت UTC (القاهرة = UTC+2/UTC+3)،
--    فاضبطها حسب التوقيت الصيفي عندك.
-- ---------------------------------------------------------------------
-- create extension if not exists pg_cron;
--
-- -- تعليم الغياب يوميًا 08:30 UTC (~10:30/11:30 القاهرة) بعد قفل نافذة الحضور:
-- select cron.schedule(
--   'mark-absentees-daily', '30 8 * * 0-4',
--   $$ select mark_absentees_v1((now() at time zone 'Africa/Cairo')::date) $$
-- );
--
-- -- مراجعة نسيان الانصراف يوميًا 19:00 UTC (~21:00/22:00 القاهرة):
-- select cron.schedule(
--   'mark-missing-checkouts-daily', '0 19 * * 0-4',
--   $$ select mark_missing_checkouts_v1((now() at time zone 'Africa/Cairo')::date) $$
-- );
--
-- -- للإلغاء لاحقًا:  select cron.unschedule('mark-absentees-daily');

-- ---------------------------------------------------------------------
-- 3) تحقّق سريع (اختياري): اتأكد إن حماية الـ PIN والإعدادات موجودة.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.pin_attempts') is null then
    raise warning 'pin_attempts غير موجود — شغّل supabase-schema.sql المحدّث الأول.';
  end if;
  if not exists (select 1 from settings where key = 'max_gps_accuracy_m') then
    raise warning 'إعداد max_gps_accuracy_m غير موجود — شغّل supabase-v1-migration.sql المحدّث.';
  end if;
end $$;

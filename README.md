# Air Ocean Line Attendance - Deploy Notes

المشروع Static HTML متصل بقاعدة Supabase جاهزة.

## الملفات

- `index.html`: الملف الذي يتم نشره.
- `supabase-schema.sql`: نسخة احتياطية من سكيمة Supabase، تستخدم فقط لو هتعمل Supabase project جديد أو تعيد بناء القاعدة.

## نشر سريع على Vercel

1. افتح https://vercel.com/new
2. اختر Import / Upload للمجلد `aoa-attendance-deploy`.
3. الإعدادات:
   - Framework Preset: Other
   - Build Command: اتركه فارغ
   - Output Directory: `.`
4. Deploy.

## نشر سريع على Netlify

1. افتح https://app.netlify.com/drop
2. اسحب مجلد `aoa-attendance-deploy` بالكامل.
3. بعد النشر، افتح الرابط الناتج وجرب شاشة الحضور.

## Supabase

الكود الحالي يستخدم Supabase project موجود، وتم التأكد أن جدول الموظفين بيرجع 12 موظف.

لو هتستخدم Supabase project جديد:

1. افتح Supabase Dashboard.
2. ادخل SQL Editor.
3. شغل محتوى `supabase-schema.sql`.
4. من Authentication أضف حساب Owner أو HR.
5. انسخ UID الخاص بالمستخدم، ثم شغل insert مناسب في جدول `app_admins` كما هو موضح في آخر ملف SQL.
6. غير `CONFIG.url` و `CONFIG.anonKey` داخل `index.html` لقيم المشروع الجديد.

## ملاحظات

- مفتاح `anon` ظاهر في الواجهة وهذا طبيعي لتطبيقات Supabase، لكن الأمان الفعلي يعتمد على RLS والـ functions.
- لو QR هيتستخدم من موبايلات الموظفين، لازم الرابط المنشور يكون HTTPS عام، وليس `file://` أو localhost.

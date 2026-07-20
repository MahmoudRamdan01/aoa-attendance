# Air Ocean Line — نسخة معزولة من السيستم (air-ocean-hr)

نفس الكودبيس (`v1-src/`) يخدم شركتين معزولتين تمامًا:

| | شركتنا (aol) | Air Ocean Line (airocean) |
|---|---|---|
| Supabase | `gdgrdwjlxcavogztvxon` (Hr Managment) | `hubuvdwhqxuizkyeedab` (air-ocean-hr) |
| Build | `npm run build` → `v1/` | `npm run build:airocean` → `airocean/` |
| Env | افتراضي في السورس | `v1-src/.env.airocean` (المفتاح anon عام بطبيعته) |
| الهوية | AOI. (ذهبي) | Air Ocean Line (أزرق محيطي، `data-company="airocean"`) |
| المودیولات | كاملة | حضور + أجازات/أذونات + مرتبات فقط (الماليات والمساعد مقفولين من `lib/company.js`) |
| المرتبات | شهري (÷30) | **أساسي + انتظام**: settings `payroll={"mode":"daily","divisor":26}` |

## نظام مرتبات Air Ocean (من شيت 2026)
- كل يوم حضور مُعتمد = `day_rate` (150 ج للمعظم) فوق الأساسي؛ الأجازة المعتمدة تُحسب يومًا كاملًا.
- الوصول بعد **9:30** (checkin_to، بدون سماح) ⇒ شريحة تأخير واحدة `cut 0.25` = ربع **اليوم الكامل** (أساسي÷26 + انتظام).
- الغياب = خصم يوم أساسي (÷26) + ضياع انتظام اليوم تلقائيًا.
- أعمدة إضافية في `salaries`: `day_rate`, `fixed_allowance` (سهر 2600 / بدل انتقالات), `monthly_bonus` (المكافآت). عمود `department` في `employees`.
- الحساب كله في `v1-src/src/lib/payroll.js` (وضع monthly لسيستمنا لم يتغير رقمًا واحدًا).

## إزاي الـ schema اتنقل
نسخ حي → حي بدون transcription يدوي: دالة مؤقتة `schema_dump_airocean_v1(part)` على المشروع القديم
(اتمسحت بعد النقل)، والمشروع الجديد سحبها بـ `pg_net` ونفّذها. اتنقل: 45 جدول، 91 دالة
(تطابق MD5 للتواقيع)، 61 بوليصة RLS، 6 تريجرز، فيو، الفهارس، bucket «Attandence»،
و3 وظائف pg_cron (غياب/انصراف ناقص/تقرير التأخير — بدون kb-sync لأن المساعد مقفول).
السجل الكامل في migration history بتاع المشروع الجديد:
`airocean_customization` + `seed_airocean_employees_salaries_owner`.

## Seed
49 موظف بأقسامهم (AIR PORT / DELTA / CUSTOMS CLEARANCE / MANAGING & ACC / SHIPPING / أخرى)
ومرتباتهم من شيت 2026 — مجموع (أساسي + انتظام×26 + مكافآت) طابق إجمالي الشيت 463,460 ج بالضبط.
حساب Owner: mahmoudram739@gmail.com (باسورد مؤقت اتسلّم في المحادثة — غيّره من أول دخول).
حسابات باقي الموظفين يعملها الـ Owner من «الرواتب والتقارير → حسابات الموظفين».

## مستنيين من المالك
- لوكيشن مكتبهم الحقيقي → `update company_locations set lat=…, lng=…, radius_m=…` (حاليًا نطاق 100كم = بدون حظر جغرافي).
- اللوجو الرسمي → يستبدل `v1-src/brand/airocean/*` ويُعاد `npm run build:airocean`.
- إيميلات HR لو هيتضافوا.

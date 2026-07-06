-- =====================================================================
--  Air Ocean Line — تدوير الـ PINs (إلزامي)
--  الـ PINs القديمة كانت متسرّبة في كود الـ client، فلازم تتغيّر كلها.
--  انسخ الملف ده، حُط PINs جديدة سرّية، شغّله في Supabase SQL Editor،
--  ووزّع الجداد على الموظفين شخصيًا. متكوميتش الملف وهو متعبّي بأرقام حقيقية.
-- =====================================================================

-- بيستخدم الدالة الموجودة set_employee_pin(employee_id, pin) اللي بتعمل bcrypt hash.
-- استبدل كل XXXX بـ PIN جديد (4 أرقام) لكل موظف حسب id بتاعه.
-- تقدر تجيب الـ ids والأسماء بـ:  select id, name from employees where active order by id;

select set_employee_pin(e.id, v.pin)
from (values
  -- (employee_id, 'new_pin')
  (1,  'XXXX'),
  (2,  'XXXX'),
  (3,  'XXXX'),
  (4,  'XXXX'),
  (5,  'XXXX'),
  (6,  'XXXX'),
  (7,  'XXXX'),
  (8,  'XXXX'),
  (9,  'XXXX'),
  (10, 'XXXX'),
  (11, 'XXXX'),
  (12, 'XXXX')
) as v(id, pin)
join employees e on e.id = v.id;

-- بديل: توليد PIN عشوائي لكل موظف نشِط دفعة واحدة، وطباعتهم مرة واحدة عشان توزّعهم.
-- (شغّل الـ SELECT الأول، اطبع النتيجة وسلّمها، وبعدين شغّل الـ UPDATE.)
--
-- with newpins as (
--   select id, lpad((floor(random()*10000))::int::text, 4, '0') as pin
--   from employees where active
-- )
-- select e.id, e.name, np.pin from employees e join newpins np on np.id = e.id order by e.id;
--
-- ثم:
-- update employees e
-- set pin_hash = extensions.crypt(np.pin, extensions.gen_salt('bf'))
-- from (
--   select id, lpad((floor(random()*10000))::int::text, 4, '0') as pin
--   from employees where active
-- ) np
-- where e.id = np.id;   -- ⚠️ ولّد وطبع الـ PINs في خطوة واحدة قبل ما تعمل الـ hash.

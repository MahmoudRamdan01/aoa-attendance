-- =====================================================================
--  Air Ocean Line — v1 RAG layer (2026-07-12)
--  Agentic hybrid RAG on pgvector: semantic (gte-small 384d) + Arabic lexical
--  (tsvector), RRF-fused, and SECURITY-FILTERED BY ROLE at retrieval time.
--  The assistant's kb_search tool grounds answers in the company's real
--  knowledge: curated policies + the free-text living in the DB (notes,
--  reasons, descriptions). Numbers still come from the structured tools.
--
--  Security model: kb_chunks is RLS-locked with NO policies (no direct client
--  read). The ONLY way in is kb_search_v1() — a SECURITY DEFINER function that
--  derives the caller's role/employee from auth.uid() (never trusts a param)
--  and returns only chunks the caller is allowed to see. So retrieval can never
--  leak a salary note to HR or another employee's reason across users.
--  Safe to re-run.
-- =====================================================================

create extension if not exists vector with schema public;

-- ---------------------------------------------------------------------
-- 1) Chunk store
-- ---------------------------------------------------------------------
create table if not exists kb_chunks (
  id bigserial primary key,
  source text not null,                 -- policy | training | attendance_note | hr_note | leave_reason | perm_reason | expense | partner | owner_ledger | loan | deduction | canteen
  source_id text,                       -- natural key back to the origin row (for idempotent upsert)
  title text,
  content text not null,                -- the Arabic chunk text
  metadata jsonb not null default '{}', -- {employee_id, employee_name, date, category, amount, ...}
  visibility text not null default 'all' check (visibility in ('all','admin','owner','employee_self')),
  owner_employee_id bigint,             -- for employee_self: which employee it belongs to
  embedding vector(384),                -- gte-small; null until embedded
  fts tsvector,                         -- Arabic-friendly lexical
  content_hash text,                    -- change detection for re-embedding
  updated_at timestamptz not null default now()
);

create unique index if not exists kb_chunks_srcid on kb_chunks(source, source_id);
create index if not exists kb_chunks_hnsw on kb_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists kb_chunks_fts on kb_chunks using gin (fts);
create index if not exists kb_chunks_vis on kb_chunks (visibility, owner_employee_id);
create index if not exists kb_chunks_pending on kb_chunks (id) where embedding is null;

create or replace function kb_chunks_biu() returns trigger language plpgsql as $$
begin
  new.fts := to_tsvector('simple', coalesce(new.title,'') || ' ' || coalesce(new.content,''));
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists kb_chunks_biu on kb_chunks;
create trigger kb_chunks_biu before insert or update of title, content on kb_chunks
for each row execute function kb_chunks_biu();

-- Locked: no direct client access. Retrieval only via kb_search_v1.
alter table kb_chunks enable row level security;

-- ---------------------------------------------------------------------
-- 2) Hybrid, role-filtered retrieval (the RAG core)
-- ---------------------------------------------------------------------
create or replace function kb_search_v1(p_embedding vector(384), p_query text, p_k int default 8)
returns table(source text, title text, content text, metadata jsonb, score double precision)
language plpgsql security definer set search_path=public as $$
declare
  v_ctx jsonb := get_my_context_v1();
  v_role text := coalesce(v_ctx->>'role','employee');
  v_emp bigint := nullif(v_ctx#>>'{employee,id}','')::bigint;
  v_tsq tsquery := websearch_to_tsquery('simple', coalesce(p_query,''));
begin
  return query
  with visible as (
    select c.* from kb_chunks c
    where (
      c.visibility = 'all'
      or (c.visibility = 'admin' and v_role in ('owner','hr'))
      or (c.visibility = 'owner' and v_role = 'owner')
      or (c.visibility = 'employee_self' and (v_role in ('owner','hr') or c.owner_employee_id = v_emp))
    )
  ),
  vec as (
    select v.id, 1.0/(50 + row_number() over (order by v.embedding <=> p_embedding)) as rrf
    from visible v where v.embedding is not null and p_embedding is not null
    order by v.embedding <=> p_embedding limit 40
  ),
  lex as (
    select v.id, 1.0/(50 + row_number() over (order by ts_rank(v.fts, v_tsq) desc)) as rrf
    from visible v where v_tsq is not null and v.fts @@ v_tsq
    limit 40
  ),
  fused as (
    select u.id, sum(u.rrf) as score
    from (select * from vec union all select * from lex) u
    group by u.id
  )
  select v.source, v.title, v.content, v.metadata, f.score
  from fused f join visible v on v.id = f.id
  order by f.score desc
  limit greatest(1, least(p_k, 20));
end $$;
revoke execute on function kb_search_v1(vector, text, int) from public, anon;
grant execute on function kb_search_v1(vector, text, int) to authenticated;

-- ---------------------------------------------------------------------
-- 3) Sync DB free-text → chunks (idempotent, change-detected).
--    SECURITY DEFINER so it can read everything; guarded to owner/service.
-- ---------------------------------------------------------------------
create or replace function kb_sync_v1()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_role text;
begin
  -- allow only the owner (interactive) or service role (no jwt context)
  v_role := coalesce((get_my_context_v1())->>'role', 'service');
  if v_role not in ('owner','service') then
    return jsonb_build_object('error','forbidden');
  end if;

  -- generic upsert helper via a temp staging of (source, source_id, title, content, visibility, owner, metadata)
  create temporary table _kb_stage(
    source text, source_id text, title text, content text,
    visibility text, owner_employee_id bigint, metadata jsonb
  ) on commit drop;

  -- employee day notes
  insert into _kb_stage
  select 'attendance_note', 'attnote:'||a.id, 'ملاحظة موظف',
         'ملاحظة الموظف '||coalesce(e.name,'')||' يوم '||a.work_date||': '||a.employee_note,
         'employee_self', a.employee_id,
         jsonb_build_object('employee', e.name, 'employee_id', a.employee_id, 'date', a.work_date)
  from attendance a join employees e on e.id=a.employee_id
  where nullif(trim(coalesce(a.employee_note,'')),'') is not null;

  -- HR notes on a day (admin-only)
  insert into _kb_stage
  select 'hr_note', 'hrnote:'||a.id, 'ملاحظة إدارية',
         'ملاحظة الإدارة على '||coalesce(e.name,'')||' يوم '||a.work_date||': '||a.hr_note,
         'admin', a.employee_id,
         jsonb_build_object('employee', e.name, 'employee_id', a.employee_id, 'date', a.work_date)
  from attendance a join employees e on e.id=a.employee_id
  where nullif(trim(coalesce(a.hr_note,'')),'') is not null;

  -- leave reasons
  insert into _kb_stage
  select 'leave_reason', 'leave:'||l.id, 'سبب أجازة',
         'طلب أجازة لـ '||coalesce(e.name,'')||' من '||l.from_date||' إلى '||l.to_date||' — السبب: '||l.reason
           ||coalesce(' — قرار: '||nullif(l.decision_note,''),''),
         'employee_self', l.employee_id,
         jsonb_build_object('employee', e.name, 'employee_id', l.employee_id, 'from', l.from_date, 'to', l.to_date, 'status', l.status)
  from leave_requests l join employees e on e.id=l.employee_id
  where nullif(trim(coalesce(l.reason,'')),'') is not null;

  -- permission reasons
  insert into _kb_stage
  select 'perm_reason', 'perm:'||p.id, 'سبب إذن',
         'طلب إذن لـ '||coalesce(e.name,'')||' يوم '||p.perm_date||' — السبب: '||p.reason
           ||coalesce(' — قرار: '||nullif(p.decision_note,''),''),
         'employee_self', p.employee_id,
         jsonb_build_object('employee', e.name, 'employee_id', p.employee_id, 'date', p.perm_date, 'status', p.status)
  from permissions p join employees e on e.id=p.employee_id
  where nullif(trim(coalesce(p.reason,'')),'') is not null;

  -- company expenses (admin)
  insert into _kb_stage
  select 'expense', 'exp:'||x.id, 'مصروف شركة',
         'مصروف '||coalesce(x.category,'')||' يوم '||x.expense_date||' بقيمة '||x.amount||' ج — '||x.description,
         'admin', null,
         jsonb_build_object('category', x.category, 'date', x.expense_date, 'amount', x.amount)
  from company_expenses x
  where x.status='active' and nullif(trim(coalesce(x.description,'')),'') is not null;

  -- partner ledger (admin)
  insert into _kb_stage
  select 'partner', 'pl:'||pe.id, 'مديونية Air Ocean',
         'قيد مديونية ('||case when pe.direction='owed_to_us' then 'لنا عندهم' else 'علينا ليهم' end
           ||') بقيمة '||pe.amount||' ج يوم '||pe.entry_date||' — '||pe.description,
         'admin', null,
         jsonb_build_object('direction', pe.direction, 'amount', pe.amount, 'date', pe.entry_date)
  from partner_ledger_entries pe
  where pe.status='active' and nullif(trim(coalesce(pe.description,'')),'') is not null;

  -- owner personal ledger (owner only)
  insert into _kb_stage
  select 'owner_ledger', 'ol:'||o.id, 'الدفتر الشخصي',
         'قيد شخصي مع '||coalesce(o.person,'')||' بقيمة '||o.amount||' ج يوم '||o.entry_date
           ||coalesce(' — '||nullif(o.note,''),''),
         'owner', null,
         jsonb_build_object('person', o.person, 'amount', o.amount, 'date', o.entry_date)
  from owner_ledger_entries o
  where nullif(trim(coalesce(o.note,'')),'') is not null or nullif(trim(coalesce(o.person,'')),'') is not null;

  -- loans (admin)
  insert into _kb_stage
  select 'loan', 'loan:'||ln.id, 'سلفة',
         'سلفة لـ '||coalesce(e.name,'')||' بقيمة '||ln.amount||' ج'||coalesce(' — '||nullif(ln.note,''),''),
         'admin', ln.employee_id,
         jsonb_build_object('employee', e.name, 'employee_id', ln.employee_id, 'amount', ln.amount)
  from emp_loans ln join employees e on e.id=ln.employee_id
  where nullif(trim(coalesce(ln.note,'')),'') is not null;

  -- other deductions (employee_self)
  insert into _kb_stage
  select 'deduction', 'ded:'||d.id, 'استقطاع',
         'استقطاع '||coalesce(d.category,'')||' على '||coalesce(e.name,'')||' يوم '||d.entry_date||' بقيمة '||d.amount||' ج'
           ||coalesce(' — '||nullif(d.note,''),''),
         'employee_self', d.employee_id,
         jsonb_build_object('employee', e.name, 'employee_id', d.employee_id, 'category', d.category, 'amount', d.amount)
  from other_deductions d join employees e on e.id=d.employee_id
  where d.status='active' and (nullif(trim(coalesce(d.note,'')),'') is not null or nullif(trim(coalesce(d.category,'')),'') is not null);

  -- canteen (employee_self)
  insert into _kb_stage
  select 'canteen', 'cant:'||c.id, 'كانتين',
         'كانتين لـ '||coalesce(e.name,'')||' يوم '||c.entry_date||': '||c.item||' بـ'||c.amount||' ج'
           ||coalesce(' — '||nullif(c.note,''),''),
         'employee_self', c.employee_id,
         jsonb_build_object('employee', e.name, 'employee_id', c.employee_id, 'amount', c.amount)
  from canteen_entries c join employees e on e.id=c.employee_id
  where c.status='active' and nullif(trim(coalesce(c.item,'')),'') is not null;

  -- upsert: insert new / update changed (reset embedding when content changed)
  insert into kb_chunks(source, source_id, title, content, metadata, visibility, owner_employee_id, content_hash, embedding)
  select s.source, s.source_id, s.title, s.content, s.metadata, s.visibility, s.owner_employee_id, md5(s.content), null
  from _kb_stage s
  on conflict (source, source_id) do update
    set title = excluded.title,
        content = excluded.content,
        metadata = excluded.metadata,
        visibility = excluded.visibility,
        owner_employee_id = excluded.owner_employee_id,
        embedding = case when kb_chunks.content_hash is distinct from excluded.content_hash then null else kb_chunks.embedding end,
        content_hash = excluded.content_hash;

  -- prune chunks whose source row no longer has text (dynamic sources only)
  delete from kb_chunks c
  where c.source in ('attendance_note','hr_note','leave_reason','perm_reason','expense','partner','owner_ledger','loan','deduction','canteen')
    and not exists (select 1 from _kb_stage s where s.source=c.source and s.source_id=c.source_id);

  return jsonb_build_object(
    'ok', true,
    'staged', (select count(*) from _kb_stage),
    'total_chunks', (select count(*) from kb_chunks),
    'pending_embed', (select count(*) from kb_chunks where embedding is null)
  );
end $$;
revoke execute on function kb_sync_v1() from public, anon;
grant execute on function kb_sync_v1() to authenticated;

-- ---------------------------------------------------------------------
-- 4) Curated policy corpus (visibility=all). Reflects CURRENT rules
--    (QR optional, corrected GPS center, 1000m radius).
-- ---------------------------------------------------------------------
insert into kb_chunks(source, source_id, title, content, visibility, content_hash, embedding) values
 ('policy','pol:attendance_window','نافذة الحضور والانصراف',
  'مواعيد تسجيل الحضور العامة من 08:00 لـ 11:00 صباحًا، والانصراف من 16:00 لـ 19:00. لكل موظف ممكن يكون ليه نافذة مختلفة: عبدالرحمن حضوره يفتح من 13:00 وانصرافه من 18:00، وحبيبة حضورها من 12:00 لـ 13:00 وانصرافها من 17:00 لـ 19:00.','all', null, null),
 ('policy','pol:gps','تسجيل الحضور بالـ GPS',
  'التسجيل بيتم بالـ GPS لازم تكون داخل نطاق 1000 متر من مكتب الشركة في العطارين بالإسكندرية (الإحداثيات 31.1985266, 29.9039409). لو بعيد أكتر من كده بيرفض ويقولك المسافة. دقة الـ GPS لازم تكون كويسة (أقل من 100 متر).','all', null, null),
 ('policy','pol:qr','كود QR اليومي',
  'كود QR اختياري مش إجباري — تقدر تسجل حضورك وانصرافك بالموقع (GPS) لوحده بدون كود. لو الإدارة فعّلت خيار qr_required بيبقى إجباري ولازم تكتب كود اليوم الصحيح. الكود بيتغير يوميًا وبيظهر عند HR والـ Owner.','all', null, null),
 ('policy','pol:late','قواعد التأخير والخصم',
  'التأخير بيتحسب من بداية الدوام. التأخير أكتر من 15 دقيقة: أول مرة في الشهر بيبقى إنذار بدون خصم، وأي مرة بعدها في نفس الشهر عليها خصم ربع يوم. الحضور بعد الساعة 10:00 بيبقى معلّق لموافقة المدير.','all', null, null),
 ('policy','pol:permissions','الأذونات',
  'الموظف ليه 3 أذونات في الشهر بحد أقصى، ولازم تكون غير متتالية (مش يومين ورا بعض). الإذن ساعة أو ساعتين. لازم موافقة الإدارة.','all', null, null),
 ('policy','pol:leaves','الأجازات',
  'الأجازات يومين في الشهر غير متتاليين، بموظف بديل (Cover)، وبتتخصم من الرصيد السنوي. لازم موافقة الإدارة، وبيوصل إشعار للفريق لما تتعتمد.','all', null, null),
 ('policy','pol:absence','الغياب',
  'الغياب بدون إذن أو أجازة معتمدة بيتحسب يوم خصم كامل من المرتب. تحويل الغياب لأجازة مبررة بيكون بقرار من الإدارة.','all', null, null),
 ('policy','pol:loans','السلف والأقساط',
  'السلفة بيسجّلها الـ Owner بس، بمبلغ وعدد أقساط شهرية. القسط بيتخصم تلقائيًا من المرتب كل شهر لحد ما السلفة تخلص. بتظهر في استقطاعات الموظف.','all', null, null),
 ('policy','pol:canteen','الكانتين',
  'مشتريات الكانتين بيسجّلها HR على الموظف، وبتتخصم من مرتبه في نفس الشهر.','all', null, null),
 ('policy','pol:deductions','الاستقطاعات الأخرى',
  'فيه استقطاعات تانية زي التلفيات والجزاءات والزي، بيسجّلها HR بمبلغ وسبب، وبتتخصم من المرتب.','all', null, null),
 ('policy','pol:expenses','مصروفات الشركة',
  'مصروفات الشركة (مياه/كهرباء/إيجار/صيانة...) بيسجّلها HR والـ Owner بيأكدها. لحد ما تتأكد بتفضل مستنية.','all', null, null),
 ('policy','pol:partner','مديونية Air Ocean',
  'مديونية Air Ocean دفتر باتجاهين: لنا عندهم وعلينا ليهم. السداد بيتسجّل ويفضل معلّق لحد ما الـ Owner يأكده.','all', null, null),
 ('policy','pol:owner_ledger','الدفتر الشخصي للـ Owner',
  'الدفتر الشخصي خاص بالـ Owner بس (مين سلّفه ومين سدّد)، ومش بيظهر لـ HR ولا الموظفين إطلاقًا.','owner', null, null),
 ('policy','pol:payroll','معادلة صافي المرتب',
  'صافي مرتب الموظف = المرتب الشهري − خصم أيام الغياب والتأخير (كل يوم = المرتب ÷ 30) − الاستقطاعات المالية (أقساط السلف + الكانتين + الاستقطاعات الأخرى).','all', null, null),
 ('policy','pol:exempt','الموظفين المعفيين من الحضور',
  'فيه موظفين على المرتبات بس ومعفيين من تسجيل الحضور والانصراف (زي عمر ومحمود وناصر) — مش بيظهروا في شاشة تسجيل الحضور.','all', null, null)
on conflict (source, source_id) do nothing;

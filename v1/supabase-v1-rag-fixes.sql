-- =====================================================================
--  Air Ocean Line — RAG corrections applied live after supabase-v1-rag.sql
--  (2026-07-12). Run this AFTER supabase-v1-rag.sql. Both already applied
--  to production; kept for repo parity.
--   (a) kb_search_v1: take the query embedding as TEXT ('[..]') and cast to
--       vector inside (robust over PostgREST); RRF score cast to double
--       precision (was numeric → "return type mismatch" error).
--   (b) kb_sync_v1: detect the service/cron caller via auth.uid() IS NULL
--       (get_my_context_v1 returns 'employee' for a no-JWT call, which the
--       original owner/service guard rejected).
-- =====================================================================

drop function if exists kb_search_v1(vector, text, int);

create or replace function kb_search_v1(p_embedding text, p_query text, p_k int default 8)
returns table(source text, title text, content text, metadata jsonb, score double precision)
language plpgsql security definer set search_path=public as $$
declare
  v_ctx jsonb := get_my_context_v1();
  v_role text := coalesce(v_ctx->>'role','employee');
  v_emp bigint := nullif(v_ctx#>>'{employee,id}','')::bigint;
  v_tsq tsquery := websearch_to_tsquery('simple', coalesce(p_query,''));
  v_emb vector(384) := case when nullif(trim(coalesce(p_embedding,'')),'') is null then null else p_embedding::vector(384) end;
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
    select v.id, (1.0/(50 + row_number() over (order by v.embedding <=> v_emb)))::double precision as rrf
    from visible v where v.embedding is not null and v_emb is not null
    order by v.embedding <=> v_emb limit 40
  ),
  lex as (
    select v.id, (1.0/(50 + row_number() over (order by ts_rank(v.fts, v_tsq) desc)))::double precision as rrf
    from visible v where v_tsq is not null and v.fts @@ v_tsq limit 40
  ),
  fused as (
    select u.id, sum(u.rrf)::double precision as score from (select * from vec union all select * from lex) u group by u.id
  )
  select v.source, v.title, v.content, v.metadata, f.score
  from fused f join visible v on v.id = f.id
  order by f.score desc limit greatest(1, least(p_k, 20));
end $$;
revoke execute on function kb_search_v1(text, text, int) from public, anon;
grant execute on function kb_search_v1(text, text, int) to authenticated;

-- kb_sync_v1: only the guard changed (service caller = no JWT). The rest of
-- the body is identical to supabase-v1-rag.sql — re-apply that file's full
-- definition but with this opening guard:
--   if auth.uid() is null then v_role := 'service';
--   else v_role := coalesce((get_my_context_v1())->>'role','employee'); end if;
--   if v_role not in ('owner','service') then return jsonb_build_object('error','forbidden'); end if;

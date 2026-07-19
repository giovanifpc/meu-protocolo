-- Ranking entre alunos (item 15 do roadmap, Fase D). Decisões do usuário
-- (2026-07-19): pontos por ação (sessão completa + medalha + recorde de
-- carga), nome exibido como "Primeiro nome + inicial" (nunca nome
-- completo pra quem não é o próprio profissional), opt-in por profissional
-- (desligado por padrão — nem todo público reage bem a competição), janela
-- mensal (reseta todo mês, pra não deixar quem entrou primeiro dominar pra
-- sempre).

alter table professionals add column if not exists ranking_enabled boolean not null default false;

-- Log imutável de quando cada medalha foi desbloqueada pela primeira vez —
-- sem isso não dá pra saber quais medalhas foram ganhas ESTE mês (as 9
-- medalhas hoje em aluno.html são só um estado derivado ao vivo do
-- histórico, sem timestamp de quando foram conquistadas). Gravado pelo
-- próprio client no exato momento em que aluno.html detecta a transição
-- locked→earned (mesmo ponto de código que já dispara o toast de
-- "Conquista desbloqueada"). Confiança no mesmo nível do resto do dado de
-- treino auto-reportado pelo aluno (carga/reps também não são validados
-- por outra fonte) — o check constraint só garante que é uma das 9
-- medalhas reais, não que foi "ganha de verdade".
create table if not exists student_badge_unlocks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  badge_id text not null check (badge_id in ('first','loop','five','streak2','ten','evoluiu','streak4','loops3','twenty')),
  unlocked_at timestamptz not null default now(),
  unique (student_id, badge_id)
);

alter table student_badge_unlocks enable row level security;

create policy "student inserts own badge unlocks"
  on student_badge_unlocks for insert
  with check (student_id in (select id from students where email = auth.jwt() ->> 'email'));

create policy "student reads own badge unlocks"
  on student_badge_unlocks for select
  using (student_id in (select id from students where email = auth.jwt() ->> 'email'));

-- "João Silva Santos" -> "João S." — só primeiro nome + inicial do último
-- sobrenome no ranking, nunca o nome completo (dado pessoal aparecendo pra
-- outros alunos do mesmo profissional, que podem nem se conhecer).
create or replace function format_ranking_name(full_name text)
returns text
language sql
immutable
as $$
  select case
    when array_length(regexp_split_to_array(trim(full_name), '\s+'), 1) <= 1
      then trim(full_name)
    else (regexp_split_to_array(trim(full_name), '\s+'))[1] || ' ' ||
         left((regexp_split_to_array(trim(full_name), '\s+'))[array_length(regexp_split_to_array(trim(full_name), '\s+'), 1)], 1) || '.'
  end;
$$;

-- Ranking do mês corrente entre os alunos do MESMO profissional do aluno
-- que chamou — SECURITY DEFINER pra poder ler dado (nome, sessões) de
-- outros alunos além de si mesmo, algo que a RLS normal de students/
-- training_history nunca permite (cada aluno só vê a própria linha).
-- Retorna vazio se o profissional não ativou o ranking (opt-in) — o front
-- trata lista vazia + ranking_enabled=false como "recurso não disponível".
create or replace function get_student_ranking()
returns table (
  student_id uuid,
  display_name text,
  score integer,
  sessions_completas integer,
  medalhas integer,
  recordes integer,
  is_me boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_professional_id uuid;
  v_caller_student_id uuid;
  v_month_start timestamptz := date_trunc('month', now());
begin
  select id, professional_id into v_caller_student_id, v_professional_id
  from students where email = auth.jwt() ->> 'email';

  if v_caller_student_id is null then
    raise exception 'Apenas alunos podem consultar o ranking.';
  end if;

  if not exists (select 1 from professionals where id = v_professional_id and ranking_enabled) then
    return;
  end if;

  return query
  with sessoes as (
    select
      th.student_id,
      count(*) filter (where not coalesce((th.detail->>'incomplete')::boolean, false)) as completas,
      count(*) filter (where coalesce((th.detail->>'incomplete')::boolean, false)) as incompletas
    from training_history th
    join students s on s.id = th.student_id
    where s.professional_id = v_professional_id
      and th.completed_at >= v_month_start
    group by th.student_id
  ),
  medalhas as (
    select sbu.student_id, count(*) as qtd
    from student_badge_unlocks sbu
    join students s on s.id = sbu.student_id
    where s.professional_id = v_professional_id
      and sbu.unlocked_at >= v_month_start
    group by sbu.student_id
  ),
  sets_flat as (
    select
      th.student_id,
      th.completed_at,
      ex->>'nome' as exercise_nome,
      (st_set->>'carga')::numeric as carga
    from training_history th
    join students st on st.id = th.student_id
    cross join lateral jsonb_array_elements(coalesce(th.detail->'exercises', '[]'::jsonb)) as ex
    cross join lateral jsonb_array_elements(coalesce(ex->'sets', '[]'::jsonb)) as st_set
    where st.professional_id = v_professional_id
      and (st_set->>'done')::boolean is true
      and (st_set->>'carga') ~ '^[0-9]+(\.[0-9]+)?$'
  ),
  per_exercise as (
    select
      sf.student_id, sf.exercise_nome,
      max(sf.carga) filter (where sf.completed_at < v_month_start) as max_before,
      max(sf.carga) filter (where sf.completed_at >= v_month_start) as max_this_month
    from sets_flat sf
    group by sf.student_id, sf.exercise_nome
  ),
  recordes as (
    select pe.student_id, count(*) as qtd
    from per_exercise pe
    where pe.max_this_month is not null and pe.max_this_month > coalesce(pe.max_before, 0)
    group by pe.student_id
  )
  select
    st.id,
    format_ranking_name(st.nome),
    (coalesce(so.completas, 0) * 10 + coalesce(so.incompletas, 0) * 4 + coalesce(m.qtd, 0) * 20 + coalesce(r.qtd, 0) * 15)::integer,
    coalesce(so.completas, 0)::integer,
    coalesce(m.qtd, 0)::integer,
    coalesce(r.qtd, 0)::integer,
    (st.id = v_caller_student_id)
  from students st
  left join sessoes so on so.student_id = st.id
  left join medalhas m on m.student_id = st.id
  left join recordes r on r.student_id = st.id
  where st.professional_id = v_professional_id
  order by 3 desc, coalesce(so.completas, 0) desc, st.nome asc;
end;
$$;

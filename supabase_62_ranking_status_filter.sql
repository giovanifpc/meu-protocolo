-- Achado real de varredura de fluxo (2026-08-05): o ranking do mês (tanto
-- a visão do profissional quanto a visão entre alunos) nunca filtrava por
-- students.status -- um aluno marcado Pausado ou Inativo no meio do mês
-- (mas que treinou antes disso) continuava pontuando e aparecendo no
-- placar até o dia 1º seguinte, mesmo já não estando mais "em jogo".

create or replace function get_professional_student_ranking()
returns table(student_id uuid, display_name text, score integer, sessions_completas integer, medalhas integer, recordes integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_professional_id uuid;
  v_month_start timestamptz := date_trunc('month', now());
begin
  select id into v_professional_id
    from professionals where email = auth.jwt() ->> 'email';

  if v_professional_id is null then
    raise exception 'Apenas profissionais podem consultar este ranking.';
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
    st.nome,
    (coalesce(so.completas, 0) * 10 + coalesce(so.incompletas, 0) * 4 + coalesce(m.qtd, 0) * 20 + coalesce(r.qtd, 0) * 15)::integer,
    coalesce(so.completas, 0)::integer,
    coalesce(m.qtd, 0)::integer,
    coalesce(r.qtd, 0)::integer
  from students st
  left join sessoes so on so.student_id = st.id
  left join medalhas m on m.student_id = st.id
  left join recordes r on r.student_id = st.id
  where st.professional_id = v_professional_id
    and st.status = 'ativo'
  order by 3 desc, coalesce(so.completas, 0) desc, st.nome asc;
end;
$$;

create or replace function get_student_ranking()
returns table(student_id uuid, display_name text, score integer, sessions_completas integer, medalhas integer, recordes integer, is_me boolean)
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
      and is_session_plausible(th.detail)
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
      and (th.completed_at < v_month_start or is_session_plausible(th.detail))
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
    and st.status = 'ativo'
  order by 3 desc, coalesce(so.completas, 0) desc, st.nome asc;
end;
$$;

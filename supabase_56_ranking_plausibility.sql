-- Antifraude no ranking: piso de plausibilidade por sessão de treino
-- (2026-08-01). Motivado por pedido do usuário depois de o Fundador 1
-- (Otávio) pedir o painel de ranking pensando em premiar o 1º colocado —
-- sem nenhum freio, marcar treinos rápido demais de casa vira o jeito mais
-- fácil de "vencer" sem treinar de verdade.
--
-- Em vez de comparar contra o descanso PRESCRITO no protocolo (puniria
-- quem genuinamente treina com descanso curto por escolha própria), o piso
-- usa só os horários reais de quando cada série foi marcada (doneAt,
-- gravado por aluno.html a cada toggleSet, dentro de training_history.
-- detail.exercises[].sets[].doneAt) — o intervalo entre a 1ª e a última
-- marcação da sessão precisa ser fisicamente plausível pro número de
-- séries marcadas (>=15s por série, bem conservador de propósito, pra
-- minimizar falso positivo com quem treina rápido de verdade). Sessão sem
-- nenhum doneAt (treino salvo antes desta migration, ou sessão só de
-- cardio) nunca é sinalizada — sem dado não há como avaliar, e não é
-- retroativo.
--
-- Mesma função é reaproveitada em dois lugares (nunca duas implementações
-- que podem divergir): get_student_ranking() (pontuação de verdade, roda
-- toda vez que o ranking é consultado — essa é a fonte de verdade) e
-- check_session_plausibility() (chamada pelo client logo após salvar, só
-- pra mostrar um aviso sutil no fim do treino — feedback imediato, nunca
-- decide pontuação sozinha).
--
-- Sessão sinalizada continua 100% normal no histórico/evolução do próprio
-- aluno — só não pontua no ranking (nem pontos de sessão, nem recorde de
-- carga daquela sessão). Nunca fica visível pro profissional (decisão do
-- usuário) — é só entre o sistema e o placar.

create or replace function is_session_plausible(p_detail jsonb)
returns boolean
language sql
immutable
as $$
  with marks as (
    select (st_set->>'doneAt')::timestamptz as done_at
    from jsonb_array_elements(coalesce(p_detail->'exercises', '[]'::jsonb)) as ex
    cross join lateral jsonb_array_elements(coalesce(ex->'sets', '[]'::jsonb)) as st_set
    where (st_set->>'done')::boolean is true
      and st_set->>'doneAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
  ),
  agg as (
    select count(*) as n, min(done_at) as first_at, max(done_at) as last_at from marks
  )
  select case
    -- Menos de 2 marcações com horário não dá pra medir intervalo nenhum
    -- (inclui sessões antigas sem doneAt, e sessões só de cardio) — nunca
    -- flagar por falta de dado.
    when agg.n < 2 then true
    else extract(epoch from (agg.last_at - agg.first_at)) >= (agg.n - 1) * 15
  end
  from agg;
$$;

-- Recriada (mesma assinatura de supabase_26_ranking.sql) só pra excluir
-- sessão implausível do MÊS CORRENTE das duas fontes de pontuação: sessões
-- completas/incompletas e o cálculo de recorde pessoal. Sessões de meses
-- anteriores nunca são filtradas aqui (servem só de baseline de comparação
-- pro recorde, e dado antigo sem doneAt já passa sempre de qualquer jeito
-- — a condição fica explícita pra nunca alterar baseline histórico, mesmo
-- se um dia dado antigo ganhar doneAt via alguma migração futura).
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
  order by 3 desc, coalesce(so.completas, 0) desc, st.nome asc;
end;
$$;

-- Chamada pelo client logo depois de salvar o treino (finishWorkout, aluno.
-- html) só pra decidir se mostra o aviso sutil de "não vai contar ponto" —
-- nunca decide pontuação sozinha, isso é sempre get_student_ranking() no
-- momento de consulta. Escopada ao próprio dono da sessão (nunca aceita
-- checar a sessão de outro aluno).
create or replace function check_session_plausibility(p_session_uid text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_detail jsonb;
begin
  select id into v_student_id from students where email = auth.jwt() ->> 'email';
  if v_student_id is null then
    raise exception 'Apenas alunos podem consultar isso.';
  end if;

  select detail into v_detail
  from training_history
  where session_uid = p_session_uid and student_id = v_student_id;

  if v_detail is null then
    return true; -- sessão não encontrada (ou não é do próprio aluno) — não afirma nada negativo
  end if;

  return is_session_plausible(v_detail);
end;
$$;

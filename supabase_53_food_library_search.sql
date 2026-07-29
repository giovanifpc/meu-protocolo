-- Busca de alimento pra UI do nutritracker (2026-07-29) — mesmo padrão de
-- UX já usado em search_exercise_library (unaccent, case-insensitive), mas
-- SEM security definer: aqui não precisa driblar RLS manualmente porque a
-- policy de select de food_library ("read shared or own custom foods", já
-- em supabase_51) já resolve sozinha o filtro certo (base compartilhada +
-- item próprio do aluno) — rodando como o dono normal (security invoker,
-- padrão do Postgres), a RLS da tabela já faz o trabalho, sem risco de
-- esquecer de replicar o filtro de dono manualmente dentro da função.

create or replace function search_food_library(q text)
returns setof food_library
language sql
stable
set search_path = public, extensions
as $$
  select *
  from food_library
  where unaccent(lower(nome)) ilike '%' || unaccent(lower(q)) || '%'
  order by (created_by_student_id is not null) desc, nome
  limit 20;
$$;

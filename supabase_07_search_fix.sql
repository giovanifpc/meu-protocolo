-- Busca de exercícios ignorando acento e maiúsculas/minúsculas.
-- ilike sozinho não ignora acento ("triceps" não achava "Tríceps").

create extension if not exists unaccent;

create or replace function search_exercise_library(q text)
returns setof exercise_library
language sql
stable
security definer
set search_path = public
as $$
  select *
  from exercise_library
  where unaccent(lower(nome)) ilike '%' || unaccent(lower(q)) || '%'
  order by nome
  limit 20;
$$;

-- Corrige o baixo índice de acerto do "vincular vídeo" nos exercícios gerados
-- por IA/troca (generate-workout, regenerate-exercises): o front-end usa
-- search_exercise_library() pra tentar achar o exercise_id real da biblioteca
-- a partir do nome que a IA inventou — mas essa função exige que o nome
-- INTEIRO da IA apareça como substring dentro do nome da biblioteca
-- (nome ilike '%q%'). Como a IA gera nomes mais descritivos ("Supino reto
-- com barra") que raramente são substring literal do nome cadastrado
-- ("Supino Reto (Barra)"), a maioria não casava — só exercícios com nome
-- da IA muito curto/genérico batiam por acaso. Sem exercise_id, o botão de
-- vídeo (renderVideoIconBtn, treinos.html) nunca aparece pra esses.
--
-- match_exercise_library() é uma função nova e separada de
-- search_exercise_library() (que continua intocada — é usada também pela
-- busca manual de exercício, onde o usuário digita incrementalmente e o
-- comportamento de "contém" é o certo). Essa aqui serve só pra resolver
-- "a IA disse X, qual exercício da biblioteca é esse", usando substring
-- nos dois sentidos + similaridade de trigrama (pg_trgm) como desempate/
-- fallback pra nomes parecidos mas não substring exato.

create extension if not exists pg_trgm schema extensions;

create or replace function match_exercise_library(q text)
returns setof exercise_library
language sql
stable
security definer
set search_path = public, extensions
as $$
  select *
  from exercise_library
  where unaccent(lower(nome)) ilike '%' || unaccent(lower(q)) || '%'
     or unaccent(lower(q)) ilike '%' || unaccent(lower(nome)) || '%'
     or similarity(unaccent(lower(nome)), unaccent(lower(q))) > 0.35
  order by
    (case when unaccent(lower(nome)) ilike '%' || unaccent(lower(q)) || '%'
            or unaccent(lower(q)) ilike '%' || unaccent(lower(nome)) || '%'
          then 1 else 0 end) desc,
    similarity(unaccent(lower(nome)), unaccent(lower(q))) desc
  limit 1;
$$;

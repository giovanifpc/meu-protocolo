-- Corrige a busca de alimento + 2 problemas reais de dado na base já
-- semeada (2026-08-04). Motivado por relato do usuário testando o app do
-- aluno: "não tem ovo frito, ovo cozido... falta alimentos básicos do dia a
-- dia brasileiro".
--
-- Investigação (não é suposição, conferido linha a linha no seed real):
-- ovo frito e ovo cozido JÁ EXISTEM na base TACO desde supabase_52 —
-- "Ovo, de galinha, inteiro, frito" e "Ovo, de galinha, inteiro,
-- cozido/10minutos". O problema não é a base estar incompleta, é a busca
-- (search_food_library, supabase_53) nunca ter tido chance de achar esses
-- itens: ela sempre exigiu a query INTEIRA como substring contíguo do nome
-- (`nome ilike '%ovo frito%'`), mas o nome do alimento no formato TACO tem
-- vírgula entre cada descritor ("Ovo, de galinha, inteiro, frito") — a
-- substring "ovo frito" nunca aparece ali de forma contígua. O mesmo
-- problema afeta praticamente qualquer alimento básico buscado em duas
-- palavras: "arroz integral", "feijão preto", "leite integral" etc. também
-- nunca batiam com o nome formal do TACO por causa da mesma vírgula no meio.

-- 1) Busca corrigida: agora cada PALAVRA da query precisa aparecer em
-- algum lugar do nome (ordem e pontuação não importam mais) — resolve o
-- caso acima sem trocar a tecnologia de busca (segue ilike simples, sem
-- precisar de full-text search/pg_trgm pra isso). Preposições comuns
-- ("de", "da", "do", "com" etc.) são ignoradas na hora de exigir presença
-- — sem isso, uma busca por "peito de frango" exigiria a palavra "de"
-- aparecendo literalmente no nome, o que nem sempre é o caso.
create or replace function search_food_library(q text)
returns setof food_library
language sql
stable
set search_path = public, extensions
as $$
  with palavras as (
    select trim(word) as word
    from regexp_split_to_table(trim(coalesce(q, '')), '\s+') as word
    where trim(word) <> ''
  ),
  palavras_relevantes as (
    select word from palavras
    where unaccent(lower(word)) not in ('de','da','do','das','dos','com','e','a','o','em','no','na','ao')
  ),
  -- Se a query for só de preposição (raro, ex: busca vazia digitando só
  -- "de"), cai de volta pra exigir todas as palavras originais em vez de
  -- não exigir nenhuma (o que devolveria a base inteira).
  termos as (
    select word from palavras_relevantes
    union all
    select word from palavras where not exists (select 1 from palavras_relevantes)
  )
  select fl.*
  from food_library fl
  where exists (select 1 from termos)
    and not exists (
      select 1 from termos t
      where unaccent(lower(fl.nome)) not ilike '%' || unaccent(lower(t.word)) || '%'
    )
  order by
    (fl.created_by_student_id is not null) desc,
    (unaccent(lower(fl.nome)) ilike unaccent(lower(trim(q))) || '%') desc,
    length(fl.nome),
    fl.nome
  limit 20;
$$;

-- 2) Achado no processo de investigar o relato acima, dado real quebrado:
-- 4 linhas do seed TACO ficaram com todos os macros zerados (kcal=0,
-- proteína=0, carboidrato=0, gordura=0) — provavelmente um gap de parsing
-- do JSON original da TACO que a curadoria de supabase_52 não pegou (o
-- filtro de plausibilidade aceitava 0 como valor "dentro da faixa"
-- 0-900kcal, sem perceber que 0 de verdade é dado ausente, não um
-- alimento de 0 caloria). Duas delas são leite (alimento básico do dia a
-- dia, exatamente o que o usuário pediu pra melhorar) — corrigidas aqui
-- com os valores oficiais publicados da TACO 4ª edição pro mesmo item
-- (Leite de vaca, integral / desnatado UHT), não um chute.
update food_library
set kcal_100g = 61, proteina_g_100g = 2.9, carboidrato_g_100g = 4.3, gordura_g_100g = 3.2
where nome = 'Leite, de vaca, integral' and fonte = 'taco';

update food_library
set kcal_100g = 35, proteina_g_100g = 3.4, carboidrato_g_100g = 4.9, gordura_g_100g = 0.2
where nome = 'Leite, de vaca, desnatado, UHT' and fonte = 'taco';

-- As outras 2 linhas zeradas ("Iogurte, sabor abacaxi" e "Coco, verde,
-- cru") não têm um valor de referência confiável o bastante pra corrigir
-- sem chutar — mais seguro remover do que deixar um alimento com 0kcal
-- registrado como se fosse verdade (isso sub-contaria o dia do aluno em
-- silêncio, sem nenhum aviso). Nenhum dos dois é um "básico do dia a dia"
-- que valha a pena reconstruir agora — se fizer falta, dá pra adicionar
-- com dado correto depois.
delete from food_library
where fonte = 'taco'
  and nome in ('Iogurte, sabor abacaxi', 'Coco, verde, cru')
  and kcal_100g = 0 and proteina_g_100g = 0 and carboidrato_g_100g = 0 and gordura_g_100g = 0;

-- 3) Alias curado pro alimento mais básico do dia a dia brasileiro que
-- continuava sem jeito de ser achado mesmo com a busca corrigida acima: a
-- TACO nunca usa a palavra "branco" pro arroz comum, só "tipo 1"/"tipo 2"
-- — uma busca por "arroz branco" não bate com nenhum desses nomes mesmo
-- palavra a palavra. Entra como item próprio (fonte 'personalizado', sem
-- created_by_student_id — item compartilhado com todo mundo, igual ao
-- seed original, só marcado como curadoria manual e não uma importação
-- literal da TACO) com os MESMOS valores nutricionais já confiáveis de
-- "Arroz, tipo 1, cozido" (arroz branco tipo 1 é a mesma coisa que "arroz
-- branco" no uso cotidiano) — não é um número novo, é o mesmo dado com um
-- nome que bate com o jeito que as pessoas realmente buscam.
-- select+where not exists em vez de on conflict (não há unique constraint
-- em nome pra um conflito de verdade disparar) — garante idempotência se
-- esta migration rodar mais de uma vez, sem duplicar o item.
insert into food_library (nome, grupo, kcal_100g, proteina_g_100g, carboidrato_g_100g, gordura_g_100g, fibra_g_100g, fonte)
select 'Arroz branco, cozido', 'Cereais e derivados', 128.26, 2.52, 28.06, 0.23, 1.56, 'personalizado'
where not exists (
  select 1 from food_library where nome = 'Arroz branco, cozido' and created_by_student_id is null
);

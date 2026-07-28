-- Exercício personalizado por profissional (2026-07-27) — motivado por
-- feedback real do Cliente 1: não dava pra adicionar um exercício que não
-- estivesse na biblioteca semeada (~1550 itens). Decisão de escopo (revisada
-- com o usuário): NUNCA compartilhado entre profissionais — cada exercício
-- criado é visível só pra quem criou, pra sempre. Isso elimina qualquer
-- necessidade de moderação (não tem biblioteca compartilhada crescendo sem
-- curadoria) e mantém consistência com a decisão já tomada pra mídia
-- (vídeo/imagem, sempre privados por profissional).
--
-- created_by_professional_id nulo = um dos ~1550 exercícios semeados
-- originalmente (visível pra todo mundo, nunca editável/apagável via API).
-- Preenchido = exercício privado do profissional que criou.

alter table exercise_library
  add column if not exists created_by_professional_id uuid references professionals(id) on delete cascade;

-- Sequência dedicada pros exercise_id de exercícios criados por profissional
-- — começa bem acima do maior id semeado (a base tem ~1550 itens), garante
-- que nunca colide com os originais nem entre criações simultâneas de
-- profissionais diferentes (diferente de max()+1, que teria condição de
-- corrida sob concorrência).
create sequence if not exists custom_exercise_id_seq start with 900000;

drop policy if exists "authenticated users read exercise library" on exercise_library;

create policy "read shared or own custom exercises"
  on exercise_library for select
  to authenticated
  using (
    created_by_professional_id is null
    or created_by_professional_id = my_professional_id()
  );

create policy "professional updates own custom exercises"
  on exercise_library for update
  to authenticated
  using (created_by_professional_id = my_professional_id())
  with check (created_by_professional_id = my_professional_id());

create policy "professional deletes own custom exercises"
  on exercise_library for delete
  to authenticated
  using (created_by_professional_id = my_professional_id());

-- Criação passa por RPC (não INSERT direto do client) — garante que o
-- exercise_id vem da sequência dedicada (nunca escolhido pelo client) e que
-- created_by_professional_id é sempre o profissional autenticado, nunca nulo
-- (só a seed original pode ter dono nulo).
create or replace function create_custom_exercise(p_nome text, p_grupo_muscular text)
returns exercise_library
language plpgsql
security definer
set search_path = public
as $$
declare
  v_professional_id uuid := my_professional_id();
  v_row exercise_library;
begin
  if v_professional_id is null then
    raise exception 'Não autorizado.';
  end if;
  if trim(coalesce(p_nome, '')) = '' then
    raise exception 'Nome do exercício não pode ser vazio.';
  end if;
  insert into exercise_library (exercise_id, nome, grupo_muscular, created_by_professional_id)
  values (nextval('custom_exercise_id_seq'), trim(p_nome), nullif(trim(coalesce(p_grupo_muscular, '')), ''), v_professional_id)
  returning * into v_row;
  return v_row;
end;
$$;

-- As duas funções de busca rodam SECURITY DEFINER (ignoram RLS da tabela por
-- padrão) — precisam do mesmo filtro de dono aplicado manualmente, senão um
-- profissional acharia exercício privado de outro na busca/no match da IA.
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
    and (created_by_professional_id is null or created_by_professional_id = my_professional_id())
  order by nome
  limit 20;
$$;

create or replace function match_exercise_library(q text)
returns setof exercise_library
language sql
stable
security definer
set search_path = public, extensions
as $$
  select *
  from exercise_library
  where (
      unaccent(lower(nome)) ilike '%' || unaccent(lower(q)) || '%'
      or unaccent(lower(q)) ilike '%' || unaccent(lower(nome)) || '%'
      or similarity(unaccent(lower(nome)), unaccent(lower(q))) > 0.35
    )
    and (created_by_professional_id is null or created_by_professional_id = my_professional_id())
  order by
    (case when unaccent(lower(nome)) ilike '%' || unaccent(lower(q)) || '%'
            or unaccent(lower(q)) ilike '%' || unaccent(lower(nome)) || '%'
          then 1 else 0 end) desc,
    similarity(unaccent(lower(nome)), unaccent(lower(q))) desc
  limit 1;
$$;

-- Mídia de exercício (vídeo do YouTube + imagem própria) — evolui a tabela
-- que já existia só pra vídeo. youtube_url deixa de ser obrigatório (agora
-- pode ter só imagem, só vídeo, ou os dois); a linha só existe enquanto
-- tiver pelo menos um dos dois — sem nenhum, o app apaga a linha inteira
-- (mesmo padrão de "sem retenção" já usado no resto do projeto).
alter table professional_exercise_videos alter column youtube_url drop not null;
alter table professional_exercise_videos add column if not exists image_path text;
alter table professional_exercise_videos
  add constraint professional_exercise_videos_has_media
  check (youtube_url is not null or image_path is not null);

-- Bucket privado pra imagem de exercício — mesmo padrão de RLS já usado em
-- professional-logos/assessment-photos. Path determinístico
-- {professional_id}/{exercise_id}.{ext} (upsert a cada troca, só uma imagem
-- por par profissional×exercício, igual ao logo do profissional).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exercise-media', 'exercise-media', false, 2097152, array['image/jpeg', 'image/png', 'image/gif'])
on conflict (id) do nothing;

create policy "professional manages own exercise media"
  on storage.objects for all
  using (
    bucket_id = 'exercise-media'
    and (storage.foldername(name))[1]::uuid = my_professional_id()
  );

create policy "student reads own professional exercise media"
  on storage.objects for select
  using (
    bucket_id = 'exercise-media'
    and (storage.foldername(name))[1]::uuid in (
      select professional_id from students where email = auth.jwt() ->> 'email'
    )
  );

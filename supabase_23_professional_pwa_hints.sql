-- Guia de instalação do PWA pro painel do profissional — mesmo comportamento
-- que já existe pro aluno (supabase_22_student_hints.sql), pedido pelo
-- usuário em 2026-07-19. Reaproveita o motor já existente do profissional
-- (assistant_hints/assistant_hint_events/get_next_hint) em vez de criar um
-- terceiro sistema paralelo — a única coisa nova de verdade é a detecção
-- de plataforma (client-side) entrando como parâmetro, igual já foi feito
-- pro aluno.

-- steps: mesmo campo opcional que student_hints já tem — só o guia iOS usa,
-- pra renderizar o passo a passo visual (ícone + texto numerado).
alter table assistant_hints add column if not exists steps jsonb;

insert into assistant_hints (key, message, steps, buttons) values
  ('instalar_pwa_ios',
   'Instale o painel na tela inicial pra abrir mais rápido, sem precisar buscar o link de novo.',
   '[{"icon":"share","label":"Toque no ícone de compartilhar, na barra do Safari"},{"icon":"add","label":"Toque em \"Adicionar à Tela de Início\""}]'::jsonb,
   '[{"label":"Entendi","action":"dismiss"}]'::jsonb),
  ('instalar_pwa_chromium',
   'Instale o painel na tela inicial pra abrir mais rápido, sem precisar buscar o link de novo.',
   null,
   '[{"label":"Instalar","action":"install"},{"label":"Agora não","action":"dismiss"}]'::jsonb)
on conflict (key) do nothing;

-- Nota: diferente do backfill em supabase_21 (que suprime os gatilhos de
-- "primeira vez" pra quem já tinha conta antes da migration), os dois
-- gatilhos de instalação NÃO entram no backfill de propósito — "você ainda
-- não instalou" é igualmente válido pra profissional antigo ou novo, não é
-- um marco de "primeira vez" que só faz sentido pra conta recém-criada.

create or replace function get_next_hint(p_platform text default 'none')
returns table (hint_key text, message text, steps jsonb, buttons jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prof_id uuid;
  v_last_seen timestamptz;
  v_students_count int;
  v_protocols_count int;
  v_ia_count int;
  v_manual_count int;
  v_key text;
begin
  select id, last_seen_at into v_prof_id, v_last_seen from professionals where email = auth.jwt() ->> 'email';
  if v_prof_id is null then return; end if;

  update professionals set last_seen_at = now() where id = v_prof_id;

  select count(*) into v_students_count from students where professional_id = v_prof_id;
  select count(*) into v_protocols_count from training_protocols where professional_id = v_prof_id;
  select count(*) filter (where origem = 'ia'), count(*) filter (where origem = 'manual')
    into v_ia_count, v_manual_count
    from training_protocols where professional_id = v_prof_id;

  v_key := null;

  if not hint_already_shown(v_prof_id, 'primeiro_acesso') then
    v_key := 'primeiro_acesso';
  elsif p_platform = 'ios' and not hint_already_shown(v_prof_id, 'instalar_pwa_ios') then
    v_key := 'instalar_pwa_ios';
  elsif p_platform = 'chromium' and not hint_already_shown(v_prof_id, 'instalar_pwa_chromium') then
    v_key := 'instalar_pwa_chromium';
  elsif v_students_count >= 1 and not hint_already_shown(v_prof_id, 'primeiro_aluno') then
    v_key := 'primeiro_aluno';
  elsif v_protocols_count >= 1 and not hint_already_shown(v_prof_id, 'primeiro_treino') then
    v_key := 'primeiro_treino';
  elsif v_ia_count >= 1 and not hint_already_shown(v_prof_id, 'primeira_ia') then
    v_key := 'primeira_ia';
  elsif v_last_seen is not null and v_last_seen < now() - interval '7 days' then
    v_key := 'retorno_inatividade';
  elsif v_manual_count >= 3 and v_ia_count = 0 and not hint_already_shown(v_prof_id, 'sugerir_ia') then
    v_key := 'sugerir_ia';
  end if;

  if v_key is null then return; end if;

  return query
    select h.key, h.message, h.steps, h.buttons from assistant_hints h where h.key = v_key and h.active;
end;
$$;

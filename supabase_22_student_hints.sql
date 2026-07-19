-- Onboarding do aluno via dica contextual (Fase C, item 11 — redefinido
-- 2026-07-19: não é mais "3-4 telas na primeira abertura", o usuário
-- rejeitou esse padrão por experiência ruim com um app concorrente
-- (balões de texto enorme que ninguém lê). Mesmo motor determinístico já
-- usado pro profissional (supabase_21_assistant_hints.sql) — tabela
-- paralela em vez de generalizar uma só (RLS de professionals e students
-- são desenhos diferentes, e o projeto já segue esse padrão de tabelas
-- paralelas em vez de abstração polimórfica prematura).
--
-- Primeiro conteúdo real: guia de instalação do PWA. A condição de "qual
-- variante mostrar" depende de informação só disponível no NAVEGADOR
-- (iOS nunca dispara beforeinstallprompt, Android/Windows/Chromium sim)
-- — por isso get_next_student_hint recebe a plataforma como parâmetro em
-- vez de detectar tudo sozinho como get_next_hint() faz pro profissional.

create table if not exists student_hints (
  key text primary key,
  message text not null,
  steps jsonb, -- opcional: [{icon, label}] — passo a passo visual (só o guia de instalação usa por enquanto)
  buttons jsonb not null default '[]'::jsonb,
  active boolean not null default true
);

alter table student_hints enable row level security;
create policy "student hints are readable by anyone authenticated"
  on student_hints for select
  using (true);

insert into student_hints (key, message, steps, buttons) values
  ('instalar_pwa_ios',
   'Instale o app na tela inicial pra abrir mais rápido, sem precisar buscar o link de novo.',
   '[{"icon":"share","label":"Toque no ícone de compartilhar, na barra do Safari"},{"icon":"add","label":"Toque em \"Adicionar à Tela de Início\""}]'::jsonb,
   '[{"label":"Entendi","action":"dismiss"}]'::jsonb),
  ('instalar_pwa_chromium',
   'Instale o app na tela inicial pra abrir mais rápido, sem precisar buscar o link de novo.',
   null,
   '[{"label":"Instalar","action":"install"},{"label":"Agora não","action":"dismiss"}]'::jsonb)
on conflict (key) do nothing;

-- Log imutável — mesmo padrão de assistant_hint_events/support_messages:
-- aluno só insere/lê o próprio, nunca edita/apaga.
create table if not exists student_hint_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  hint_key text not null references student_hints(key),
  event_type text not null check (event_type in ('shown', 'dismissed', 'clicked')),
  created_at timestamptz not null default now()
);

create index if not exists student_hint_events_lookup_idx on student_hint_events(student_id, hint_key);

alter table student_hint_events enable row level security;

create policy "student inserts own hint events"
  on student_hint_events for insert
  with check (student_id in (select id from students where email = auth.jwt() ->> 'email'));

create policy "student reads own hint events"
  on student_hint_events for select
  using (student_id in (select id from students where email = auth.jwt() ->> 'email'));

-- p_platform: 'ios' | 'chromium' | 'none' (default) — decidido no navegador,
-- ver student-hints.js. 'none' cobre já-instalado e navegador sem suporte
-- (Firefox etc.) — nesses casos nenhum gatilho de instalação se aplica.
create or replace function get_next_student_hint(p_platform text default 'none')
returns table (hint_key text, message text, steps jsonb, buttons jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_key text;
begin
  select id into v_student_id from students where email = auth.jwt() ->> 'email';
  if v_student_id is null then return; end if;

  v_key := null;

  -- "e.hint_key" precisa do alias explícito: o nome da coluna de retorno da
  -- própria função (returns table (hint_key text, ...)) vira uma variável
  -- implícita no corpo do plpgsql, e colide com a coluna de mesmo nome em
  -- student_hint_events sem qualificação ("column reference is ambiguous").
  if p_platform = 'ios' and not exists (
    select 1 from student_hint_events e where e.student_id = v_student_id and e.hint_key = 'instalar_pwa_ios'
  ) then
    v_key := 'instalar_pwa_ios';
  elsif p_platform = 'chromium' and not exists (
    select 1 from student_hint_events e where e.student_id = v_student_id and e.hint_key = 'instalar_pwa_chromium'
  ) then
    v_key := 'instalar_pwa_chromium';
  end if;

  if v_key is null then return; end if;

  return query
    select h.key, h.message, h.steps, h.buttons from student_hints h where h.key = v_key and h.active;
end;
$$;

create or replace function mark_student_hint_event(p_hint_key text, p_event text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
begin
  select id into v_student_id from students where email = auth.jwt() ->> 'email';
  if v_student_id is null then return; end if;
  if p_event not in ('shown', 'dismissed', 'clicked') then
    raise exception 'evento inválido: %', p_event;
  end if;

  insert into student_hint_events (student_id, hint_key, event_type)
  values (v_student_id, p_hint_key, p_event);
end;
$$;

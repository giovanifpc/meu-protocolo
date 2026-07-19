-- Assistente proativo (dicas contextuais) — Fase C, itens 10/11 do roadmap.
-- Especificação vinda de um documento do usuário (2026-07-19), escopada pro
-- MVP: só os ~6 gatilhos concretos do texto, mensagem fixa (editável aqui
-- via SQL, sem precisar de deploy — é isso que o documento pedia com
-- "sistema orientado por regras, não mensagens fixas no código"), sem a
-- parte de aprendizado adaptativo (adiada até haver uso real).
--
-- Importante: isso é DETERMINÍSTICO, não chama a Claude em nenhum momento
-- — diferente do support-chat. As condições de cada gatilho são contagens/
-- comparações simples (nº de alunos, nº de protocolos, tempo desde a
-- última visita). Custo de IA = zero.

-- Origem do protocolo: só setada no INSERT (nunca sobrescrita em edições
-- posteriores) — ver treinos.html, saveProtocol().
alter table training_protocols add column if not exists origem text not null default 'manual' check (origem in ('manual', 'ia'));

-- Marca da última vez que o profissional "apareceu" — usado só pro gatilho
-- de retorno após inatividade. Atualizado como efeito colateral de
-- get_next_hint() (ver abaixo), não precisa de coluna gravada em nenhum
-- outro lugar do app.
alter table professionals add column if not exists last_seen_at timestamptz;

-- Conteúdo das dicas — texto e botões ficam aqui, não hardcoded na função.
-- Dá pra editar/desativar uma dica direto no SQL Editor sem redeploy.
create table if not exists assistant_hints (
  key text primary key,
  message text not null,
  buttons jsonb not null default '[]'::jsonb,
  active boolean not null default true
);

alter table assistant_hints enable row level security;
create policy "hints are readable by anyone authenticated"
  on assistant_hints for select
  using (true);

insert into assistant_hints (key, message, buttons) values
  ('primeiro_acesso',
   'Bem-vindo ao Meu Protocolo. Vou acompanhar seus primeiros passos e mostrar os recursos conforme você precisar.',
   '[{"label":"Começar","action":"dismiss"}]'::jsonb),
  ('primeiro_aluno',
   'Seu primeiro aluno já foi cadastrado. O próximo passo normalmente é criar um treino pra ele.',
   '[{"label":"Ver aluno","action":"navigate","href":"alunos.html"}]'::jsonb),
  ('primeiro_treino',
   'Treino criado com sucesso. Agora você pode complementar o acompanhamento desse aluno.',
   '[{"label":"Abrir Nutri","action":"navigate","href":"nutri.html"},{"label":"Voltar aos alunos","action":"navigate","href":"alunos.html"}]'::jsonb),
  ('primeira_ia',
   'A IA usou as informações da anamnese pra considerar dores, limitações e objetivos do aluno. Quanto mais completa a anamnese, melhores os resultados.',
   '[{"label":"Entendi","action":"dismiss"}]'::jsonb),
  ('retorno_inatividade',
   'Bem-vindo de volta. Você pode ter alunos aguardando atualização.',
   '[{"label":"Ver alunos","action":"navigate","href":"alunos.html"}]'::jsonb),
  ('sugerir_ia',
   'Percebi que você monta os treinos manualmente. Pra economizar tempo, a IA pode gerar uma estrutura inicial pra você editar depois.',
   '[{"label":"Ver alunos","action":"navigate","href":"alunos.html"}]'::jsonb)
on conflict (key) do nothing;

-- Log imutável de interação — mesmo padrão de support_messages: profissional
-- só insere/lê a própria conversa, nunca edita/apaga (o log não pode virar
-- editável por quem está sendo observado).
create table if not exists assistant_hint_events (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  hint_key text not null references assistant_hints(key),
  event_type text not null check (event_type in ('shown', 'dismissed', 'clicked')),
  created_at timestamptz not null default now()
);

create index if not exists assistant_hint_events_lookup_idx on assistant_hint_events(professional_id, hint_key);

alter table assistant_hint_events enable row level security;

create policy "professional inserts own hint events"
  on assistant_hint_events for insert
  with check (professional_id = my_professional_id());

create policy "professional reads own hint events"
  on assistant_hint_events for select
  using (professional_id = my_professional_id());

create or replace function hint_already_shown(p_prof_id uuid, p_key text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from assistant_hint_events
    where professional_id = p_prof_id and hint_key = p_key
  );
$$;

-- Motor de regras do MVP: prioridade = ordem de avaliação abaixo (só 6
-- gatilhos, não precisa de um campo de prioridade genérico ainda — revisitar
-- se a lista crescer bastante). Retorna no máximo uma dica por chamada,
-- nunca empilha várias ao mesmo tempo.
create or replace function get_next_hint()
returns table (hint_key text, message text, buttons jsonb)
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

  -- Efeito colateral deliberado: cada chamada marca "visto agora", e o gap
  -- calculado acima (v_last_seen) usa o valor de ANTES dessa atualização —
  -- é o que torna o gatilho de retorno auto-resetável, sem precisar de
  -- cooldown separado.
  update professionals set last_seen_at = now() where id = v_prof_id;

  select count(*) into v_students_count from students where professional_id = v_prof_id;
  select count(*) into v_protocols_count from training_protocols where professional_id = v_prof_id;
  select count(*) filter (where origem = 'ia'), count(*) filter (where origem = 'manual')
    into v_ia_count, v_manual_count
    from training_protocols where professional_id = v_prof_id;

  v_key := null;

  if not hint_already_shown(v_prof_id, 'primeiro_acesso') then
    v_key := 'primeiro_acesso';
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
    select h.key, h.message, h.buttons from assistant_hints h where h.key = v_key and h.active;
end;
$$;

create or replace function mark_hint_event(p_hint_key text, p_event text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prof_id uuid;
begin
  select id into v_prof_id from professionals where email = auth.jwt() ->> 'email';
  if v_prof_id is null then return; end if;
  if p_event not in ('shown', 'dismissed', 'clicked') then
    raise exception 'evento inválido: %', p_event;
  end if;

  insert into assistant_hint_events (professional_id, hint_key, event_type)
  values (v_prof_id, p_hint_key, p_event);
end;
$$;

-- Backfill: profissionais que já existem (e já usam o app de verdade) não
-- devem ver "bem-vindo, é seu primeiro aluno!" pra coisas que já aconteceram
-- há tempo. Marca os 5 gatilhos "de uma vez só" como já mostrados pra quem
-- já tem conta hoje — o app só começa a mostrar dica nova de fato pra quem
-- se cadastrar depois desta migration. (retorno_inatividade não precisa de
-- backfill: como last_seen_at começa null, ele só passa a valer depois da
-- primeira visita pós-migration.)
insert into assistant_hint_events (professional_id, hint_key, event_type)
select p.id, k.key, 'shown'
from professionals p
cross join (values ('primeiro_acesso'), ('primeiro_aluno'), ('primeiro_treino'), ('primeira_ia'), ('sugerir_ia')) as k(key)
where not exists (
  select 1 from assistant_hint_events e where e.professional_id = p.id and e.hint_key = k.key
);

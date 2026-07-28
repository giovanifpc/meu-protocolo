-- Visão do master ganha as conversas do ALUNO com o suporte também (antes só
-- via profissional) + um export completo dos últimos 30 dias pra baixar como
-- .txt (2026-07-28) — o Giovani cola no Claude Code (que tem acesso ao
-- repositório, diferente de um resumo genérico) pra achar padrão de falha
-- antes de responder ticket. Reescreve master_list_support_conversations/
-- master_get_support_conversation (supabase_20, já com exigência de aal2
-- desde supabase_37 — mantida aqui, checado antes de aplicar) pra unir
-- support_messages (profissional) e student_support_messages (aluno,
-- supabase_40) numa lista só, sempre identificando o tipo — e adiciona
-- master_export_support_log() pro botão de baixar tudo de uma vez, com a
-- mesma exigência de aal2 das demais RPCs do master.

-- Formato de retorno mudou (coluna tipo nova, professional_id saiu) — create
-- or replace não permite trocar o shape das colunas OUT, precisa dropar antes.
drop function if exists master_list_support_conversations();
drop function if exists master_get_support_conversation(uuid);

create or replace function master_list_support_conversations()
returns table (
  tipo text,
  conversation_id uuid,
  nome text,
  professional_nome text,
  started_at timestamptz,
  last_message_at timestamptz,
  message_count bigint,
  preview text
)
language sql
security definer
set search_path = public
as $$
  select
    'profissional'::text as tipo,
    m.conversation_id,
    p.display_name as nome,
    p.display_name as professional_nome,
    min(m.created_at) as started_at,
    max(m.created_at) as last_message_at,
    count(*) as message_count,
    (array_agg(m.content order by m.created_at) filter (where m.role = 'user'))[1] as preview
  from support_messages m
  join professionals p on p.id = m.professional_id
  where auth.jwt() ->> 'email' = 'meuprotocolo1@gmail.com'
    and auth.jwt() ->> 'aal' = 'aal2'
  group by m.conversation_id, p.display_name

  union all

  select
    'aluno'::text as tipo,
    m.conversation_id,
    s.nome as nome,
    pr.display_name as professional_nome,
    min(m.created_at) as started_at,
    max(m.created_at) as last_message_at,
    count(*) as message_count,
    (array_agg(m.content order by m.created_at) filter (where m.role = 'user'))[1] as preview
  from student_support_messages m
  join students s on s.id = m.student_id
  join professionals pr on pr.id = s.professional_id
  where auth.jwt() ->> 'email' = 'meuprotocolo1@gmail.com'
    and auth.jwt() ->> 'aal' = 'aal2'
  group by m.conversation_id, s.nome, pr.display_name

  order by last_message_at desc
  limit 200;
$$;

-- p_tipo diz qual das duas tabelas consultar — a lista acima já devolve o
-- tipo de cada conversa pro client mandar de volta junto do conversation_id.
create or replace function master_get_support_conversation(conv_id uuid, p_tipo text default 'profissional')
returns table (
  role text,
  content text,
  tool_trace jsonb,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select m.role, m.content, m.tool_trace, m.created_at
  from support_messages m
  where m.conversation_id = conv_id
    and p_tipo = 'profissional'
    and auth.jwt() ->> 'email' = 'meuprotocolo1@gmail.com'
    and auth.jwt() ->> 'aal' = 'aal2'

  union all

  select m.role, m.content, null::jsonb as tool_trace, m.created_at
  from student_support_messages m
  where m.conversation_id = conv_id
    and p_tipo = 'aluno'
    and auth.jwt() ->> 'email' = 'meuprotocolo1@gmail.com'
    and auth.jwt() ->> 'aal' = 'aal2'

  order by created_at;
$$;

-- Export plano pro botão "Baixar log completo" — todas as mensagens dos
-- últimos 30 dias, dos dois tipos, prontas pro client agrupar por
-- data/usuário na hora de montar o .txt.
create or replace function master_export_support_log()
returns table (
  tipo text,
  nome text,
  professional_nome text,
  conversation_id uuid,
  role text,
  content text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select 'profissional'::text, p.display_name, p.display_name, m.conversation_id, m.role, m.content, m.created_at
  from support_messages m
  join professionals p on p.id = m.professional_id
  where auth.jwt() ->> 'email' = 'meuprotocolo1@gmail.com'
    and auth.jwt() ->> 'aal' = 'aal2'
    and m.created_at >= now() - interval '30 days'

  union all

  select 'aluno'::text, s.nome, pr.display_name, m.conversation_id, m.role, m.content, m.created_at
  from student_support_messages m
  join students s on s.id = m.student_id
  join professionals pr on pr.id = s.professional_id
  where auth.jwt() ->> 'email' = 'meuprotocolo1@gmail.com'
    and auth.jwt() ->> 'aal' = 'aal2'
    and m.created_at >= now() - interval '30 days'

  order by created_at;
$$;

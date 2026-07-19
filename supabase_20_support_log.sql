-- Log de conversas do chatbot de suporte (Fase C, item 9 — extensão pedida
-- pelo usuário em 2026-07-19). Motivo: sem isso, um ticket escalado por
-- e-mail só carrega o que o profissional colou manualmente no corpo do
-- e-mail — não é confiável o bastante pra resolver sem uma conversa longa
-- de ida e volta. Esta tabela guarda o transcript completo (pergunta,
-- resposta, ferramenta chamada) por conversation_id, consultável pelo
-- Giovani via RPC master, expurgado automaticamente depois de 30 dias
-- (decisão explícita do usuário — diferente de purge_inactive_professionals
-- em supabase_17, que segue deliberadamente sem agendamento até
-- confirmação, aqui o prazo já foi confirmado).

create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  conversation_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  tool_trace jsonb,
  created_at timestamptz not null default now()
);

create index if not exists support_messages_conversation_idx on support_messages(conversation_id, created_at);
create index if not exists support_messages_professional_idx on support_messages(professional_id, created_at desc);

alter table support_messages enable row level security;

-- Só insert + select pro profissional (nunca update/delete) — o log serve
-- de evidência pra diagnóstico, não deve ser editável/apagável por quem
-- reportou o problema. A Edge Function grava usando o JWT do próprio
-- profissional (mesmo padrão de generate-workout), nunca service role.
create policy "professional inserts own support messages"
  on support_messages for insert
  with check (professional_id = my_professional_id());

create policy "professional reads own support messages"
  on support_messages for select
  using (professional_id = my_professional_id());

-- Visão do Giovani: lista de conversas agrupadas + transcript completo de
-- uma conversa específica — mesmo padrão SECURITY DEFINER + checagem de
-- e-mail interna de master_list_professionals (supabase_16).
create or replace function master_list_support_conversations()
returns table (
  conversation_id uuid,
  professional_id uuid,
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
    m.conversation_id,
    m.professional_id,
    p.display_name,
    min(m.created_at) as started_at,
    max(m.created_at) as last_message_at,
    count(*) as message_count,
    (array_agg(m.content order by m.created_at) filter (where m.role = 'user'))[1] as preview
  from support_messages m
  join professionals p on p.id = m.professional_id
  where auth.jwt() ->> 'email' = 'meuprotocolo1@gmail.com'
  group by m.conversation_id, m.professional_id, p.display_name
  order by max(m.created_at) desc
  limit 200;
$$;

create or replace function master_get_support_conversation(conv_id uuid)
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
    and auth.jwt() ->> 'email' = 'meuprotocolo1@gmail.com'
  order by m.created_at;
$$;

-- Expurgo automático diário, 30 dias.
create extension if not exists pg_cron;

create or replace function purge_old_support_messages()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from support_messages where created_at < now() - interval '30 days';
end;
$$;

select cron.schedule(
  'purge-old-support-messages-daily',
  '0 4 * * *',
  $$select purge_old_support_messages();$$
);

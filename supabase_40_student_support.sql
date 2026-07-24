-- Chatbot de suporte também pro aluno (2026-07-24) — a landing-aluno.html
-- promete "suporte 24/7 por IA" pro aluno, mas o chatbot existente
-- (support_messages/support-chat) é 100% escopado ao profissional. Em vez
-- de duplicar function/widget, a mesma Edge Function ganha um branch novo
-- pro aluno — mas o log fica numa tabela PARALELA (não a mesma
-- support_messages), mesmo padrão já usado no projeto pra separar dado de
-- profissional e de aluno (assistant_hints/student_hints, etc.), e pra
-- nunca misturar os dois RLS num único lugar.
--
-- Diferença de segurança central (não é só schema): o branch do aluno na
-- Edge Function não conecta NENHUMA ferramenta (tool_use) — por isso esta
-- tabela nem tem coluna tool_trace. A garantia de que o bot do aluno nunca
-- vaza dado de negócio do profissional não depende do texto do prompt,
-- depende de a capacidade técnica (as tools) simplesmente não existir
-- nessa chamada — mesmo princípio já usado no bot do profissional (seção 3
-- do contexto-ia-suporte.md).
create table if not exists student_support_messages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  conversation_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists student_support_messages_conversation_idx on student_support_messages(conversation_id, created_at);
create index if not exists student_support_messages_student_idx on student_support_messages(student_id, created_at desc);

alter table student_support_messages enable row level security;

-- Só insert + select pro próprio aluno (nunca update/delete, mesmo motivo
-- de support_messages: log é evidência, não deve ser editável por quem
-- participou da conversa). Sem policy de leitura pro profissional aqui —
-- é ajuda de uso do app, não precisa de visibilidade dele (diferente do
-- log de negócio do profissional, que o master já acompanha).
create policy "student inserts own support messages"
  on student_support_messages for insert
  with check (student_id in (select id from students where email = auth.jwt() ->> 'email'));

create policy "student reads own support messages"
  on student_support_messages for select
  using (student_id in (select id from students where email = auth.jwt() ->> 'email'));

-- Mesmo expurgo de 30 dias do log do profissional (supabase_20), estendido
-- pra cobrir a tabela nova — um único cron já cuida dos dois.
create or replace function purge_old_support_messages()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from support_messages where created_at < now() - interval '30 days';
  delete from student_support_messages where created_at < now() - interval '30 days';
end;
$$;

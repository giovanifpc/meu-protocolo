-- Suporta o fluxo de troca de e-mail do aluno com confirmação no endereço
-- novo (2026-08-10, ver escopo-ajustes-agosto2026.md, item 5). Por que
-- precisa de confirmação: students.email = auth.jwt() ->> 'email' resolve
-- "quem é o aluno logado" em praticamente toda RLS do projeto (supabase_02)
-- — trocar só students.email sem sincronizar auth.users (Supabase Auth)
-- trancaria o aluno pra fora do próprio app na hora. O fluxo real (Admin
-- API + troca atômica dos dois) vive nas 2 Edge Functions novas
-- (request-student-email-change / confirm-student-email-change) — este SQL
-- só cria o armazenamento que elas usam.

-- Espelho rápido do estado atual, pra UI do profissional mostrar "e-mail
-- pendente de confirmação" mesmo depois de recarregar a página, sem
-- precisar consultar a tabela de request abaixo.
alter table students add column if not exists pending_email text;

-- Token nunca guardado em texto puro — só o hash (mesmo padrão de
-- master_recovery_codes, supabase_37). RLS habilitada, ZERO policy: acesso
-- só via as 2 Edge Functions (service role), nunca direto por
-- PostgREST/client — mesmo padrão de bloqueio total já usado em
-- messages/support_messages/master_recovery_codes.
create table if not exists student_email_change_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  new_email text not null,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table student_email_change_requests enable row level security;

create index if not exists idx_email_change_requests_student on student_email_change_requests(student_id);

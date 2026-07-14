-- Consentimento LGPD do aluno (Termos de Uso + Política de Privacidade).
-- Tabela separada em vez de coluna em students, mesmo padrão de student_anamnese
-- (supabase_12_engagement.sql): students não tem policy de update pro aluno,
-- então um campo de consentimento ali exigiria abrir update na linha inteira.

create table if not exists student_consent (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade unique,
  accepted_at timestamptz not null default now(),
  termos_versao text not null default '2026-07'
);

alter table student_consent enable row level security;

-- Aluno registra/consulta o próprio consentimento (insert único por causa do unique acima)
create policy "student manages own consent"
  on student_consent for all
  using (
    student_id in (select id from students where email = auth.jwt() ->> 'email')
  )
  with check (
    student_id in (select id from students where email = auth.jwt() ->> 'email')
  );

-- Profissional só lê (auditoria de quem aceitou) — nunca escreve em nome do aluno
create policy "professional reads consent of own students"
  on student_consent for select
  using (
    student_id in (
      select s.id from students s
      where s.professional_id in (
        select id from professionals where email = auth.jwt() ->> 'email'
      )
    )
  );

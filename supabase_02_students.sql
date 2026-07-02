-- Tabela students: aluno vinculado a exatamente um professional.
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  email text unique not null,
  nome text not null,
  created_at timestamptz not null default now()
);

alter table students enable row level security;

-- Profissional gerencia os próprios alunos
create policy "professional manages own students"
  on students for all
  using (
    professional_id in (
      select id from professionals where email = auth.jwt() ->> 'email'
    )
  );

-- Aluno lê apenas a própria linha
create policy "student reads own row"
  on students for select
  using (email = auth.jwt() ->> 'email');

-- Função SECURITY DEFINER: isola a leitura de students fora da RLS normal.
-- Necessária porque a policy abaixo (em professionals) precisa consultar
-- students, e a policy "professional manages own students" (acima, em
-- students) consulta professionals — subqueries diretas nos dois sentidos
-- causam "infinite recursion detected in policy" no Postgres.
create or replace function my_student_professional_ids()
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select professional_id from students where email = auth.jwt() ->> 'email';
$$;

-- Alunos leem os dados de branding do próprio professional (necessário para o join em aluno.html)
create policy "student reads own professional"
  on professionals for select
  using (
    id in (select my_student_professional_ids())
  );

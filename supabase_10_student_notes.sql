-- Notas privadas e status do aluno, visíveis só pro profissional (nunca pro
-- aluno — por isso é tabela separada, não colunas em students, já que a RLS
-- de students dá select pro próprio aluno via email).

create table if not exists student_notes (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  student_id uuid not null unique references students(id) on delete cascade,
  status text not null default 'ativo' check (status in ('ativo', 'pausado', 'inativo')),
  nota text,
  updated_at timestamptz not null default now()
);

alter table student_notes enable row level security;

create policy "professional manages own student notes"
  on student_notes for all
  using (professional_id = my_professional_id());

-- Sem policy de leitura pro aluno — é informação privada do profissional.

create or replace function touch_student_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists student_notes_touch_updated_at on student_notes;
create trigger student_notes_touch_updated_at
  before update on student_notes
  for each row
  execute function touch_student_notes_updated_at();

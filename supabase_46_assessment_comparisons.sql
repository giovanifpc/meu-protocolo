-- Comparativo de avaliação física (2026-07-27) — decisão de design: modelar
-- como VIEW computada (aponta pra 2 avaliações já existentes + status
-- rascunho/publicado), não como uma "avaliação" nova na timeline. Fotos e
-- métricas continuam vivendo só em `physical_assessments` — esta tabela é
-- só o "recorte" de quais 2 avaliações formam o comparativo e se o aluno já
-- pode ver. Mesmo padrão de mercado (Trainerize/TrueCoach: slider de fotos
-- antes/depois computado sob demanda, não um novo check-in).

create table if not exists assessment_comparisons (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  before_assessment_id uuid not null references physical_assessments(id) on delete cascade,
  after_assessment_id uuid not null references physical_assessments(id) on delete cascade,
  status text not null default 'rascunho' check (status in ('rascunho', 'publicado')),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint assessment_comparisons_distinct check (before_assessment_id <> after_assessment_id)
);

alter table assessment_comparisons enable row level security;

create policy "professional manages own comparisons"
  on assessment_comparisons for all
  using (professional_id = my_professional_id());

-- Mesmo padrão de `physical_assessments`: aluno só enxerga o que foi
-- publicado, nunca rascunho.
create policy "student reads own published comparisons"
  on assessment_comparisons for select
  using (
    status = 'publicado'
    and student_id in (select id from students where email = auth.jwt() ->> 'email')
  );

create index if not exists assessment_comparisons_student_idx
  on assessment_comparisons (student_id, created_at desc);

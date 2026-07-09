-- Avaliação física: o profissional colhe dobras cutâneas (adipômetro), dados
-- de bioimpedância (digitados manualmente a partir do visor da balança — não
-- existe integração de hardware nesses aparelhos), perimetria e fotos. Sexo e
-- idade ficam na própria avaliação (não em `students`) porque idade muda a
-- cada avaliação e isso evita mexer no cadastro do aluno pra um dado usado só
-- aqui.
--
-- Cada linha é uma avaliação datada (rascunho até o profissional finalizar).
-- O aluno só enxerga avaliações finalizadas — é assim que dá pra montar o
-- comparativo de evolução sem expor rascunho incompleto.

create table if not exists physical_assessments (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  avaliado_em date not null default current_date,
  sexo text check (sexo in ('M', 'F')),
  idade integer,
  peso_kg numeric,
  altura_cm numeric,
  protocolo_dobras text check (protocolo_dobras in ('pollock3', 'pollock7', 'faulkner4', 'guedes3')),
  dobras jsonb not null default '{}'::jsonb,
  resultado_dobras jsonb not null default '{}'::jsonb,
  bioimpedancia jsonb not null default '{}'::jsonb,
  perimetria jsonb not null default '{}'::jsonb,
  fotos jsonb not null default '[]'::jsonb,
  observacoes text,
  status text not null default 'rascunho' check (status in ('rascunho', 'finalizada')),
  created_at timestamptz not null default now(),
  finalizada_em timestamptz
);

alter table physical_assessments enable row level security;

create policy "professional manages own assessments"
  on physical_assessments for all
  using (professional_id = my_professional_id());

create policy "student reads own finalized assessments"
  on physical_assessments for select
  using (
    status = 'finalizada'
    and student_id in (select id from students where email = auth.jwt() ->> 'email')
  );

-- Bucket privado pras fotos de avaliação — mesmo padrão do nutri-pdfs.
-- Caminho de cada arquivo: {student_id}/{assessment_id}/{tipo}.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assessment-photos', 'assessment-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "professional manages own students assessment photos"
  on storage.objects for all
  using (
    bucket_id = 'assessment-photos'
    and (storage.foldername(name))[1]::uuid in (
      select id from students where professional_id = my_professional_id()
    )
  );

create policy "student reads own assessment photos"
  on storage.objects for select
  using (
    bucket_id = 'assessment-photos'
    and (storage.foldername(name))[1]::uuid in (
      select id from students where email = auth.jwt() ->> 'email'
    )
  );

-- Área Nutri: orientação nutricional atual (texto livre) + PDF do plano,
-- definidos pelo profissional e visualizados pelo aluno. Uma linha por aluno
-- (não é histórico de versões — cada atualização substitui a anterior).

create table if not exists nutrition_guidance (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  student_id uuid not null unique references students(id) on delete cascade,
  orientacao text,
  pdf_path text,
  pdf_nome text,
  updated_at timestamptz not null default now()
);

alter table nutrition_guidance enable row level security;

create policy "professional manages own nutrition guidance"
  on nutrition_guidance for all
  using (professional_id = my_professional_id());

create policy "student reads own nutrition guidance"
  on nutrition_guidance for select
  using (student_id in (select id from students where email = auth.jwt() ->> 'email'));

-- Mantém updated_at correto a cada alteração feita pelo profissional.
create or replace function touch_nutrition_guidance_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists nutrition_guidance_touch_updated_at on nutrition_guidance;
create trigger nutrition_guidance_touch_updated_at
  before update on nutrition_guidance
  for each row
  execute function touch_nutrition_guidance_updated_at();

-- Bucket privado pros PDFs — acesso só via RLS abaixo, nunca por URL pública direta
-- (dado sensível de saúde). Caminho de cada arquivo: {student_id}/{nome do arquivo}.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nutri-pdfs', 'nutri-pdfs', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "professional manages own students pdfs"
  on storage.objects for all
  using (
    bucket_id = 'nutri-pdfs'
    and (storage.foldername(name))[1]::uuid in (
      select id from students where professional_id = my_professional_id()
    )
  );

create policy "student reads own pdf"
  on storage.objects for select
  using (
    bucket_id = 'nutri-pdfs'
    and (storage.foldername(name))[1]::uuid in (
      select id from students where email = auth.jwt() ->> 'email'
    )
  );

-- Foto de perfil do aluno. Sem coluna nova em nenhuma tabela: o caminho do
-- arquivo é sempre determinístico ({student_id}/avatar.jpg, upsert a cada
-- troca), então o front só tenta gerar a signed URL e trata "não existe"
-- como "sem foto ainda" — evita around-trip extra de escrever/ler um path
-- que já é previsível.
--
-- Diferente do assessment-photos (profissional escreve, aluno lê), aqui é
-- o inverso: o aluno é dono da própria foto, o profissional só lê quando
-- abre o painel de edição do aluno em alunos.html.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-avatars', 'student-avatars', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy "student manages own avatar"
  on storage.objects for all
  using (
    bucket_id = 'student-avatars'
    and (storage.foldername(name))[1]::uuid in (
      select id from students where email = auth.jwt() ->> 'email'
    )
  );

create policy "professional reads own students avatars"
  on storage.objects for select
  using (
    bucket_id = 'student-avatars'
    and (storage.foldername(name))[1]::uuid in (
      select id from students where professional_id = my_professional_id()
    )
  );

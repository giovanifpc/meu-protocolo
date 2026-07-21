-- Redesenho da personalização de marca (branding) do plano Pro/Elite.
-- Substitui a cor livre (hex arbitrário) por presets fixos — auditoria do
-- código encontrou que a cor livre já quebrava vários elementos hoje:
-- `--primary-dim` (usado em barras de progresso/texto de conquista) nunca
-- era recalculado, e boa parte dos "tints" de card (`.next-workout`,
-- `.ach-summary`, etc.) usava o azul padrão chumbado em rgba() em vez de
-- variável — cor customizada nunca refletia ali. Presets fixos garantem
-- contraste bom (texto branco sobre --primary) e paleta coerente em todo
-- lugar, incluindo um preset "Escuro" (5º, pedido do usuário) que inverte
-- fundo/texto/sombras — não é só uma cor, é um tema completo.
-- Escopo (decisão do usuário): personalização continua exclusiva do app do
-- ALUNO (aluno.html) — o painel do profissional não muda de cor.
alter table professionals
  add column if not exists color_preset text not null default 'azul'
  check (color_preset in ('azul','grafite','vinho','roxo','escuro'));

-- `primary_color`/`logo_url` (colunas antigas) ficam sem uso a partir de
-- agora — não removidas (histórico/rollback), só deixam de ser lidas ou
-- escritas pelo front. Logo agora é upload de verdade (bucket abaixo),
-- não mais uma URL externa colada.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('professional-logos', 'professional-logos', false, 1048576, array['image/png','image/jpeg'])
on conflict (id) do nothing;

create policy "professional manages own logo"
  on storage.objects for all
  using (
    bucket_id = 'professional-logos'
    and (storage.foldername(name))[1] = my_professional_id()::text
  );

-- Alunos leem o logo do próprio profissional (é o que aluno.html mostra no
-- topo da Home) — mesmo padrão de leitura cruzada já usado em
-- professional_exercise_videos.
create policy "student reads own professional logo"
  on storage.objects for select
  using (
    bucket_id = 'professional-logos'
    and (storage.foldername(name))[1]::uuid in (select my_student_professional_ids())
  );

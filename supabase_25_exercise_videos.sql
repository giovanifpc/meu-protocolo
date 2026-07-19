-- Vídeo próprio de execução de exercício (item 14 do roadmap, Fase D).
-- Decisão do usuário (2026-07-19): em vez de upload de arquivo (custo de
-- storage nosso, formato/duração pra limitar), o profissional cola um link
-- do YouTube por exercício — o vídeo mora no YouTube do profissional, nosso
-- storage não é tocado. É por PROFISSIONAL × EXERCÍCIO da biblioteca
-- compartilhada (não por protocolo/aluno individual): uma vez vinculado,
-- vale pra todos os alunos daquele profissional que tiverem esse exercício
-- em algum treino — dinâmico, não fica congelado dentro do jsonb de
-- training_protocols. O GIF da biblioteca continua como fallback quando não
-- há vídeo vinculado (aluno.html decide isso em tempo de render).
create table if not exists professional_exercise_videos (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  exercise_id integer not null references exercise_library(exercise_id) on delete cascade,
  youtube_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, exercise_id)
);

alter table professional_exercise_videos enable row level security;

create policy "professional manages own exercise videos"
  on professional_exercise_videos for all
  using (professional_id = my_professional_id())
  with check (professional_id = my_professional_id());

-- Aluno só lê os vínculos do próprio profissional — é o que aluno.html usa
-- pra decidir vídeo vs. GIF na hora de mostrar o exercício.
create policy "student reads own professional exercise videos"
  on professional_exercise_videos for select
  using (
    professional_id in (select professional_id from students where email = auth.jwt() ->> 'email')
  );

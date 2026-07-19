-- Coleta de dados do aluno (água + sono) — pré-requisito pra interpretação
-- de relatório por IA (feature Elite planejada em seguida): o relatório
-- precisa de dado de bem-estar diário além do treino em si. Padrão vindo
-- do app irmão Fox Performance (nutri.html/index.html, lido localmente só
-- como referência de estrutura — nunca dado ou marca), adaptado:
--   - Uma tabela só (não duas) — água e sono são ambos "check-in diário do
--     aluno", mesmo grão de dado (uma linha por dia), fica mais simples de
--     consultar junto quando o relatório de IA for construído.
--   - Persistido no Supabase desde o início — no Fox o sono ficou só em
--     localStorage (o próprio código de lá comenta que a tabela remota
--     nunca chegou a ser criada); aqui não faz sentido copiar essa lacuna,
--     já que o objetivo explícito é alimentar IA depois.
create table if not exists student_checkins (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  date_key date not null default current_date,
  water_ml integer,
  sleep_quality text check (sleep_quality in ('bem', 'mal')),
  sleep_duration text check (sleep_duration in ('menos6', '6a8', 'mais8')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, date_key)
);

alter table student_checkins enable row level security;

-- Aluno é dono do próprio check-in (insert/update via upsert, select, e
-- delete por padrão de "for all" — não há motivo pra restringir delete
-- aqui, é dado de bem-estar do próprio aluno, diferente de student_notes
-- que é nota privada do profissional sobre o aluno).
create policy "student manages own checkins"
  on student_checkins for all
  using (student_id in (select id from students where email = auth.jwt() ->> 'email'))
  with check (student_id in (select id from students where email = auth.jwt() ->> 'email'));

-- Profissional só lê — é o dado que vai alimentar a interpretação de
-- relatório por IA (Elite), nunca edita o check-in do aluno.
create policy "professional reads own students checkins"
  on student_checkins for select
  using (student_id in (select id from students where professional_id = my_professional_id()));

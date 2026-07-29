-- Nutritracker: diário alimentar do aluno (2026-07-29). Desenho fechado numa
-- sessão de escopo — ver seção própria em Status atual do CLAUDE.md pro
-- histórico completo da decisão. Resumo do porquê da estrutura:
--
-- O CFN (Nota Técnica nº 82/2023/CFN-UT) define "prescrição dietética" como
-- plano alimentar com VET + macro/micronutrientes + fracionamento — atividade
-- PRIVATIVA do nutricionista, fora das atribuições do profissional de
-- Educação Física. Por isso o app NUNCA calcula meta nenhuma sozinho: a única
-- meta que existe é transcrita pelo profissional depois de uma consulta REAL
-- com nutricionista parceira (fora do app). Até lá, o aluno só registra o que
-- comeu e vê o somatório — isso é medição, não prescrição, liberado em todo
-- plano desde o dia 1 (é o diferencial competitivo real: nenhum concorrente
-- pesquisado tem diário nativo).
--
-- Três tabelas:
--   1. food_library — base de alimentos (TACO + recorte curado do Open Food
--      Facts pra industrializados, os dois como seed público; curadoria vem
--      numa sessão separada) + item privado que o próprio ALUNO cria quando
--      não acha algo — mesmo padrão de exercise_library (supabase_47), mas
--      escopado por aluno em vez de por profissional, porque quem sabe o que
--      comeu é o aluno, não o personal.
--   2. student_food_log — o diário em si (refeição por refeição). Congela
--      nome + macros calculados no momento do registro (mesmo princípio já
--      usado em exercício customizado: editar/apagar o item da base depois
--      não pode alterar retroativamente um dia já registrado).
--   3. student_macro_goal — o bloco travado (meta + orientação do nutri +
--      PDF), sempre distinto do nutrition_guidance que já existe (esse
--      continua exatamente como está, livre pra qualquer profissional dar
--      orientação básica sem nutri parceira — os dois blocos CONVIVEM na UI,
--      decisão já fechada, nunca um substitui o outro). Exige nome + CRN +
--      UF da nutricionista (não só um upload livre) — mesma exigência ética
--      que a própria profissão já tem (nutricionista é obrigada a assinar
--      prescrição com nome+CRN), o que eleva o custo de fraudar de "esquecer
--      de avisar" pra "falsidade ideológica de verdade". `confirmado_em`
--      é o registro de auditoria da declaração de responsabilidade do
--      profissional — mesmo padrão enxuto já usado em student_consent
--      (timestamp, sem guardar o texto literal da declaração).

-- ============================================================
-- 1. food_library
-- ============================================================

create table if not exists food_library (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  grupo text,
  kcal_100g numeric not null,
  proteina_g_100g numeric not null,
  carboidrato_g_100g numeric not null,
  gordura_g_100g numeric not null,
  fibra_g_100g numeric,
  fonte text not null default 'taco' check (fonte in ('taco', 'openfoodfacts', 'personalizado')),
  created_by_student_id uuid references students(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table food_library enable row level security;

-- Leitura: item da base compartilhada (seed público, created_by_student_id
-- nulo) OU item próprio do aluno que está logado — mesmo filtro de dono já
-- usado em exercise_library, adaptado pra aluno.
create policy "read shared or own custom foods"
  on food_library for select
  to authenticated
  using (
    created_by_student_id is null
    or created_by_student_id in (select id from students where email = auth.jwt() ->> 'email')
  );

-- Insert/update/delete separados (em vez de "for all") pra não sobrepor a
-- policy de select acima com uma segunda condição de "select" redundante.
create policy "student creates own custom foods"
  on food_library for insert
  to authenticated
  with check (created_by_student_id in (select id from students where email = auth.jwt() ->> 'email'));

create policy "student updates own custom foods"
  on food_library for update
  to authenticated
  using (created_by_student_id in (select id from students where email = auth.jwt() ->> 'email'))
  with check (created_by_student_id in (select id from students where email = auth.jwt() ->> 'email'));

create policy "student deletes own custom foods"
  on food_library for delete
  to authenticated
  using (created_by_student_id in (select id from students where email = auth.jwt() ->> 'email'));

-- Garantia (não depende do client mandar o campo certo) de que todo item com
-- dono nunca fica marcado como se fosse seed público — sem isso, um insert
-- que esquecesse de mandar "fonte" cairia no default 'taco' e seria
-- rejeitado pela RLS de forma confusa, ou pior, ficaria mal classificado se
-- o default mudasse. Mesmo princípio de "garantia, não esperança" já usado
-- no veto de técnica por nível/barreira de downgrade.
create or replace function normalize_food_library_fonte()
returns trigger
language plpgsql
as $$
begin
  if new.created_by_student_id is not null then
    new.fonte := 'personalizado';
  end if;
  return new;
end;
$$;

drop trigger if exists food_library_normalize_fonte on food_library;
create trigger food_library_normalize_fonte
  before insert or update on food_library
  for each row
  execute function normalize_food_library_fonte();

-- ============================================================
-- 2. student_food_log
-- ============================================================

create table if not exists student_food_log (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  food_library_id uuid references food_library(id) on delete set null,
  nome_congelado text not null,
  quantidade_g numeric not null check (quantidade_g > 0),
  refeicao text not null check (refeicao in ('cafe_da_manha', 'lanche_manha', 'almoco', 'lanche_tarde', 'jantar', 'ceia')),
  kcal numeric not null,
  proteina_g numeric not null,
  carboidrato_g numeric not null,
  gordura_g numeric not null,
  data date not null default current_date,
  created_at timestamptz not null default now()
);

-- Consulta mais comum (somatório do dia) é sempre por aluno+data — mesmo
-- critério já usado em student_billing_charges pra justificar índice
-- dedicado (necessidade funcional real, não otimização especulativa).
create index if not exists student_food_log_student_date_idx
  on student_food_log(student_id, data);

alter table student_food_log enable row level security;

-- Aluno é dono do próprio diário (insert/update/delete/select), mesmo padrão
-- de student_checkins.
create policy "student manages own food log"
  on student_food_log for all
  using (student_id in (select id from students where email = auth.jwt() ->> 'email'))
  with check (student_id in (select id from students where email = auth.jwt() ->> 'email'));

-- Profissional só lê (acompanhar adesão) — nunca edita o diário do aluno.
create policy "professional reads own students food log"
  on student_food_log for select
  using (student_id in (select id from students where professional_id = my_professional_id()));

-- ============================================================
-- 3. student_macro_goal
-- ============================================================

create table if not exists student_macro_goal (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  student_id uuid not null unique references students(id) on delete cascade,
  nutricionista_nome text not null,
  nutricionista_crn text not null,
  nutricionista_crn_uf text not null,
  meta_kcal numeric,
  meta_proteina_g numeric,
  meta_carboidrato_g numeric,
  meta_gordura_g numeric,
  orientacao_resumo text,
  pdf_path text,
  pdf_nome text,
  confirmado_em timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table student_macro_goal enable row level security;

-- Profissional preenche/edita/revoga (delete apaga a linha e volta o app pro
-- estado travado — caminho de volta explícito, não só de ida). with check
-- também confirma que student_id pertence ao próprio profissional — mais
-- rígido que o padrão simples de nutrition_guidance (só checa
-- professional_id) porque essa tabela carrega dado de um profissional de
-- saúde de verdade (CRN) e é o alvo do desenho anti-fraude; vale o reforço.
create policy "professional manages own students macro goal"
  on student_macro_goal for all
  using (professional_id = my_professional_id())
  with check (
    professional_id = my_professional_id()
    and student_id in (select id from students where professional_id = my_professional_id())
  );

-- Aluno só lê — não define a própria meta, só recebe a validada.
create policy "student reads own macro goal"
  on student_macro_goal for select
  using (student_id in (select id from students where email = auth.jwt() ->> 'email'));

create or replace function touch_student_macro_goal_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.confirmado_em = now();
  return new;
end;
$$;

drop trigger if exists student_macro_goal_touch_updated_at on student_macro_goal;
create trigger student_macro_goal_touch_updated_at
  before update on student_macro_goal
  for each row
  execute function touch_student_macro_goal_updated_at();

-- PDF reaproveita o bucket nutri-pdfs que já existe (supabase_08_nutrition.sql)
-- — mesma RLS de storage já cobre qualquer arquivo dentro da pasta
-- {student_id}/, não precisa de policy nova. Só a CONVENÇÃO de nome muda pra
-- não colidir com o upload livre que nutrition_guidance já usa:
--   nutrition_guidance.pdf_path  -> {student_id}/{nome escolhido no upload}
--   student_macro_goal.pdf_path  -> {student_id}/meta-validada.pdf

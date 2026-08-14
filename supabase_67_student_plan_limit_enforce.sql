-- Limite de aluno por plano (Starter=15, Pro=40, Elite=ilimitado) só era
-- checado no client (alunos.html, PLAN_STUDENT_LIMITS) — nenhuma trava no
-- servidor. Achado numa análise de ameaça (2026-08-14): qualquer
-- profissional autenticado, chamando a API do Supabase direto (console do
-- navegador, curl — nunca precisou passar pela tela), conseguia cadastrar
-- alunos ilimitados pagando preço de Starter. É abuso de recurso/receita,
-- não vazamento de dado de terceiro, mas real e fácil de explorar.
--
-- Trigger em vez de RLS `with check` — mais direto pra uma regra que
-- depende de contar linhas já existentes (RLS `with check` reavalia por
-- linha, mas contar direito exige o mesmo tipo de subquery de qualquer
-- jeito; trigger é o padrão mais claro do Postgres pra esse tipo de regra
-- de negócio). SECURITY DEFINER porque `students` não tem policy de select
-- pra contagem cross-check nem precisa — a trigger roda com privilégio
-- próprio, não depende da RLS de quem está inserindo.
create or replace function enforce_student_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_limit integer;
  v_count integer;
begin
  select plan into v_plan from professionals where id = new.professional_id;

  -- Mesmos números de PLAN_STUDENT_LIMITS em alunos.html — se um dia
  -- divergir, o servidor manda (client é só UX/feedback antecipado).
  v_limit := case v_plan
    when 'starter' then 15
    when 'pro' then 40
    else null -- elite (ou plano desconhecido/futuro): sem limite
  end;

  if v_limit is not null then
    select count(*) into v_count from students where professional_id = new.professional_id;
    if v_count >= v_limit then
      raise exception 'Limite de % alunos do plano % atingido. Faça upgrade de plano pra cadastrar mais.', v_limit, v_plan;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_student_plan_limit on students;
create trigger trg_enforce_student_plan_limit
  before insert on students
  for each row execute function enforce_student_plan_limit();

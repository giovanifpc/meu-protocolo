-- Chatbot de suporte via IA (Fase C, item 9) — as duas únicas funções de
-- acesso a dado que a IA de suporte pode chamar, conforme fechado em
-- contexto-ia-suporte.md (seção 3, regra 3): lista fechada, só-leitura,
-- sempre escopadas ao profissional da sessão logada via auth.jwt() ->> 'email'
-- (nunca por um ID/nome informado dentro da conversa) — mesmo padrão de
-- my_professional_id() (supabase_06_training.sql). A trava é o backend, não
-- o comportamento da IA.

create or replace function get_my_account_status()
returns table (
  plan text,
  status text,
  trial_ends_at timestamptz,
  mp_subscription_status text,
  ultima_cobranca_status text,
  ultima_cobranca_em timestamptz,
  valor_customizado numeric,
  alunos_count bigint,
  alunos_limit integer
)
language sql
security definer
set search_path = public
as $$
  select
    p.plan, p.status, p.trial_ends_at, p.mp_subscription_status,
    p.ultima_cobranca_status, p.ultima_cobranca_em, p.valor_customizado,
    (select count(*) from students s where s.professional_id = p.id) as alunos_count,
    case p.plan when 'starter' then 15 when 'pro' then 40 else null end as alunos_limit
  from professionals p
  where p.email = auth.jwt() ->> 'email';
$$;

-- Busca só dentro dos próprios alunos do profissional logado — o parâmetro
-- nome_do_aluno só filtra dentro desse conjunto, nunca abre pra outro tenant.
create or replace function check_student_protocol_status(nome_do_aluno text)
returns table (
  aluno_encontrado boolean,
  nome text,
  status_protocolo text,
  atualizado_em timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_professional_id uuid;
  v_student_id uuid;
  v_student_nome text;
  v_status text;
  v_atualizado_em timestamptz;
begin
  select id into v_professional_id from professionals where email = auth.jwt() ->> 'email';
  if v_professional_id is null then
    return query select false, null::text, null::text, null::timestamptz;
    return;
  end if;

  select s.id, s.nome into v_student_id, v_student_nome
  from students s
  where s.professional_id = v_professional_id
    and s.nome ilike '%' || nome_do_aluno || '%'
  order by s.nome
  limit 1;

  if v_student_id is null then
    return query select false, null::text, null::text, null::timestamptz;
    return;
  end if;

  select tp.status, coalesce(tp.publicado_em, tp.created_at)
    into v_status, v_atualizado_em
  from training_protocols tp
  where tp.student_id = v_student_id
  order by tp.created_at desc
  limit 1;

  return query select true, v_student_nome, coalesce(v_status, 'sem_protocolo'), v_atualizado_em;
end;
$$;

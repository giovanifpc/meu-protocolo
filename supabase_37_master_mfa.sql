-- 2FA obrigatório no painel master + plano de contingência (item 17 do
-- roadmap, último item de dev pendente antes de considerar o MVP fechado).
--
-- Problema real que isso fecha: hoje, "segurança do master" é só um e-mail
-- (meuprotocolo1@gmail.com) — quem completa o OTP desse e-mail tem CRUD
-- completo de todos os tenants (plano, preço, status, isenção de cobrança)
-- e lê o log de conversas de suporte de todo mundo. É um fator só. Se essa
-- caixa de e-mail for comprometida, o painel master vai junto.
--
-- Correção de verdade (não é só esconder um botão no client): todas as RPCs
-- master_* passam a exigir, além do e-mail, que o JWT tenha completado um
-- desafio de MFA nesta sessão (claim `aal` = 'aal2', que o próprio Supabase
-- Auth inclui no token depois de auth.mfa.verify()). Checar isso só no
-- client (master.html) seria só UX — quem tivesse o access token de uma
-- sessão aal1 ainda conseguiria chamar a RPC direto via curl/REST. A
-- checagem real é aqui dentro, ao lado da checagem de e-mail que já existia.
--
-- Contingência: MFA nativo do Supabase (TOTP) não tem "backup codes"
-- embutido. Sem um plano B, um autenticador perdido travaria o próprio
-- Giovani pra sempre fora do painel master (é um usuário só, sem suporte
-- por trás pra resetar). master_recovery_codes guarda 8 códigos de uso
-- único (hash sha256, nunca o texto puro) gerados no momento do cadastro
-- do autenticador — servem pra autorizar a Edge Function
-- master-mfa-recovery a apagar o fator TOTP antigo via Admin API (única
-- forma de fazer isso, não existe client-side pra apagar fator de outrem)
-- e permitir cadastrar um novo do zero.

create extension if not exists pgcrypto;

-- ── Enforço de aal2 nas RPCs já existentes ──────────────────────────────
-- Mesmas assinaturas/retornos de hoje (supabase_16/20/29/34/36) — só a
-- checagem de autorização muda.

create or replace function master_list_professionals()
returns table (
  id uuid,
  email text,
  display_name text,
  plan text,
  status text,
  valor_customizado numeric,
  trial_ends_at timestamptz,
  created_at timestamptz,
  billing_exempt boolean,
  alunos_count bigint
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.email, p.display_name, p.plan, p.status, p.valor_customizado,
         p.trial_ends_at, p.created_at, p.billing_exempt,
         (select count(*) from students s where s.professional_id = p.id) as alunos_count
  from professionals p
  where auth.jwt() ->> 'email' = 'meuprotocolo1@gmail.com'
    and auth.jwt() ->> 'aal' = 'aal2'
  order by p.created_at desc;
$$;

create or replace function master_update_professional(
  prof_id uuid,
  new_status text default null,
  new_plan text default null,
  new_valor_customizado numeric default null,
  clear_valor_customizado boolean default false,
  new_billing_exempt boolean default null,
  new_trial_ends_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.jwt() ->> 'email' <> 'meuprotocolo1@gmail.com' or auth.jwt() ->> 'aal' <> 'aal2' then
    raise exception 'Não autorizado.';
  end if;

  update professionals set
    status = coalesce(new_status, status),
    plan = coalesce(new_plan, plan),
    valor_customizado = case
      when clear_valor_customizado then null
      when new_valor_customizado is not null then new_valor_customizado
      else valor_customizado
    end,
    billing_exempt = coalesce(new_billing_exempt, billing_exempt),
    trial_ends_at = coalesce(new_trial_ends_at, trial_ends_at)
  where id = prof_id;
end;
$$;

create or replace function master_create_professional(
  p_email text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.jwt() ->> 'email' <> 'meuprotocolo1@gmail.com' or auth.jwt() ->> 'aal' <> 'aal2' then
    raise exception 'Não autorizado.';
  end if;

  if p_email is null or p_email = '' then
    raise exception 'E-mail é obrigatório.';
  end if;
  if p_display_name is null or p_display_name = '' then
    raise exception 'Nome é obrigatório.';
  end if;

  insert into professionals (email, display_name, status, trial_ends_at)
  values (lower(trim(p_email)), p_display_name, 'trial', now() + interval '14 days')
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Já existe um profissional cadastrado com esse e-mail.';
end;
$$;

create or replace function master_list_support_conversations()
returns table (
  conversation_id uuid,
  professional_id uuid,
  professional_nome text,
  started_at timestamptz,
  last_message_at timestamptz,
  message_count bigint,
  preview text
)
language sql
security definer
set search_path = public
as $$
  select
    m.conversation_id,
    m.professional_id,
    p.display_name,
    min(m.created_at) as started_at,
    max(m.created_at) as last_message_at,
    count(*) as message_count,
    (array_agg(m.content order by m.created_at) filter (where m.role = 'user'))[1] as preview
  from support_messages m
  join professionals p on p.id = m.professional_id
  where auth.jwt() ->> 'email' = 'meuprotocolo1@gmail.com'
    and auth.jwt() ->> 'aal' = 'aal2'
  group by m.conversation_id, m.professional_id, p.display_name
  order by max(m.created_at) desc
  limit 200;
$$;

create or replace function master_get_support_conversation(conv_id uuid)
returns table (
  role text,
  content text,
  tool_trace jsonb,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select m.role, m.content, m.tool_trace, m.created_at
  from support_messages m
  where m.conversation_id = conv_id
    and auth.jwt() ->> 'email' = 'meuprotocolo1@gmail.com'
    and auth.jwt() ->> 'aal' = 'aal2'
  order by m.created_at;
$$;

create or replace function master_get_revenue_summary()
returns table (
  total_recebido numeric,
  recebido_mes_atual numeric,
  mrr_projetado numeric,
  assinantes_ativos bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.jwt() ->> 'email' <> 'meuprotocolo1@gmail.com' or auth.jwt() ->> 'aal' <> 'aal2' then
    raise exception 'Não autorizado.';
  end if;

  return query
  with pagamentos as (
    select
      (payload->>'transaction_amount')::numeric as valor,
      coalesce((payload->>'date_approved')::timestamptz, processed_at) as data_pagamento
    from billing_events
    where mp_type = 'payment' and payload->>'status' = 'approved'
  )
  select
    coalesce((select sum(valor) from pagamentos), 0),
    coalesce((select sum(valor) from pagamentos where date_trunc('month', data_pagamento) = date_trunc('month', now())), 0),
    coalesce((select sum(coalesce(pr.valor_customizado, case pr.plan when 'starter' then 79 when 'pro' then 139 when 'elite' then 249 end))
              from professionals pr
              where pr.status = 'ativo' and pr.billing_exempt = false and pr.mp_subscription_status = 'authorized'), 0),
    (select count(*) from professionals pr
     where pr.status = 'ativo' and pr.billing_exempt = false and pr.mp_subscription_status = 'authorized');
end;
$$;

create or replace function master_list_active_subscribers()
returns table (
  display_name text,
  plan text,
  valor_mensal numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.jwt() ->> 'email' <> 'meuprotocolo1@gmail.com' or auth.jwt() ->> 'aal' <> 'aal2' then
    raise exception 'Não autorizado.';
  end if;

  return query
  select
    p.display_name,
    p.plan,
    coalesce(p.valor_customizado, case p.plan when 'starter' then 79 when 'pro' then 139 when 'elite' then 249 end)
  from professionals p
  where p.status = 'ativo' and p.billing_exempt = false and p.mp_subscription_status = 'authorized'
  order by valor_mensal desc;
end;
$$;

create or replace function master_list_received_payments(p_limit int default 50)
returns table (
  professional_nome text,
  valor numeric,
  data_pagamento timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.jwt() ->> 'email' <> 'meuprotocolo1@gmail.com' or auth.jwt() ->> 'aal' <> 'aal2' then
    raise exception 'Não autorizado.';
  end if;

  return query
  select
    coalesce(p.display_name, '(profissional removido)'),
    (be.payload->>'transaction_amount')::numeric,
    coalesce((be.payload->>'date_approved')::timestamptz, be.processed_at)
  from billing_events be
  left join professionals p on p.id = be.professional_id
  where be.mp_type = 'payment' and be.payload->>'status' = 'approved'
  order by coalesce((be.payload->>'date_approved')::timestamptz, be.processed_at) desc
  limit p_limit;
end;
$$;

-- ── Códigos de recuperação (contingência de autenticador perdido) ───────
-- Mesmo padrão de blindagem total já usado em `messages`/`support_messages`:
-- RLS ligada, zero policy — acesso 100% via RPC SECURITY DEFINER, nunca
-- REST direto. Só guarda o hash (sha256), nunca o código em texto puro.
create table if not exists master_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table master_recovery_codes enable row level security;

-- Gera um novo lote de 8 códigos, invalidando qualquer lote anterior (evita
-- ter códigos antigos esquecidos por aí que ainda funcionariam). Exige
-- aal2 de propósito — só quem já provou ter o autenticador em mãos pode
-- gerar/ver novos códigos de recuperação pra ele mesmo. Chamada logo após
-- o cadastro do autenticador (quando a sessão já vira aal2 na hora) e,
-- opcionalmente, de novo quando o profissional quiser rotacionar os códigos.
create or replace function master_generate_recovery_codes()
returns text[]
language plpgsql
security definer
-- "extensions" no search_path é necessário porque o Supabase instala o
-- pgcrypto (gen_random_bytes/digest) nesse schema, não em "public" — sem
-- isso, "function gen_random_bytes(integer) does not exist" (bug real
-- encontrado em produção, 2026-07-24, mesma sessão do bug do DELETE acima).
set search_path = public, extensions
as $$
declare
  v_codes text[] := '{}';
  v_raw text;
  v_code text;
  i int;
begin
  if auth.jwt() ->> 'email' <> 'meuprotocolo1@gmail.com' or auth.jwt() ->> 'aal' <> 'aal2' then
    raise exception 'Não autorizado.';
  end if;

  -- "where true" é necessário mesmo apagando tudo: a role authenticator
  -- roda com a extensão safeupdate (padrão de segurança do Supabase),
  -- que bloqueia DELETE/UPDATE sem WHERE — sem isso, todo cadastro de
  -- MFA falhava na hora de gerar os códigos de recuperação com o erro
  -- "DELETE requires a WHERE clause" (bug real encontrado em produção,
  -- 2026-07-24, logo depois do primeiro fator TOTP ser confirmado).
  delete from master_recovery_codes where true;

  for i in 1..8 loop
    v_raw := upper(encode(gen_random_bytes(6), 'hex')); -- 12 chars hex
    v_code := substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4) || '-' || substr(v_raw, 9, 4);
    v_codes := array_append(v_codes, v_code);
    insert into master_recovery_codes (code_hash) values (encode(digest(v_code, 'sha256'), 'hex'));
  end loop;

  return v_codes;
end;
$$;

-- Consome um código de recuperação (uso único). Propositalmente NÃO exige
-- aal2 — é exatamente o caminho pra quando o autenticador já foi perdido.
-- Só checa o e-mail master (aal1 já é suficiente pra isso, mesma barra de
-- entrada de sempre: precisa ter completado o OTP daquele e-mail). Chamada
-- só pela Edge Function master-mfa-recovery, nunca direto do client — o
-- reset de fato do fator MFA depende de Admin API (service role), que só
-- existe dentro da function.
create or replace function master_verify_recovery_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_id uuid;
begin
  if auth.jwt() ->> 'email' <> 'meuprotocolo1@gmail.com' then
    raise exception 'Não autorizado.';
  end if;

  v_hash := encode(digest(upper(trim(p_code)), 'sha256'), 'hex');

  select id into v_id from master_recovery_codes
  where code_hash = v_hash and used_at is null
  limit 1;

  if v_id is null then
    return false;
  end if;

  update master_recovery_codes set used_at = now() where id = v_id;
  return true;
end;
$$;

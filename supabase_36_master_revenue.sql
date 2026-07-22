-- Aba "Receita" do painel master — visão de fluxo de dinheiro do próprio
-- Meu Protocolo (profissional pagando pelo uso do app), não confundir com
-- mensalidade aluno→profissional. Duas partes, definição fechada com o
-- usuário antes de codar:
-- "Recebido" = ledger real, extraído de billing_events (payload de verdade
-- do Mercado Pago via webhook) — nunca inventa número.
-- "A receber" = receita recorrente mensal PROJETADA (MRR): soma do valor
-- mensal (customizado ou de tabela) de todo profissional com assinatura
-- ativa de verdade (status='ativo', não isento, mp_subscription_status
-- autorizado). Não existe "data da próxima cobrança" guardada em lugar
-- nenhum (Mercado Pago não expõe isso via webhook) — é uma projeção, não
-- um calendário exato, e a UI deixa isso explícito.

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
  if auth.jwt() ->> 'email' <> 'meuprotocolo1@gmail.com' then
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

-- Detalhe de quem compõe o MRR projetado — transparência sobre o número
-- agregado, não só o total.
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
  if auth.jwt() ->> 'email' <> 'meuprotocolo1@gmail.com' then
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

-- Ledger real de pagamentos aprovados (histórico, não projeção).
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
  if auth.jwt() ->> 'email' <> 'meuprotocolo1@gmail.com' then
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

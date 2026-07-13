-- Cobrança recorrente do profissional via Mercado Pago (assinatura/preapproval).
-- Não confundir com mensalidade_valor/mensalidade_dia_vencimento em students
-- (supabase_12_engagement.sql) — aquilo é o aluno pagando o profissional,
-- isso aqui é o profissional pagando o Meu Protocolo pelo uso do app.

alter table professionals add column if not exists mp_preapproval_id text unique;
alter table professionals add column if not exists mp_subscription_status text
  check (mp_subscription_status in ('pending', 'authorized', 'paused', 'cancelled'));
alter table professionals add column if not exists ultima_cobranca_status text
  check (ultima_cobranca_status in ('approved', 'rejected', 'pending', 'in_process'));
alter table professionals add column if not exists ultima_cobranca_em timestamptz;

-- Log/idempotência dos webhooks recebidos do Mercado Pago. O Mercado Pago pode
-- reenviar a mesma notificação mais de uma vez — a unique (mp_id, mp_type)
-- garante que só processamos cada evento uma vez. Só a Edge Function
-- (service role) acessa esta tabela; sem policy pra usuário nenhum.
create table if not exists billing_events (
  id uuid primary key default gen_random_uuid(),
  mp_id text not null,
  mp_type text not null,
  professional_id uuid references professionals(id) on delete set null,
  payload jsonb,
  processed_at timestamptz not null default now(),
  unique (mp_id, mp_type)
);

alter table billing_events enable row level security;

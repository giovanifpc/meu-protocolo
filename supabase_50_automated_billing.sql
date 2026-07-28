-- Cobrança automática (aluno -> profissional, nível 1) + aviso antecipado da
-- própria assinatura do profissional (nível 2) — escopo fechado com o usuário
-- ao longo de 2026-07-27/28, ver CLAUDE.md ("Escopo FECHADO... cobrança
-- automática"). Mercado Pago nos dois níveis, mesma infra já usada pra
-- assinatura do profissional (supabase_14_billing.sql).
--
-- IMPORTANTE (tokens OAuth): os access/refresh token da conta conectada do
-- profissional NUNCA podem viver numa coluna comum de `professionals` — RLS
-- de tabela não esconde coluna, e a policy "professional reads own row" já
-- daria ao próprio profissional (via anon key) leitura direta do token pelo
-- client. Por isso os tokens vivem numa tabela própria, RLS habilitada e
-- **zero policy** (mesmo padrão de bloqueio total já usado em
-- master_recovery_codes/messages/support_messages) — acesso só via Edge
-- Function com service role.

-- ===== Nível 1: conta Mercado Pago conectada do profissional =====

alter table professionals add column if not exists mp_connect_status text not null default 'nao_conectado'
  check (mp_connect_status in ('nao_conectado', 'conectado', 'revogado'));

-- Aviso antecipado da própria assinatura (nível 2) — guarda a data de
-- cobrança (não só "hoje") pra não duplicar o e-mail se o cron rodar mais de
-- uma vez no mesmo dia nem pular um ciclo se travar um dia.
alter table professionals add column if not exists last_billing_email_sent_for date;

create table if not exists professional_mp_connections (
  professional_id uuid primary key references professionals(id) on delete cascade,
  mp_user_id text,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table professional_mp_connections enable row level security;

-- Nonce de CSRF do fluxo OAuth (state) — vive pouco tempo, só liga o
-- redirect de volta da Mercado Pago ao professional_id que iniciou o
-- connect. RLS travada (mesmo motivo da tabela acima), só Edge Function
-- acessa.
create table if not exists mp_oauth_states (
  state text primary key,
  professional_id uuid not null references professionals(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table mp_oauth_states enable row level security;

-- ===== Nível 1: método de cobrança e ledger por aluno =====

alter table students add column if not exists mp_charge_method text not null default 'nenhum'
  check (mp_charge_method in ('nenhum', 'cartao', 'pix_avulso'));
alter table students add column if not exists mp_preapproval_id text unique;
alter table students add column if not exists mp_subscription_status text;
alter table students add column if not exists dunning_attempts int not null default 0;
-- Idempotência do cron (lacuna 7 do desenho): guarda a data de vencimento
-- (não "hoje") pra a qual o lembrete/Pix deste ciclo já foi processado —
-- sobrevive a reruns do cron no mesmo dia sem duplicar Pix nem e-mail.
alter table students add column if not exists last_reminder_sent_for_due date;
-- Pix avulso do ciclo corrente (gerado automaticamente pelo cron, 3 dias
-- antes do vencimento) — mostrado também dentro do app, não só no e-mail.
alter table students add column if not exists pix_pending_payment_id text;
alter table students add column if not exists pix_pending_qr_base64 text;
alter table students add column if not exists pix_pending_copy_paste text;
alter table students add column if not exists pix_pending_expires_at timestamptz;
-- Só pra exibição na tela do aluno ("cartão terminado em X, validade Y") —
-- vem do retorno do createCardToken no client, nunca do PAN completo.
alter table students add column if not exists mp_card_last4 text;
alter table students add column if not exists mp_card_expiry text;

create table if not exists student_billing_charges (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  professional_id uuid not null references professionals(id) on delete cascade,
  metodo text not null check (metodo in ('cartao', 'pix_avulso')),
  mp_payment_id text,
  status text not null,
  valor numeric not null,
  taxa_retida numeric not null default 0,
  valor_liquido numeric not null,
  motivo_falha text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table student_billing_charges enable row level security;

create policy "professional reads own student charges"
  on student_billing_charges for select
  using (professional_id in (select id from professionals where email = auth.jwt() ->> 'email'));

create policy "student reads own charges"
  on student_billing_charges for select
  using (student_id in (select id from students where email = auth.jwt() ->> 'email'));

-- Nenhuma policy de insert/update/delete em student_billing_charges — o
-- ledger só é escrito pelas Edge Functions (service role), nunca pelo
-- client, mesmo padrão de billing_events (supabase_14).

create index if not exists idx_student_billing_charges_student on student_billing_charges(student_id);
create index if not exists idx_student_billing_charges_professional on student_billing_charges(professional_id, created_at desc);
-- Upsert-friendly: o webhook pode entregar o mesmo pagamento mais de uma vez
-- (ex: pending -> approved) — isso evita duplicar linha no ledger.
create unique index if not exists idx_student_billing_charges_payment on student_billing_charges(student_id, mp_payment_id) where mp_payment_id is not null;

comment on table professional_mp_connections is 'Tokens OAuth da conta Mercado Pago conectada do profissional (nível 1, cobrança automática dos alunos). RLS sem policy — acesso só via Edge Function com service role.';
comment on table mp_oauth_states is 'Nonce de curta duração do fluxo OAuth Connect. RLS sem policy — acesso só via Edge Function.';
comment on table student_billing_charges is 'Ledger de cobranças automatizadas aluno->profissional (cartão ou Pix avulso), alimentado pelo webhook do Mercado Pago.';

-- ===== Cron diário do aviso de cobrança (nível 1 + nível 2) =====
--
-- O segredo que autentica a chamada HTTP nunca aparece neste arquivo — fica
-- só no Vault do Supabase (select vault.create_secret(valor, 'CRON_SHARED_SECRET', ...),
-- rodado manualmente uma vez, fora do controle de versão) e como Edge
-- Function secret (supabase secrets set CRON_SHARED_SECRET=...), o MESMO
-- valor nos dois lugares. pg_net faz a chamada HTTP de dentro do Postgres.
create extension if not exists pg_net;

select cron.schedule(
  'billing-cron-daily',
  '0 13 * * *', -- 10h em Brasília (UTC-3)
  $$
  select net.http_post(
    url := 'https://yumqmramxbahkfxsthtt.supabase.co/functions/v1/billing-cron-daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SHARED_SECRET')
    ),
    body := '{}'::jsonb
  );
  $$
);

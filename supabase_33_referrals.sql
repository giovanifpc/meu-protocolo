-- Programa de indicação (item 16 do roadmap) — link rastreável por
-- profissional. Só quem indica é recompensado (decisão do usuário, não é
-- bilateral): quando o indicado faz a 1ª cobrança real (não só o cadastro),
-- quem indicou ganha 1 crédito de mês grátis, aplicado como estorno
-- automático da cobrança seguinte dele (mercadopago-webhook, alterado à
-- parte). O motivo de estornar em vez de zerar o valor por um ciclo: a API
-- de assinatura do Mercado Pago não tem um jeito nativo de "pular a próxima
-- cobrança" — zerar o valor exigiria lembrar de reverter depois (robô/cron
-- extra), enquanto estornar a cobrança que acabou de ser aprovada é reativo
-- e não depende de acertar timing nenhum.

alter table professionals
  add column if not exists referral_code text unique
    default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  add column if not exists referred_by uuid references professionals(id),
  add column if not exists referral_credit_months integer not null default 0;

-- Backfill: a coluna nova só aplica o default em INSERTs futuros, então
-- profissionais já existentes nasceriam com referral_code nulo sem isso.
update professionals set referral_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
  where referral_code is null;

-- Log de indicações — uma linha por profissional indicado (referred_id é
-- único: cada conta só pode ter sido indicada por alguém uma vez, nunca
-- reatribuída depois).
create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references professionals(id) on delete cascade,
  referred_id uuid not null unique references professionals(id) on delete cascade,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz
);

alter table referrals enable row level security;

-- Profissional só vê as indicações que ELE fez — quem indicou quem só
-- interessa a quem indicou, não ao indicado (sem policy de select pro
-- indicado enxergar essa linha).
create policy "professional reads own referrals"
  on referrals for select
  using (referrer_id = my_professional_id());

-- Cria a linha de indicação automaticamente quando referred_by é setado —
-- garantia via trigger, não depende do client lembrar de inserir também.
create or replace function create_referral_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into referrals (referrer_id, referred_id)
  values (new.referred_by, new.id)
  on conflict (referred_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_create_referral_row on professionals;
create trigger trg_create_referral_row
  after insert or update of referred_by on professionals
  for each row
  when (new.referred_by is not null)
  execute function create_referral_row();

-- Único jeito de vincular uma indicação: resolve o CÓDIGO server-side (o
-- client nunca manda um id de profissional direto, só o código) e só seta
-- referred_by se ainda estiver nulo (não dá pra reatribuir depois) e se não
-- for auto-indicação. Chamada por onboarding.html logo depois de criar a
-- própria linha em professionals.
create or replace function claim_referral(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_my_id uuid;
  v_referrer_id uuid;
begin
  select id into v_my_id from professionals where email = auth.jwt() ->> 'email';
  if v_my_id is null then
    return;
  end if;

  select id into v_referrer_id from professionals where referral_code = p_code;
  if v_referrer_id is null or v_referrer_id = v_my_id then
    return; -- código inválido ou auto-indicação: ignora silenciosamente
  end if;

  update professionals
  set referred_by = v_referrer_id
  where id = v_my_id and referred_by is null;
end;
$$;

-- Usadas pelo mercadopago-webhook (service role) pra creditar/consumir mês
-- grátis com incremento/decremento atômico, sem race condition de
-- leitura-then-escrita.
create or replace function increment_referral_credit(p_professional_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update professionals set referral_credit_months = referral_credit_months + 1 where id = p_professional_id;
$$;

create or replace function decrement_referral_credit(p_professional_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update professionals set referral_credit_months = greatest(0, referral_credit_months - 1) where id = p_professional_id;
$$;

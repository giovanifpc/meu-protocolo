-- Fecha o gap de "indicação em anel" (2026-08-14, item 2 da lista de
-- pendências pós-invasão): hoje nada impede várias contas-alias se
-- indicando entre si pra gerar crédito de indicação falso, porque não
-- existe nenhum dado que amarre duas contas à mesma pessoa real. A
-- auto-indicação direta já é bloqueada (claim_referral, supabase_33),
-- isso aqui é o próximo nível — mesma pessoa, contas diferentes.
--
-- cpf_hash NUNCA guarda o CPF em texto puro — é um HMAC-SHA256 com uma
-- chave secreta que só existe como env var da Edge Function `hash-cpf`
-- (CPF_HASH_SECRET, nunca exposta ao client). Isso é diferente de um
-- hash comum: CPF tem baixíssima entropia real (~100-200 milhões de
-- combinações válidas), um hash sem chave secreta seria reversível por
-- força bruta trivial se vazasse — só a chave torna o valor guardado
-- inofensivo mesmo num vazamento de banco.
alter table professionals add column if not exists cpf_hash text;

-- Índice pra tornar a checagem de colisão (increment_referral_credit
-- abaixo) rápida mesmo com a base crescendo.
create index if not exists idx_professionals_cpf_hash on professionals(cpf_hash) where cpf_hash is not null;

-- increment_referral_credit ganha um 2º parâmetro (p_referred_id) e passa
-- a checar colisão de cpf_hash antes de creditar — se o CPF de quem
-- acabou de pagar (referred) já aparece em QUALQUER outra conta do
-- sistema, não é um cliente novo de verdade, é a mesma pessoa girando
-- entre contas. Retorna boolean (creditou ou não) pra o webhook poder
-- logar/decidir o que fazer.
--
-- Fail-open deliberado quando cpf_hash é nulo (conta antiga, de antes
-- desta feature, ou que nunca re-digitou o cartão): sem dado nenhum pra
-- comparar, não faz sentido bloquear um crédito legítimo só por falta de
-- informação — essa checagem é uma camada extra de defesa, não a única.
create or replace function increment_referral_credit(p_professional_id uuid, p_referred_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referred_cpf_hash text;
  v_dup_count integer;
begin
  if p_referred_id is not null then
    select cpf_hash into v_referred_cpf_hash from professionals where id = p_referred_id;
    if v_referred_cpf_hash is not null then
      select count(*) into v_dup_count
      from professionals
      where cpf_hash = v_referred_cpf_hash and id <> p_referred_id;
      if v_dup_count > 0 then
        return false; -- CPF já usado em outra conta — recusa creditar, sem bloquear o resto do fluxo
      end if;
    end if;
  end if;

  update professionals set referral_credit_months = referral_credit_months + 1 where id = p_professional_id;
  return true;
end;
$$;

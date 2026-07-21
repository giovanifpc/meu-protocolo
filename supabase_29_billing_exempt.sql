-- Conta isenta de cobrança (uso: contas de teste do próprio Giovani, e o
-- programa Founder planejado — primeiros 5 profissionais fundadores vão
-- ganhar trial sem cartão obrigatório no cadastro, cartão só é pedido
-- depois do período — esse flag é o mecanismo que sustenta os dois casos).
--
-- Sem isso, login.html manda todo profissional sem mp_preapproval_id de
-- volta pro onboarding (passo do cartão) — correto pro caso normal (cartão
-- cadastrado desde o dia 1, conforme o master doc), mas trava pra sempre
-- quem nunca vai ter um preapproval de verdade.
alter table professionals add column if not exists billing_exempt boolean not null default false;

-- Precisa dropar antes: Postgres não deixa CREATE OR REPLACE mudar o
-- formato das colunas de retorno (RETURNS TABLE) de uma função existente.
drop function if exists master_list_professionals();

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
  order by p.created_at desc;
$$;

create or replace function master_update_professional(
  prof_id uuid,
  new_status text default null,
  new_plan text default null,
  new_valor_customizado numeric default null,
  clear_valor_customizado boolean default false,
  new_billing_exempt boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.jwt() ->> 'email' <> 'meuprotocolo1@gmail.com' then
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
    billing_exempt = coalesce(new_billing_exempt, billing_exempt)
  where id = prof_id;
end;
$$;

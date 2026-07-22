-- Cadastro manual de profissional pelo painel master — pra registrar um
-- cliente fundador ANTES do primeiro login dele (fluxo pensado pro programa
-- Founder/Cliente 0, ver roadmap-pos-dev.md Fase 4). Sem isso, a única forma
-- de um profissional existir era ele mesmo passar pelo onboarding.html
-- (nome + cartão) — aqui o Giovani cria a conta com nome+e-mail combinados
-- na conversa, define plano/preço/isenção pelos controles que já existiam
-- na própria linha da tabela, e só depois avisa o profissional pra logar.
-- Login com isenção já ligada pula onboarding.html inteiro (login.html já
-- manda billing_exempt=true direto pro index.html) — o profissional nunca
-- vê a tela de cartão nem escolhe o próprio nome nesse primeiro acesso
-- (pode trocar depois em perfil.html, campo que já existe).

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
  if auth.jwt() ->> 'email' <> 'meuprotocolo1@gmail.com' then
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

-- Trial flexível (Fase 4 do roadmap: "até a entrevista de validação", não um
-- prazo fixo) — antes não dava pra ajustar trial_ends_at pelo painel, só via
-- SQL direto. Adiciona o parâmetro no fim da lista (compatível com
-- CREATE OR REPLACE, não muda o formato de retorno).
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
    billing_exempt = coalesce(new_billing_exempt, billing_exempt),
    trial_ends_at = coalesce(new_trial_ends_at, trial_ends_at)
  where id = prof_id;
end;
$$;

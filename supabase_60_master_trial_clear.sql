-- Achado real de varredura de fluxo (2026-08-05): o campo "Trial até" em
-- master.html é apresentado como "ajuste livre" (title do input), mas
-- apagar a data e clicar "Salvar" nunca funcionava de verdade —
-- trialRaw === '' manda new_trial_ends_at: null, e master_update_professional
-- fazia `trial_ends_at = coalesce(new_trial_ends_at, trial_ends_at)`, então
-- um null era silenciosamente ignorado e o valor antigo permanecia no
-- banco. Diferente do campo "Preço customizado", que já tinha um flag
-- dedicado (clear_valor_customizado) pra esse caso exato. Como a tabela não
-- é recarregada após salvar, a UI continuava mostrando o campo vazio
-- (parecia ter funcionado) enquanto o banco mantinha a data antiga —
-- falha silenciosa, sem nenhuma mensagem de erro.
--
-- Mesmo padrão já usado pra valor_customizado: um flag booleano dedicado
-- pra "limpar de verdade", nunca dependendo de null ser ambíguo com
-- "não mudar".
create or replace function master_update_professional(
  prof_id uuid,
  new_status text default null,
  new_plan text default null,
  new_valor_customizado numeric default null,
  clear_valor_customizado boolean default false,
  new_billing_exempt boolean default null,
  new_trial_ends_at timestamptz default null,
  clear_trial_ends_at boolean default false
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
    trial_ends_at = case
      when clear_trial_ends_at then null
      when new_trial_ends_at is not null then new_trial_ends_at
      else trial_ends_at
    end
  where id = prof_id;
end;
$$;

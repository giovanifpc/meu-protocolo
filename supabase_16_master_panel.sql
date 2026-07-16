-- Painel master: e-mail dedicado (meuprotocolo1@gmail.com) com visão agregada
-- de todos os tenants + controle básico (status/plano/preço customizado).
-- Não é RLS direta em professionals (evitaria CRUD completo indesejado) —
-- usa RPCs SECURITY DEFINER que checam o e-mail do chamador internamente,
-- mesmo padrão de is_professional_email/is_student_email (supabase_03).

alter table professionals add column if not exists valor_customizado numeric;

create or replace function is_master_email(check_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select check_email = 'meuprotocolo1@gmail.com';
$$;

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
  alunos_count bigint
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.email, p.display_name, p.plan, p.status, p.valor_customizado,
         p.trial_ends_at, p.created_at,
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
  clear_valor_customizado boolean default false
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
    end
  where id = prof_id;
end;
$$;

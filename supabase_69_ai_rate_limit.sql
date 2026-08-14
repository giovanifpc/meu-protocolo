-- Rate limit nas 3 Edge Functions de IA (2026-08-14, item 3 da lista de
-- pendências pós-invasão) — hoje uma conta autenticada podia chamar
-- generate-workout/interpret-report/support-chat indefinidamente, sem
-- nenhum limite de repetição. Não é vazamento de dado de terceiro, é
-- abuso de custo (cada chamada gasta crédito real da API da Claude).
--
-- check_and_log_ai_call() resolve o chamador sempre contra
-- auth.jwt() ->> 'email' (nunca aceita um id como parâmetro) — mesmo
-- princípio já usado em is_professional_email()/is_master() hoje mais
-- cedo: se aceitasse um id como parâmetro, um usuário mal-intencionado
-- poderia inflar artificialmente o contador de OUTRA conta, negando
-- serviço de IA pra ela (ataque direcionado). Só function_name/limite
-- por hora são parâmetros, nunca identidade.
--
-- owner_id/owner_type genéricos (não só professional_id) porque
-- support-chat atende profissional E aluno — cada um com o próprio
-- contador, isolado. generate-workout/interpret-report só resolvem
-- profissional (sempre vão cair em owner_type='professional').
create table if not exists ai_call_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  owner_type text not null check (owner_type in ('professional', 'student')),
  function_name text not null,
  called_at timestamptz not null default now()
);
create index if not exists idx_ai_call_log_owner_fn_time on ai_call_log(owner_id, owner_type, function_name, called_at);
alter table ai_call_log enable row level security;
-- RLS habilitada, ZERO policy de propósito — mesmo padrão de bloqueio
-- total já usado em messages/support_messages/billing_events: acesso só
-- via a função abaixo (SECURITY DEFINER), nunca direto por PostgREST.

create or replace function check_and_log_ai_call(p_function_name text, p_limit_per_hour integer)
returns boolean -- true = permitido (e já registrou a chamada); false = limite atingido
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_owner_type text;
  v_count integer;
begin
  select id into v_owner_id from professionals where email = auth.jwt() ->> 'email';
  if v_owner_id is not null then
    v_owner_type := 'professional';
  else
    select id into v_owner_id from students where email = auth.jwt() ->> 'email';
    if v_owner_id is not null then
      v_owner_type := 'student';
    end if;
  end if;

  if v_owner_id is null then
    return false;
  end if;

  select count(*) into v_count
  from ai_call_log
  where owner_id = v_owner_id and owner_type = v_owner_type
    and function_name = p_function_name
    and called_at > now() - interval '1 hour';

  if v_count >= p_limit_per_hour then
    return false;
  end if;

  insert into ai_call_log (owner_id, owner_type, function_name) values (v_owner_id, v_owner_type, p_function_name);
  return true;
end;
$$;

revoke execute on function check_and_log_ai_call(text, integer) from public, anon;
grant execute on function check_and_log_ai_call(text, integer) to authenticated;

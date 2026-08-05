-- Achado real de varredura de fluxo (2026-08-05): master_create_professional
-- nunca checava se o e-mail digitado já pertence a um ALUNO (ou ao próprio
-- e-mail master) — só bloqueava e-mail já cadastrado como profissional
-- (unique_violation da própria tabela). Se o Giovani digitar por engano o
-- e-mail de um aluno já existente, isso reproduz exatamente a classe de
-- bug "vazamento de sessão entre papéis" (aluno↔profissional) já corrigida
-- várias vezes em index.html/onboarding.html/aluno.html — mas aqui a
-- origem seria o próprio painel master, sem nenhuma das travas que essas
-- outras telas ganharam. Mesmo princípio "garantia, não esperança" já
-- usado no resto do projeto: a checagem fica no servidor, não só na UI.
create or replace function master_create_professional(p_email text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text;
begin
  if auth.jwt() ->> 'email' <> 'meuprotocolo1@gmail.com' or auth.jwt() ->> 'aal' <> 'aal2' then
    raise exception 'Não autorizado.';
  end if;

  if p_email is null or p_email = '' then
    raise exception 'E-mail é obrigatório.';
  end if;
  if p_display_name is null or p_display_name = '' then
    raise exception 'Nome é obrigatório.';
  end if;

  v_email := lower(trim(p_email));

  if v_email = 'meuprotocolo1@gmail.com' then
    raise exception 'Esse e-mail é reservado pro painel master, não pode virar profissional.';
  end if;
  if exists (select 1 from students where email = v_email) then
    raise exception 'Esse e-mail já pertence a um aluno existente — não pode virar profissional também.';
  end if;

  insert into professionals (email, display_name, status, trial_ends_at)
  values (v_email, p_display_name, 'trial', now() + interval '14 days')
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Já existe um profissional cadastrado com esse e-mail.';
end;
$$;

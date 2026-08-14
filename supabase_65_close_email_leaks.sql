-- Fecha 2 falhas de segurança reais apontadas num relato externo (2026-08-14):
--
-- (1) is_professional_email(check_email)/is_student_email(check_email) eram
--     SECURITY DEFINER, aceitavam um e-mail QUALQUER como parâmetro e não
--     tinham nenhuma restrição de quem pode chamar — um oráculo de
--     enumeração: dava pra confirmar, sem estar logado com aquele e-mail
--     (nem logado de jeito nenhum, se anon tivesse execute), se um endereço
--     específico já é aluno/profissional cadastrado na plataforma. O único
--     uso real (login.html, dentro de routeAfterAuth) sempre chama com o
--     e-mail que ACABOU de ser autenticado via OTP (session.user.email) —
--     nunca precisou aceitar um e-mail arbitrário. Reescritas sem parâmetro
--     nenhum: resolvem sempre contra auth.jwt() ->> 'email' de quem chamou,
--     tornando o oráculo estruturalmente impossível (não é mais "a função
--     recusa educadamente", é "não existe parâmetro pra tentar outra coisa").
--
-- (2) o e-mail do master (meuprotocolo1@gmail.com) estava hardcoded em texto
--     puro em 5 arquivos client-side (login.html, index.html, aluno.html,
--     onboarding.html, master.html) — nunca foi a fronteira de segurança de
--     verdade (isso sempre foi a checagem aal2 dentro das RPCs do master),
--     mas expor o endereço real facilita phishing/engenharia social mirado
--     contra essa conta específica. Nova função is_master() decide isso no
--     servidor — o e-mail em si nunca mais precisa ser enviado pro browser.

-- ── 1. Fecha o oráculo de enumeração de e-mail ──────────────────────────
drop function if exists is_professional_email(text);
drop function if exists is_student_email(text);

create function is_professional_email()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from professionals
    where email = auth.jwt() ->> 'email' and status <> 'deletado'
  );
$$;

create function is_student_email()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from students where email = auth.jwt() ->> 'email'
  );
$$;

-- IMPORTANTE (achado ao aplicar pela 1ª vez, 2026-08-14): "revoke ... from
-- public" sozinho NÃO tira o acesso de anon — o Supabase concede EXECUTE a
-- anon/authenticated/service_role via default privilege do schema public na
-- criação da function, separado do papel PUBLIC. Revogar de public só afeta
-- quem herdava só por ali. Precisa revogar de anon explicitamente também,
-- senão a function continua chamável sem sessão nenhuma (confirmado
-- rodando contra produção: sem esta linha, anon ainda tinha EXECUTE).
revoke execute on function is_professional_email() from public, anon;
revoke execute on function is_student_email() from public, anon;
grant execute on function is_professional_email() to authenticated;
grant execute on function is_student_email() to authenticated;

-- ── 2. Tira o e-mail do master do código client-side ────────────────────
create or replace function is_master()
returns boolean
language sql
security definer
set search_path = public
as $$
  select auth.jwt() ->> 'email' = 'meuprotocolo1@gmail.com';
$$;

revoke execute on function is_master() from public, anon;
grant execute on function is_master() to authenticated;

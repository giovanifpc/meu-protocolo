-- Funções RPC de gate de autenticação (SECURITY DEFINER — leem antes de o JWT existir no contexto de RLS completo)

create or replace function is_professional_email(check_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from professionals
    where email = check_email and status <> 'deletado'
  );
$$;

create or replace function is_student_email(check_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from students where email = check_email
  );
$$;

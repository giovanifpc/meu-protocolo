-- Corrige "infinite recursion detected in policy for relation professionals".
-- Causa: a policy "student reads own professional" (em professionals) fazia
-- subquery direta em students, e "professional manages own students" (em
-- students) fazia subquery direta em professionals — cada leitura disparava
-- a checagem de RLS da outra tabela, entrando em loop.
-- Solução: isolar a leitura cruzada numa função SECURITY DEFINER, que
-- contorna a RLS na consulta interna (mesmo padrão de is_professional_email).

create or replace function my_student_professional_ids()
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select professional_id from students where email = auth.jwt() ->> 'email';
$$;

drop policy if exists "student reads own professional" on professionals;

create policy "student reads own professional"
  on professionals for select
  using (
    id in (select my_student_professional_ids())
  );
